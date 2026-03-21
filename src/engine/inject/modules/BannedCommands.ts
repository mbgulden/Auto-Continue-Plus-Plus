import { log } from './DomUtils';
import './State';

const COMMAND_ELEMENTS = ['pre', 'code', 'pre code'];

export function findNearbyCommandText(el: HTMLElement): string {
    let commandText = '';

    // Walk up DOM tree looking for nearby <pre>/<code> elements
    let container = el.parentElement;
    let depth = 0;
    while (container && depth < 10) {
        let sibling = container.previousElementSibling;
        let siblingCount = 0;
        while (sibling && siblingCount < 5) {
            if (sibling.tagName === 'PRE' || sibling.tagName === 'CODE') {
                const text = sibling.textContent?.trim() || '';
                if (text.length > 0) commandText += ' ' + text;
            }
            for (const selector of COMMAND_ELEMENTS) {
                try {
                    const codeElements = sibling.querySelectorAll(selector);
                    for (const codeEl of Array.from(codeElements)) {
                        if (codeEl && codeEl.textContent) {
                            const text = codeEl.textContent.trim();
                            if (text.length > 0 && text.length < 5000) commandText += ' ' + text;
                        }
                    }
                } catch (e) { }
            }
            sibling = sibling.previousElementSibling;
            siblingCount++;
        }
        if (commandText.length > 10) break;
        container = container.parentElement;
        depth++;
    }

    // Fallback: check immediate button siblings
    if (commandText.length === 0) {
        let btnSibling = el.previousElementSibling;
        let count = 0;
        while (btnSibling && count < 3) {
            for (const selector of COMMAND_ELEMENTS) {
                try {
                    const codeElements = btnSibling.querySelectorAll ? btnSibling.querySelectorAll(selector) : [];
                    for (const codeEl of Array.from(codeElements)) {
                        if (codeEl && codeEl.textContent) commandText += ' ' + codeEl.textContent.trim();
                    }
                } catch (e) { }
            }
            btnSibling = btnSibling.previousElementSibling;
            count++;
        }
    }

    if (el.getAttribute('aria-label')) commandText += ' ' + el.getAttribute('aria-label');
    if (el.getAttribute('title')) commandText += ' ' + el.getAttribute('title');

    return commandText.trim().toLowerCase();
}

export function isCommandBanned(commandText: string): boolean {
    const state = window.__autoAcceptState;
    const bannedList = state ? (state.bannedCommands || []) : [];
    if (bannedList.length === 0 || !commandText) return false;

    const lowerText = commandText.toLowerCase();

    for (const banned of bannedList) {
        const pattern = (banned || '').trim();
        if (!pattern) continue;

        try {
            // Support regex patterns: /pattern/flags
            if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
                const lastSlash = pattern.lastIndexOf('/');
                const regex = new RegExp(pattern.substring(1, lastSlash), pattern.substring(lastSlash + 1) || 'i');
                if (regex.test(commandText)) {
                    log(`[BANNED] Blocked by regex: ${pattern}`);
                    if (state) state.blocked = (state.blocked || 0) + 1;
                    return true;
                }
            } else {
                if (lowerText.includes(pattern.toLowerCase())) {
                    log(`[BANNED] Blocked by pattern: "${pattern}"`);
                    if (state) state.blocked = (state.blocked || 0) + 1;
                    return true;
                }
            }
        } catch (e) {
            if (lowerText.includes(pattern.toLowerCase())) {
                log(`[BANNED] Blocked (fallback): "${pattern}"`);
                if (state) state.blocked = (state.blocked || 0) + 1;
                return true;
            }
        }
    }
    return false;
}
