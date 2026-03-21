import { log, queryAll } from './DomUtils';
import { findNearbyCommandText, isCommandBanned } from './BannedCommands';
import './State';

const acceptPatterns = ['accept', 'run', 'always run', 'retry', 'apply', 'execute', 'confirm', 'always allow', 'allow once', 'allow', 'approve', 'save', 'accept all', 'allow for this conversation', 'allow this conversation'];
const rejectPatterns = ['skip', 'reject', 'cancel', 'close', 'refine'];

function isAcceptButton(el: HTMLElement): boolean {
    let text = (el.textContent || '').trim().toLowerCase();
    if (text.length === 0) {
        text = (el.getAttribute('title') || el.getAttribute('aria-label') || '').trim().toLowerCase();
    }
    if (text.length === 0 || text.length > 50) return false;

    // Explicitly ignore split-button dropdown chevrons
    const isDropdown = el.classList.contains('codicon-chevron-down') ||
                       (typeof el.className === 'string' && el.className.includes('dropdown'));
    if (isDropdown) return false;

    for (const rp of rejectPatterns) {
        if (text.indexOf(rp) !== -1) return false;
    }
    let matched = false;
    for (const ap of acceptPatterns) {
        if (text.indexOf(ap) !== -1) { matched = true; break; }
    }
    if (!matched) return false;

    // Check banned commands for run/execute buttons
    if (text.includes('run') || text.includes('execute')) {
        const nearbyText = findNearbyCommandText(el);
        if (isCommandBanned(nearbyText)) return false;
    }

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && rect.width > 0 && style.pointerEvents !== 'none' && !(el as HTMLButtonElement).disabled;
}

function getButtonSelectors(): string[] {
    const state = window.__autoAcceptState;
    const ide = state ? state.ide : 'cursor';
    if (ide === 'antigravity') {
        return ['button', 'vscode-button', '.bg-ide-button-background', 'button.bg-primary', 'button.rounded-l', '[class*="button"]', '.codicon', '.action-label'];
    }
    return ['button', 'vscode-button', '[class*="button"]', '[class*="anysphere"]', 'a[role="button"]', '.action-label', '.codicon'];
}

function checkCircuitBreaker(): boolean {
    const now = Date.now();
    const state = window.__autoAcceptState;
    if (state) {
        state._recoveryTS = (state._recoveryTS || []).filter(ts => now - ts < 10000);
        if (state._recoveryTS.length >= 5) {
            console.warn("[AutoAccept] CIRCUIT BREAKER TRIPPED! Infinite loop detected.");
            return true;
        }
    }
    return false;
}

export function clickAcceptButtons(): number {
    if (window.__autoAcceptState?.userInteracting || checkCircuitBreaker()) return 0;
    const selectors = getButtonSelectors();
    let clicked = 0;
    for (const selector of selectors) {
        const els = queryAll(selector);
        for (const el of els) {
            if (isAcceptButton(el)) {
                const btnText = (el.textContent || '').trim();
                log(`Clicking: "${btnText}"`);

                const activeEl = document.activeElement as HTMLElement | null;
                const scrollY = window.scrollY;
                const scrollX = window.scrollX;
                const panel = el.closest('.auxiliary-bar-container') || el.closest('#workbench\\.parts\\.auxiliarybar') || el.closest('#antigravity\\.agentPanel');
                const panelScroll = panel ? panel.scrollTop : 0;

                if (!document.body.contains(el)) continue;

                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const topElement = document.elementFromPoint(cx, cy) as HTMLElement | null;

                let originalPointerEvents: string | null = null;
                if (topElement && topElement !== el && !el.contains(topElement)) {
                    originalPointerEvents = topElement.style.pointerEvents;
                    topElement.style.pointerEvents = 'none';
                    log("Temporarily disabled blocking overlay");
                }

                const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
                for (const eventName of events) {
                    try {
                        const eventType = eventName.startsWith('pointer') ? window.PointerEvent : window.MouseEvent;
                        if (eventName.startsWith('pointer') && typeof window.PointerEvent === 'undefined') {
                            continue;
                        }

                        const ev = new ((eventType as any) || MouseEvent)(eventName, {
                            view: window,
                            bubbles: true,
                            cancelable: true,
                            composed: true,
                            clientX: 0,
                            clientY: 0
                        });

                        el.dispatchEvent(ev as Event);
                    } catch (e) {
                        try {
                            const ev = new MouseEvent(eventName, {
                                view: window,
                                bubbles: true,
                                cancelable: true,
                                composed: true,
                                clientX: 0,
                                clientY: 0
                            });
                            el.dispatchEvent(ev);
                        } catch (fallbackErr: any) {
                            log(`Error dispatching ${eventName}: ${fallbackErr.message}`);
                        }
                    }
                }

                el.click();
                el.focus();
                el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

                if (topElement && originalPointerEvents !== null) {
                    topElement.style.pointerEvents = originalPointerEvents;
                }

                if (activeEl && typeof activeEl.focus === 'function') activeEl.focus({ preventScroll: true });
                window.scrollTo(scrollX, scrollY);
                if (panel) panel.scrollTop = panelScroll;

                clicked++;
                const state = window.__autoAcceptState;
                if (state) {
                    state.clicks = (state.clicks || 0) + 1;
                    state._recoveryTS = state._recoveryTS || [];
                    state._recoveryTS.push(Date.now());
                }
            }
        }
    }
    return clicked;
}
