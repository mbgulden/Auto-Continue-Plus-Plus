import { log, queryAll, isElementVisible, findAgentPanel } from './DomUtils';
import { updateTabNames, updateConversationCompletionState, markTabCompleted, stripTimeSuffix } from './OverlayManager';
import './State';

const CURSOR_TAB_SELECTORS = [
    '#workbench\\.parts\\.auxiliarybar ul[role="tablist"] li[role="tab"]',
    '.monaco-pane-view .monaco-list-row[role="listitem"]',
    'div[role="tablist"] div[role="tab"]',
    '.chat-session-item'
];

const ANTIGRAVITY_TAB_SELECTOR = 'button.grow';
const NEW_CONVERSATION_SELECTOR = "[data-tooltip-id='new-conversation-tooltip']";

export function collectVisibleConversationText(maxChars: number = 12000): string {
    const root = findAgentPanel() || document.body;
    if (!root) return '';

    const selectors = [
        '[data-role="assistant"]',
        '[data-testid*="assistant"]',
        '.assistant',
        '.message.assistant',
        '.chat-message',
        '.markdown',
        'article',
        'p',
        'li',
        'pre',
        'code'
    ];

    const snippets: string[] = [];
    const seen = new Set<string>();
    let total = 0;
    let stop = false;

    for (const selector of selectors) {
        if (stop) break;
        let elements: Element[] = [];
        try {
            elements = Array.from(root.querySelectorAll(selector));
        } catch (e) {
            elements = [];
        }
        for (const el of elements) {
            if (!isElementVisible(el as HTMLElement)) continue;
            let text = ((el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.length < 24) continue;
            if (text.length > 1800) {
                text = `${text.slice(0, 1800)}...`;
            }
            const key = text.slice(0, 160);
            if (seen.has(key)) continue;
            seen.add(key);
            snippets.push(text);
            total += text.length + 2;
            if (total >= maxChars) {
                stop = true;
                break;
            }
        }
    }

    if (snippets.length === 0) {
        const fallback = ((root as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
        return fallback.slice(0, maxChars);
    }

    return snippets.join('\n\n').slice(0, maxChars);
}

export function hasCompilationErrors(): boolean {
    const errorBadges = queryAll('.codicon-error, .codicon-warning, [class*="marker-count"]');
    for (const badge of errorBadges) {
        const text = (badge.textContent || '').trim();
        const num = parseInt(text, 10);
        if (!isNaN(num) && num > 0) return true;
    }

    const errorDecorations = queryAll('.squiggly-error, .monaco-editor .squiggly-error');
    if (errorDecorations.length > 0) return true;

    return false;
}

export function isSessionActive(state: any, sessionID: number): boolean {
    return state.isRunning && state.sessionID === sessionID;
}

export async function cursorTabLoop(sessionID: number): Promise<void> {
    log('[TabLoop] Cursor tab cycling started');
    let index = 0;
    let cycle = 0;
    const state = window.__autoAcceptState;
    if (state) state._noTabCycles = 0;

    while (state && isSessionActive(state, sessionID)) {
        cycle++;

        let tabs: HTMLElement[] = [];
        for (const selector of CURSOR_TAB_SELECTORS) {
            tabs = queryAll(selector);
            if (tabs.length > 0) break;
        }

        if (tabs.length === 0 && state) {
            state._noTabCycles++;
        } else if (state) {
            state._noTabCycles = 0;
        }

        updateTabNames(tabs);

        if (tabs.length > 0) {
            const targetTab = tabs[index % tabs.length];
            const tabLabel = targetTab.getAttribute('aria-label') || targetTab.textContent?.trim() || 'unnamed';
            log(`[TabLoop] Cycle ${cycle}: Switching to tab "${tabLabel.substring(0, 40)}"`);
            targetTab.dispatchEvent(new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            }));
            index++;
        }

        await new Promise(r => setTimeout(r, 3000));
    }

    log('[TabLoop] Cursor tab cycling stopped');
}

export async function antigravityTabLoop(sessionID: number): Promise<void> {
    log('[TabLoop] Antigravity tab cycling started');
    let index = 0;
    let cycle = 0;
    const state = window.__autoAcceptState;
    if (state) state._noTabCycles = 0;

    while (state && isSessionActive(state, sessionID)) {
        cycle++;

        const allSpans = queryAll('span');
        const feedbackBadges = allSpans.filter(s => {
            const t = s.textContent?.trim() || '';
            return t === 'Good' || t === 'Bad';
        });
        log(`[TabLoop] Cycle ${cycle}: ${feedbackBadges.length} badges on current tab`);

        const nt = queryAll(NEW_CONVERSATION_SELECTOR)[0];
        if (nt) nt.click();

        await new Promise(r => setTimeout(r, 1500));
        if (!isSessionActive(state, sessionID)) break;

        const tabs = queryAll(ANTIGRAVITY_TAB_SELECTOR);

        if (tabs.length === 0 && state) {
            state._noTabCycles++;
            log(`[TabLoop] Cycle ${cycle}: No tabs found (consecutive: ${state._noTabCycles})`);
        } else if (state) {
            state._noTabCycles = 0;
        }

        updateTabNames(tabs);

        let clickedTabName: string | null = null;
        if (tabs.length > 0) {
            const targetTab = tabs[index % tabs.length];
            clickedTabName = stripTimeSuffix(targetTab.textContent || '');
            log(`[TabLoop] Cycle ${cycle}: Switching to tab "${clickedTabName}"`);
            targetTab.dispatchEvent(new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            }));
            index++;
        }

        await new Promise(r => setTimeout(r, 1500));
        if (!isSessionActive(state, sessionID)) break;

        const allSpansAfter = queryAll('span');
        const feedbackTexts = allSpansAfter
            .filter(s => {
                const t = s.textContent?.trim() || '';
                return t === 'Good' || t === 'Bad';
            })
            .map(s => s.textContent?.trim() || '');

        if (clickedTabName && feedbackTexts.length > 0) {
            const hasErrors = hasCompilationErrors();
            const finalStatus = hasErrors ? 'done-errors' : 'done';
            updateConversationCompletionState(clickedTabName, finalStatus);

            const deduplicatedNames = state.tabNames || [];
            const currentIndex = (index - 1) % deduplicatedNames.length;
            const deduplicatedName = deduplicatedNames[currentIndex];
            if (deduplicatedName) {
                markTabCompleted(deduplicatedName);
            }

            if (hasErrors) {
                log(`[TabLoop] Cycle ${cycle}: Tab "${clickedTabName}" completed WITH errors`);
            }
        }

        log(`[TabLoop] Cycle ${cycle}: ${state.tabNames?.length || 0} tabs, completions: ${JSON.stringify(state.completionStatus)}`);

        await new Promise(r => setTimeout(r, 3000));
    }

    log('[TabLoop] Antigravity tab cycling stopped');
}
