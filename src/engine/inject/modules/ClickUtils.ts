/**
 * ClickUtils.ts - Shared low-level click utilities ported from the reference
 * antigravity-auto-accept plugin. Provides action text extraction, user-typing
 * detection, control exclusion, and the per-element cooldown click dispatcher.
 */
import { log, queryAll, getDocuments } from './DomUtils';
import './State';

/** Selector for interactive action nodes in Antigravity's DOM */
export const ACTION_NODE_SELECTOR = 'button, [role="button"], a[role="button"]';

/** Broader selector including div/span action wrappers */
export const INTERACTIVE_NODE_SELECTOR =
    'button, [role="button"], a[role="button"], div[class*="button"], span[class*="button"], div[class*="action"], span[class*="action"]';

/**
 * Extracts a unified lowercase action-text string from an element by combining
 * its textContent, title attribute, and aria-label. This is the foundation for
 * every pattern-match in the clicking pipeline.
 */
export function getActionText(el: HTMLElement | null): string {
    if (!el) return '';
    const text = (el?.textContent || '').trim();
    const title = (el?.getAttribute?.('title') || '').trim();
    const aria = (el?.getAttribute?.('aria-label') || '').trim();
    return `${text} ${title} ${aria}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Returns all interactive child nodes within a given root element.
 */
export function getInteractiveNodes(root: HTMLElement | Document | null): HTMLElement[] {
    try {
        return Array.from((root || document).querySelectorAll(INTERACTIVE_NODE_SELECTOR)) as HTMLElement[];
    } catch (e) {
        return [];
    }
}

/**
 * Detects whether the user is actively typing in a text input so we avoid
 * stealing their keystrokes with synthetic events.
 */
export function isUserTyping(): boolean {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return false;
    const tag = (active.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
        const t = ((active as HTMLInputElement).type || '').toLowerCase();
        return !['button', 'submit', 'checkbox', 'radio'].includes(t);
    }
    return !!active.isContentEditable;
}

/** Tokens that mark UI controls we must never auto-click */
const CONTROL_BLOCKLIST = [
    'auto accept', 'background', 'background mode', 'toggle on/off', 'setup cdp'
];

/**
 * Returns true if an element is part of the IDE chrome (menu bar, status bar,
 * sidebar, etc.) and should therefore never be auto-clicked unless it's inside
 * a recognised prompt container.
 */
export function isExcludedControl(el: HTMLElement, actionText?: string): boolean {
    if (!el) return true;
    const t = actionText || getActionText(el);

    if (CONTROL_BLOCKLIST.some(kw => t.includes(kw))) return true;

    const inStatusBar = !!el.closest(
        '#workbench\\.parts\\.statusbar, .statusbar, .part.statusbar'
    );
    if (inStatusBar) return true;

    const inPromptContext = !!el.closest(
        '[role="dialog"], .notification-toast, .notification-list-item, ' +
        '.monaco-dialog-box, .monaco-dialog-modal-block, .interactive-session, ' +
        '.chat-tool-call, .chat-tool-response, [class*="tool-call"], [data-testid*="tool-call"]'
    );

    const inWorkbenchChrome = !!el.closest(
        '.titlebar, .menubar, .activitybar, .sidebar, .composite.title, ' +
        '.tabs-container, .editor-actions, .action-bar'
    );
    if (inWorkbenchChrome && !inPromptContext) return true;

    return false;
}

/**
 * Finds the nearest prompt-container ancestor for a button. This is crucial
 * for scoring Run candidates — without a container the button is too
 * ambiguous to auto-click.
 */
export function findActionContext(btn: HTMLElement): HTMLElement | null {
    const direct = btn.closest(
        '[role="dialog"], .notification-toast, .notification-list-item, ' +
        '.monaco-dialog-box, .monaco-dialog-modal-block, .chat-tool-call, ' +
        '.chat-tool-response, [class*="tool-call"], [data-testid*="tool-call"]'
    ) as HTMLElement | null;
    if (direct) return direct;

    let node: HTMLElement | null = btn.parentElement;
    let depth = 0;
    while (node && depth < 10) {
        try {
            const neighbors = Array.from(node.querySelectorAll(ACTION_NODE_SELECTOR)) as HTMLElement[];
            const hasRejectOrAlwaysRun = neighbors.some(el => {
                const t = getActionText(el);
                return /\breject\b/i.test(t) || /\balways\s+run\b/i.test(t);
            });
            if (hasRejectOrAlwaysRun) return node;
        } catch (e) { /* swallow */ }
        node = node.parentElement;
        depth++;
    }
    return null;
}

/** Set of elements already clicked in the current polling cycle */
const clickedElements = new WeakSet<HTMLElement>();

/**
 * Clicks an element with per-element cooldown protection (1400 ms) and all
 * the safety checks from the reference plugin.
 * @returns true if the click was dispatched
 */
export function clickElement(el: HTMLElement, reason = ''): boolean {
    if (!el || clickedElements.has(el)) return false;

    try {
        const bypassExclude = reason === 'run-prompt';
        if (!bypassExclude && isExcludedControl(el)) return false;

        const now = Date.now();
        const lastClickedAt = Number(el.getAttribute?.('data-aaf-clicked-at') || 0);
        if (lastClickedAt > 0 && (now - lastClickedAt) < 1400) return false;

        // 1. Precise Visibility check in layout tree
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || rect.top >= (window.innerHeight || document.documentElement.clientHeight) || rect.bottom <= 0 || rect.left >= (window.innerWidth || document.documentElement.clientWidth) || rect.right <= 0) {
            return false; // element not visible in viewport
        }

        // 2. Pre-Execution Scanning for Banned Commands
        const actionContext = findActionContext(el);
        const state = window.__autoAcceptState;
        if (state && Array.isArray(state.bannedCommands) && state.bannedCommands.length > 0 && actionContext) {
            const preBlocks = Array.from(actionContext.querySelectorAll('pre, code'));
            const fullText = preBlocks.map(block => block.textContent || '').join('\n').toLowerCase();
            
            for (const banPattern of state.bannedCommands) {
                if (fullText.includes(banPattern.toLowerCase())) {
                    log(`[CDP Engine] Click blocked by Banned Command pattern: "${banPattern}"`);
                    if (window.__cdpTelemetry) {
                         window.__cdpTelemetry(`Action blocked by banned command filter: ${banPattern}`);
                    }
                    return false;
                }
            }
        }

        if (typeof el.click === 'function') el.click();

        el.dispatchEvent(new MouseEvent('click', {
            view: window, bubbles: true, cancelable: true
        }));

        clickedElements.add(el);
        try { el.setAttribute('data-aaf-clicked-at', String(now)); } catch (e) { /* */ }

        log(`Clicked element (${reason}): "${getActionText(el).slice(0, 60)}"`);
        if (window.__cdpTelemetry) {
            window.__cdpTelemetry(`CDP Auto-Accept: ${reason}`);
        }
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Scans the full document body text for contextual DOM markers that indicate
 * Antigravity is waiting for a step-input approval (Run / Reject prompt).
 */
export function hasStepInputMarkers(): boolean {
    const markers = [
        'step requires input', 'ask every time', 'reject | run',
        'run command', 'command?', 'runalt+',
        'agent execution terminated due to error', 'continue generating'
    ];
    for (const doc of getDocuments()) {
        try {
            const text = ((doc.body && doc.body.textContent) || '').toLowerCase();
            if (markers.some(m => text.includes(m))) return true;
        } catch (e) { /* */ }
    }
    return false;
}

/**
 * Detects error-recovery markers like "agent execution terminated due to error"
 * so the Continue Generating button can be auto-clicked.
 */
export function hasErrorRecoveryMarkers(): boolean {
    const markers = [
        'agent execution terminated due to error',
        'terminated due to error', 'continue generating', 'execution error'
    ];
    for (const doc of getDocuments()) {
        try {
            const text = ((doc.body && doc.body.textContent) || '').toLowerCase();
            if (markers.some(m => text.includes(m))) return true;
        } catch (e) { /* */ }
    }
    return false;
}
