/**
 * ClickingEngine.ts - Master orchestrator for auto-accepting Antigravity prompts.
 *
 * Faithfully ported from the reference antigravity-auto-accept-master plugin.
 * The reference uses a strict priority cascade:
 *   1. Permission prompts (Allow / Always Allow / Allow Once)
 *   1.01. Global fallback for permission prompts outside containers
 *   1.55. Error recovery (Continue Generating)
 *   1.5. Run command prompts (scored candidates)
 *   1.51. Run fallback in non-standard elements
 *   1.52. Strict global fallback for Run
 *   1.56. Hidden Expand buttons
 *   1.57. "Ask every time" Allow buttons
 *   Alt+Enter keyboard shortcut fallback
 *   1.6. Continue paused/interrupted flow
 */
import { log, queryAll, getDocuments } from './DomUtils';
import {
    ACTION_NODE_SELECTOR,
    getActionText,
    getInteractiveNodes,
    clickElement,
    findActionContext,
    isExcludedControl,
    hasStepInputMarkers,
    hasErrorRecoveryMarkers,
    isUserTyping
} from './ClickUtils';
import {
    isPermissionPromptContainer,
    tryApprovePermissionInContainer
} from './PermissionHandler';
import {
    isRunActionText,
    handleRunPrompts,
    handleRunFallback,
    handleRunStrictGlobal,
    triggerRunShortcut
} from './RunDetection';
import './State';

/** Prompt container selectors used across multiple phases */
const PROMPT_CONTAINERS_SEL =
    '[role="dialog"], .notification-toast, .notification-list-item, ' +
    '.monaco-dialog-box, .monaco-dialog-modal-block, ' +
    '.chat-tool-call, .chat-tool-response, [class*="tool-call"], ' +
    '[data-testid*="tool-call"], .antigravity-agent-side-panel';

/**
 * Master click handler. Runs on every polling cycle.
 * Returns the number of elements clicked during this cycle.
 */
export function clickAcceptButtons(): number {
    if (window.__autoAcceptState?.userInteracting) return 0;

    let clickedCount = 0;

    // Gather all prompt containers and their child buttons once
    const promptContainers = queryAll(PROMPT_CONTAINERS_SEL);
    const allActionButtons: HTMLElement[] = [];
    const seenBtns = new Set<HTMLElement>();
    for (const container of promptContainers) {
        try {
            const btns = Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR)) as HTMLElement[];
            for (const btn of btns) {
                if (!seenBtns.has(btn)) { seenBtns.add(btn); allActionButtons.push(btn); }
            }
        } catch (e) { /* */ }
    }

    // ─── PHASE 1: Permission prompts ────────────────────────────
    for (const container of promptContainers) {
        if (tryApprovePermissionInContainer(container, 'prompt-scope')) return 1;
    }

    // ─── PHASE 1.01: Global fallback for permission prompts ─────
    if (allActionButtons.length > 0) {
        const seenScopes = new Set<HTMLElement>();
        for (const btn of allActionButtons) {
            const btnText = getActionText(btn);
            if (!btnText) continue;
            const hasPermLabel =
                /\ballow\s+once\b/i.test(btnText) ||
                /\ballow(\s+for)?\s+this\s+conversation\b/i.test(btnText) ||
                /\bdeny\b/i.test(btnText) ||
                /\breject\b/i.test(btnText);
            if (!hasPermLabel) continue;

            let node: HTMLElement | null = btn;
            let depth = 0;
            while (node && depth < 10) {
                if (!seenScopes.has(node)) {
                    seenScopes.add(node);
                    if (tryApprovePermissionInContainer(node, 'global-fallback')) return 1;
                }
                node = node.parentElement;
                depth++;
            }
        }
    }

    // ─── PHASE 1.55: Error recovery (Continue Generating) ───────
    if (hasErrorRecoveryMarkers()) {
        for (const btn of allActionButtons) {
            const text = getActionText(btn);
            if (text.includes('continue generating') || /^continue(\b|\s)/i.test(text)) {
                if (clickElement(btn)) {
                    log(`Error recovery: "${text}"`);
                    return 1;
                }
            }
        }
    }

    // ─── PHASE 1.5: Run command prompts (scored) ────────────────
    clickedCount = handleRunPrompts(allActionButtons);
    if (clickedCount > 0) return clickedCount;

    // ─── PHASE 1.51: Run fallback in non-standard elements ──────
    clickedCount = handleRunFallback(promptContainers, allActionButtons);
    if (clickedCount > 0) return clickedCount;

    // ─── PHASE 1.52: Strict global fallback for Run ─────────────
    clickedCount = handleRunStrictGlobal();
    if (clickedCount > 0) return clickedCount;

    // ─── PHASE 1.56: Expand buttons hiding Run ──────────────────
    const hasStrictStepInput = (() => {
        for (const doc of getDocuments()) {
            try {
                const text = ((doc.body && doc.body.textContent) || '').toLowerCase();
                if (text.includes('step requires input') || text.includes('requires input')) return true;
            } catch (e) { /* */ }
        }
        return false;
    })();

    if (hasStrictStepInput) {
        const freeState = (window as any).__autoAcceptFreeState || {};
        const now = Date.now();
        if ((freeState.lastExpandClickAt || 0) + 1200 <= now) {
            for (const btn of allActionButtons) {
                const text = getActionText(btn);
                if (!/\bexpand\b/i.test(text) || /\bexpand\s+all\b/i.test(text)) continue;

                const container = findActionContext(btn) || btn.parentElement as HTMLElement;
                const ctxText = getActionText(container || btn);
                const neighbors = container ? Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR)) as HTMLElement[] : [];
                const hasRunOrReject = neighbors.some(el => {
                    const t = getActionText(el);
                    return isRunActionText(t) || /\breject\b/i.test(t) || /\balways\s+run\b/i.test(t);
                });
                const hasStepMarker = ['step requires input', 'ask every time', 'requires input'].some(m => ctxText.includes(m));

                if ((hasRunOrReject || hasStepMarker) && clickElement(btn)) {
                    freeState.lastExpandClickAt = now;
                    (window as any).__autoAcceptFreeState = freeState;
                    log(`Expand clicked: "${text}"`);
                    return 1;
                }
            }
        }
    }

    // ─── PHASE 1.57: "Ask every time" Allow buttons ─────────────
    if (hasStepInputMarkers()) {
        for (const btn of allActionButtons) {
            const text = getActionText(btn);
            const isAllowAction = /\ballow\b/i.test(text) || /\bapprove\b/i.test(text) || /\bgrant\b/i.test(text);
            if (!isAllowAction) continue;
            if (/\ballowlist\b|\bdeny\b|\breject\b|\bcancel\b|\bconfigure\b|\bsettings?\b/i.test(text)) continue;

            const container = findActionContext(btn) || btn.parentElement as HTMLElement;
            const ctxText = getActionText(container || btn);
            const neighbors = container ? Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR)) as HTMLElement[] : [];
            const hasReject = neighbors.some(el => /\breject\b|\bdeny\b|\bcancel\b/i.test(getActionText(el)));
            const hasInput = ['step requires input', 'ask every time', 'requires input', 'permission', 'browser'].some(m => ctxText.includes(m));

            if ((hasInput || hasReject) && clickElement(btn)) {
                log(`Step permission: "${text}"`);
                return 1;
            }
        }
    }

    // ─── Alt+Enter shortcut fallback ────────────────────────────
    if ((hasStepInputMarkers() || hasStrictStepInput) && triggerRunShortcut(allActionButtons)) {
        return 1;
    }

    // ─── PHASE 1.6: Continue paused/interrupted flow ────────────
    for (const btn of allActionButtons) {
        const text = getActionText(btn);
        if (!/\bcontinue\b/i.test(text)) continue;

        const container = findActionContext(btn);
        if (!container) continue;
        const ctxText = getActionText(container);
        const neighbors = Array.from(container.querySelectorAll(ACTION_NODE_SELECTOR)) as HTMLElement[];
        const hasPause = ['stopped', 'paused', 'interrupted', 'retry', 'continue'].some(w => ctxText.includes(w));
        const hasControlPair = neighbors.some(el => /\b(reject|cancel|retry|stop)\b/i.test(getActionText(el)));
        const hasInputSignal = ['step requires input', 'requires input', 'ask every time', 'continue generating'].some(w => ctxText.includes(w));

        if ((hasPause || hasControlPair || hasInputSignal) && clickElement(btn)) {
            log(`Flow resumed: "${text}"`);
            return 1;
        }
    }

    return clickedCount;
}
