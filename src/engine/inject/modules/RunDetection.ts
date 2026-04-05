/**
 * RunDetection.ts - Handles the detection and scoring of "Run" command prompts
 * in Antigravity's UI. Ported from the reference plugin (lines 121-874).
 *
 * The critical insight: Antigravity's "Run" button is NOT a simple button.
 * It lives inside a compound prompt UI that shows "Reject | Run Alt+Enter".
 * This module uses context-scoring to find the best candidate and also
 * dispatches the Alt+Enter keyboard shortcut as a fallback.
 */
import { log, queryAll, getDocuments } from './DomUtils';
import {
    ACTION_NODE_SELECTOR,
    getActionText,
    getInteractiveNodes,
    clickElement,
    findActionContext,
    isExcludedControl,
    isUserTyping,
    hasStepInputMarkers
} from './ClickUtils';
import { isPermissionPromptContainer } from './PermissionHandler';
import './State';

/**
 * Detects whether raw text represents a "Run" action button.
 * Explicitly excludes "Always Run", "Run in terminal", and "running".
 */
export function isRunActionText(rawText: string): boolean {
    const t = String(rawText || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (/\balways\s+run\b/i.test(t)) return false;
    if (/\brun\s+in\s+terminal\b/i.test(t)) return false;
    if (/\brunning\b/i.test(t)) return false;
    return /^\s*run/i.test(t) || /\brun\b/i.test(t) || /runalt\+/i.test(t);
}

/**
 * Generates a signature string for a Run prompt so we can detect duplicate
 * approvals for the same prompt within a short cooldown window.
 */
function getRunPromptSignature(btn: HTMLElement, container: HTMLElement | null): string {
    const context = container || findActionContext(btn) || btn?.parentElement || btn;
    const parts: string[] = [];
    const buttonText = getActionText(btn);
    if (buttonText) parts.push(buttonText);
    const contextText = String(context?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (contextText) parts.push(contextText.slice(0, 260));
    return parts.join(' || ').slice(0, 320);
}

/** State interface for the free-edition auto-accept globals */
interface AutoAcceptFreeState {
    lastRunShortcutAt?: number;
    lastRunPromptApproveAt?: number;
    lastRunPromptSig?: string;
    lastPermissionClickAt?: number;
    lastPermissionX?: number;
    lastPermissionY?: number;
    permissionApprovals?: number;
    lastExpandClickAt?: number;
    terminalCommands?: number;
    lastAction?: string;
    lastActionLabel?: string;
}

/** Access the free-edition global state object */
function getFreeState(): AutoAcceptFreeState {
    return ((window as any).__autoAcceptFreeState || {}) as AutoAcceptFreeState;
}

/** Persist changes to the free-edition global state */
function setFreeState(patch: Partial<AutoAcceptFreeState>): void {
    (window as any).__autoAcceptFreeState = { ...getFreeState(), ...patch };
}

/** Returns true if the same Run prompt was approved within the last 15s */
function wasRunPromptApprovedRecently(signature: string, now = Date.now()): boolean {
    if (!signature) return false;
    const state = getFreeState();
    return state.lastRunPromptSig === signature &&
           (now - Number(state.lastRunPromptApproveAt || 0)) < 15000;
}

/** Records a Run prompt approval into the global state */
function recordRunPromptApproval(signature: string, label: string): void {
    setFreeState({
        lastRunPromptSig: signature || getFreeState().lastRunPromptSig || '',
        lastRunPromptApproveAt: Date.now(),
        terminalCommands: (getFreeState().terminalCommands || 0) + 1,
        lastAction: 'run-prompt',
        lastActionLabel: String(label || '').slice(0, 180)
    });
}

/**
 * Dispatches the Alt+Enter keyboard shortcut to approve a Run prompt.
 * This is the PRIMARY mechanism that makes the "Run" button work in
 * Antigravity — the button is often just a label for Alt+Enter.
 */
export function triggerRunShortcut(allActionButtons: HTMLElement[]): boolean {
    try {
        if (isUserTyping()) return false;

        const state = getFreeState();
        const now = Date.now();
        if ((state.lastRunShortcutAt || 0) + 4000 > now) return false;

        // Only send shortcut when a visible run-command prompt exists
        const promptScopes = queryAll(
            '[role="dialog"], .notification-toast, .notification-list-item, ' +
            '.monaco-dialog-box, .monaco-dialog-modal-block, .interactive-session, ' +
            '.chat-tool-call, .chat-tool-response, [class*="tool-call"], [data-testid*="tool-call"], .antigravity-agent-side-panel'
        );
        const prompt = promptScopes.find(node => {
            const t = getActionText(node);
            if (!t) return false;
            return t.includes('run command') || t.includes('ask every time') ||
                   t.includes('step requires input') ||
                   (t.includes('reject') && (t.includes('run') || t.includes('runalt')));
        });
        if (!prompt) return false;

        const promptSig = ((prompt.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()).slice(0, 260);
        const lastRunPromptAt = Math.max(
            Number(state.lastRunShortcutAt || 0),
            Number(state.lastRunPromptApproveAt || 0)
        );
        if (promptSig && state.lastRunPromptSig === promptSig && (now - lastRunPromptAt) < 12000) {
            return false;
        }

        const targets = [document.activeElement, document.body, document.documentElement].filter(Boolean) as HTMLElement[];
        for (const target of targets) {
            const opts: KeyboardEventInit = {
                key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true, altKey: true
            };
            target.dispatchEvent(new KeyboardEvent('keydown', opts));
            target.dispatchEvent(new KeyboardEvent('keypress', opts));
            target.dispatchEvent(new KeyboardEvent('keyup', opts));
        }

        setFreeState({ lastRunShortcutAt: now, lastRunPromptApproveAt: now, lastRunPromptSig: promptSig });
        log('Alt+Enter shortcut dispatched for Run prompt');
        return true;
    } catch (e) {
        return false;
    }
}

/** Context markers that indicate a run-command prompt */
const STEP_MARKERS = [
    'run command', 'ask every time', 'step requires input', 'requires input',
    'run alt', 'runalt', 'alt+enter', 'alt+', 'always run', 'command?'
];

/**
 * Searches all action buttons for Run candidates, scores them based on
 * surrounding context, and clicks the highest-scoring one.
 * @returns number of clicks dispatched
 */
export function handleRunPrompts(allActionButtons: HTMLElement[]): number {
    const nowForRun = Date.now();
    const runCandidates: Array<{ btn: HTMLElement; text: string; score: number; signature: string }> = [];

    const hasRecentPermissionOrigin = queryAll('[data-aaf-permission-origin-at]').some(node => {
        try {
            const ts = Number(node.getAttribute('data-aaf-permission-origin-at') || 0);
            return ts > 0 && (nowForRun - ts) < 8000;
        } catch (e) { return false; }
    });

    for (const btn of allActionButtons) {
        const text = getActionText(btn);
        if (!isRunActionText(text)) continue;

        const container = findActionContext(btn);
        if (!container) continue;
        const promptSignature = getRunPromptSignature(btn, container);
        if (wasRunPromptApprovedRecently(promptSignature, nowForRun)) continue;

        const containerText = getActionText(container);
        const neighbors = Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR)) as HTMLElement[];
        if (isPermissionPromptContainer(containerText, neighbors)) continue;

        const permOriginAt = Number(container.getAttribute?.('data-aaf-permission-origin-at') || 0);
        const isFromRecentPerm = permOriginAt > 0 && (nowForRun - permOriginAt) < 8000;
        if (hasRecentPermissionOrigin && !isFromRecentPerm) continue;

        const hasReject = neighbors.some(el => /\breject\b/i.test(getActionText(el)));
        const hasAlwaysRun = neighbors.some(el => /\balways\s+run\b/i.test(getActionText(el)));

        let score = 0;
        if (hasReject) score += 4;
        if (hasAlwaysRun) score += 3;
        if (containerText.includes('step requires input') || containerText.includes('requires input')) score += 5;
        if (containerText.includes('ask every time')) score += 3;
        if (containerText.includes('run alt') || containerText.includes('runalt')) score += 2;
        if (containerText.includes('continue generating')) score += 2;
        if (/\brun\s*alt/i.test(text) || /runalt/i.test(text)) score += 2;
        if (/\brun\s+in\s+terminal\b/i.test(text)) score -= 2;
        if (isFromRecentPerm) score += 12;

        if (score > 0) runCandidates.push({ btn, text, score, signature: promptSignature });
    }

    if (runCandidates.length > 0) {
        runCandidates.sort((a, b) => b.score - a.score);
        const best = runCandidates[0];
        if (clickElement(best.btn, 'run-prompt')) {
            recordRunPromptApproval(best.signature, best.text);
            log(`Run approved: "${best.text}" (score=${best.score})`);
            return 1;
        }
    }
    return 0;
}

/**
 * Fallback: scans prompt containers for Run buttons in non-standard elements.
 */
export function handleRunFallback(
    promptContainers: HTMLElement[],
    allActionButtons: HTMLElement[]
): number {
    if (!hasStepInputMarkers()) return 0;

    for (const container of promptContainers) {
        const runFallback = getInteractiveNodes(container).find(el => {
            const t = getActionText(el);
            if (!t || !isRunActionText(t)) return false;
            if (/\breject\b|\bdeny\b|\bcancel\b|\bconfigure\b|\bsettings?\b/i.test(t)) return false;
            if (isExcludedControl(el, t)) return false;

            const scope = findActionContext(el) || container || el.parentElement;
            const ctxText = getActionText(scope as HTMLElement || el);
            const scopeButtons = scope ? getInteractiveNodes(scope as HTMLElement) : [];
            if (scope && isPermissionPromptContainer(ctxText, scopeButtons)) return false;
            return STEP_MARKERS.some(m => ctxText.includes(m));
        });

        if (runFallback) {
            const sig = getRunPromptSignature(runFallback, container);
            if (!wasRunPromptApprovedRecently(sig) && clickElement(runFallback, 'run-prompt')) {
                recordRunPromptApproval(sig, getActionText(runFallback));
                log(`Run fallback: "${getActionText(runFallback)}"`);
                return 1;
            }
        }
    }
    return 0;
}

/**
 * Strict global fallback: walks the entire DOM for Run buttons that have
 * context containers with Reject nearby or step markers present.
 */
export function handleRunStrictGlobal(): number {
    const strictCandidates: Array<{ btn: HTMLElement; text: string; score: number; signature: string }> = [];
    const allBtns = queryAll(ACTION_NODE_SELECTOR);

    const findRunPromptContext = (btn: HTMLElement): HTMLElement | null => {
        let node: HTMLElement | null = btn;
        let depth = 0;
        while (node && depth < 12) {
            try {
                const contextText = getActionText(node);
                const neighbors = Array.from(node.querySelectorAll(ACTION_NODE_SELECTOR)) as HTMLElement[];
                const hasRejectNearby = neighbors.some(el => /\breject\b|\bdeny\b|\bcancel\b/i.test(getActionText(el)));
                const hasRunNearby = neighbors.some(el => isRunActionText(getActionText(el)));
                const hasStepMarker = STEP_MARKERS.some(m => contextText.includes(m));
                if ((hasRejectNearby && hasRunNearby) || hasStepMarker) return node;
            } catch (e) { /* */ }
            node = node.parentElement;
            depth++;
        }
        return null;
    };

    for (const btn of allBtns) {
        const text = getActionText(btn);
        if (!text || !isRunActionText(text)) continue;
        if (/\brun\s+in\s+terminal\b/i.test(text)) continue;
        if (/\breject\b|\bdeny\b|\bcancel\b|\bconfigure\b|\bsettings?\b/i.test(text)) continue;
        if (isExcludedControl(btn, text)) continue;

        const context = findActionContext(btn) || findRunPromptContext(btn);
        if (!context) continue;
        const sig = getRunPromptSignature(btn, context);
        if (wasRunPromptApprovedRecently(sig)) continue;

        const ctxText = getActionText(context);
        const neighbors = Array.from(context.querySelectorAll(ACTION_NODE_SELECTOR)) as HTMLElement[];
        const hasReject = neighbors.some(el => /\breject\b|\bdeny\b|\bcancel\b/i.test(getActionText(el)));
        const hasStep = STEP_MARKERS.some(m => ctxText.includes(m));
        if (!hasReject && !hasStep) continue;

        let score = 0;
        if (hasReject) score += 4;
        if (hasStep) score += 4;
        if (/\brun\s*alt/i.test(text) || /runalt/i.test(text)) score += 2;
        if (isRunActionText(text)) score += 1;
        strictCandidates.push({ btn, text, score, signature: sig });
    }

    if (strictCandidates.length > 0) {
        strictCandidates.sort((a, b) => b.score - a.score);
        const best = strictCandidates[0];
        if (clickElement(best.btn, 'run-prompt')) {
            recordRunPromptApproval(best.signature, best.text);
            log(`Run strict fallback: "${best.text}" (score=${best.score})`);
            return 1;
        }
    }
    return 0;
}
