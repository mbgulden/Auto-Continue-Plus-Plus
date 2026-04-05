/**
 * PermissionHandler.ts - Handles Antigravity's permission prompts ("Allow this
 * conversation", "Allow once", "Always allow", "Grant permission", etc.).
 *
 * Ported from the reference antigravity-auto-accept plugin's permission
 * handling subsystem (lines 371-488 of auto-accept.js). The reference plugin
 * treats permission prompts as the highest priority action — they must be
 * resolved before any Run buttons can be clicked.
 */
import { log } from './DomUtils';
import {
    ACTION_NODE_SELECTOR,
    getActionText,
    getInteractiveNodes,
    clickElement
} from './ClickUtils';

/** Text markers that identify a permission-request container */
const PERMISSION_PROMPT_MARKERS = [
    'opening url in browser', 'needs permission to act on',
    'permission to act on', 'requires permission', 'permission request',
    'grant permission', 'requesting permission', 'access permission',
    'allow this', 'requires your approval', 'approval required',
    'permission to access file', 'permission to access files',
    'access this file', 'access these files', 'access your files',
    'file access', 'workspace access', 'allow file access to',
    'allow for this conversation'
];

/** Returns true if the text suggests a deny/block/configure action */
function isPermissionBlockAction(txt: string): boolean {
    return /\ballowlist\b|\bdeny\b|\breject\b|\bcancel\b|\bconfigure\b|\bsettings?\b/i.test(txt);
}

/** Returns true if the text suggests an allow/approve/grant action */
function isPermissionAllowAction(txt: string): boolean {
    if (!txt || isPermissionBlockAction(txt)) return false;
    return /\ballow\b|\bapprove\b|\bgrant\b|^always\b/i.test(txt);
}

/**
 * Heuristic: is this DOM container a permission prompt?
 * Checks for marker text AND whether buttons include allow/block choices.
 */
export function isPermissionPromptContainer(
    containerText: string,
    buttons: HTMLElement[]
): boolean {
    if (!containerText || containerText.includes('allowlist')) return false;

    const hasMarker = PERMISSION_PROMPT_MARKERS.some(m => containerText.includes(m));
    const hasAllowChoice = (buttons || []).some(b => isPermissionAllowAction(getActionText(b)));
    const hasBlockChoice = (buttons || []).some(b =>
        /\bdeny\b|\breject\b|\bcancel\b|\bnot\s+now\b|\bblock\b/i.test(getActionText(b))
    );
    const hasConversationAllow = (buttons || []).some(b =>
        /\ballow(\s+for)?\s+this\s+conversation\b/i.test(getActionText(b))
    );

    return hasMarker || hasConversationAllow || (hasAllowChoice && hasBlockChoice);
}

/**
 * Attempts to approve a permission prompt inside a container.
 * Tries buttons in priority order:
 *  1. "Allow this conversation"
 *  2. "Allow once"
 *  3. "Always allow"
 *  4. Any generic allow/approve/grant
 *  5. Primary/prominent button
 *  6. Fallback scan of interactive nodes
 */
export function tryApprovePermissionInContainer(
    container: HTMLElement,
    sourceTag = ''
): boolean {
    if (!container) return false;

    const containerText = getActionText(container);
    const buttons = Array.from(
        container.querySelectorAll(ACTION_NODE_SELECTOR)
    ) as HTMLElement[];

    if (!isPermissionPromptContainer(containerText, buttons)) return false;

    const isNeg = (txt: string) => isPermissionBlockAction(txt);

    // Priority 1: "Allow this conversation"
    const allowConvo = buttons.find(btn => {
        const t = getActionText(btn);
        if (!t || isNeg(t)) return false;
        return /\ballow(\s+for)?\s+this\s+conversation\b/i.test(t);
    });
    if (allowConvo && clickElement(allowConvo, 'permission')) {
        log(`Permission: "Allow this conversation" [${sourceTag}]`);
        return true;
    }

    // Priority 2: "Allow once"
    const allowOnce = buttons.find(btn => /\ballow\s+once\b/i.test(getActionText(btn)));
    if (allowOnce && clickElement(allowOnce, 'permission')) {
        log(`Permission: "Allow Once" [${sourceTag}]`);
        return true;
    }

    // Priority 3: "Always allow"
    const alwaysAllow = buttons.find(btn => {
        const t = getActionText(btn);
        if (!t || isNeg(t)) return false;
        return /\balways\s+allow\b/i.test(t) ||
               (/^always\b/i.test(t) && !/\balways\s+run\b/i.test(t)) ||
               /\balways\s*\.\.\./i.test(t);
    });
    if (alwaysAllow && clickElement(alwaysAllow, 'permission')) {
        log(`Permission: "Always Allow" [${sourceTag}]`);
        return true;
    }

    // Priority 4: Generic allow/approve/grant
    const allowBtn = buttons.find(btn => isPermissionAllowAction(getActionText(btn)));
    if (allowBtn && clickElement(allowBtn, 'permission')) {
        log(`Permission: "${getActionText(allowBtn)}" [${sourceTag}]`);
        return true;
    }

    // Priority 5: Primary / prominent button
    const primaryBtn = buttons.find(btn => {
        const t = getActionText(btn);
        if (!t || isNeg(t)) return false;
        const cls = String((btn as any).className || '').toLowerCase();
        return cls.includes('primary') || cls.includes('prominent') || cls.includes('cta');
    });
    if (primaryBtn && clickElement(primaryBtn, 'permission')) {
        log(`Permission: primary button "${getActionText(primaryBtn)}" [${sourceTag}]`);
        return true;
    }

    // Priority 6: Broadest fallback - interactive nodes
    const fallback = getInteractiveNodes(container).find(el => {
        const t = getActionText(el);
        if (!t || isNeg(t)) return false;
        return isPermissionAllowAction(t);
    });
    if (fallback && clickElement(fallback, 'permission')) {
        log(`Permission: fallback "${getActionText(fallback)}" [${sourceTag}]`);
        return true;
    }

    return false;
}
