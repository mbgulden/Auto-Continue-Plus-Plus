import './State';

export const PANEL_SELECTORS = [
    '#antigravity\\.agentPanel',
    '#workbench\\.parts\\.auxiliarybar',
    '.auxiliary-bar-container',
    '#workbench\\.parts\\.sidebar'
];

export const log = (msg: string) => console.log(`[AutoAccept] ${msg}`);

export const getDocuments = (root: Document | Element = document): Document[] => {
    let docs: Document[] = [root as Document];
    try {
        const iframes = root.querySelectorAll('iframe, frame');
        for (const iframe of Array.from(iframes) as HTMLIFrameElement[]) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) docs.push(...getDocuments(iframeDoc));
            } catch (e) { }
        }
    } catch (e) { }
    return docs;
};

export const getAgentPanels = (doc: Document): Element[] => {
    const panels: Element[] = [];
    for (const selector of PANEL_SELECTORS) {
        try {
            const els = Array.from(doc.querySelectorAll(selector));
            for (const el of els) {
                if (el && (el as HTMLElement).offsetWidth > 0 && (el as HTMLElement).offsetHeight > 0) {
                    panels.push(el);
                }
            }
        } catch (e) {}
    }
    return panels.length > 0 ? panels : [doc.body || doc];
};

export function findElementsPiercingShadow(root: Document | Element | ShadowRoot, selector: string, result: Element[] = []): Element[] {
    try {
        const nodes = Array.from(root.querySelectorAll(selector));
        result.push(...nodes);
        
        const allElements = root.querySelectorAll('*');
        for (const el of Array.from(allElements)) {
            if (el.shadowRoot) {
                findElementsPiercingShadow(el.shadowRoot, selector, result);
            }
        }
    } catch(e) {}
    return result;
}

export const queryAll = (selector: string): HTMLElement[] => {
    const results: Element[] = [];
    getDocuments().forEach(doc => {
        try {
            const panels = getAgentPanels(doc);
            for (const panel of panels) {
                findElementsPiercingShadow(panel as Element, selector, results);
            }
        } catch (e) { }
    });
    return [...new Set(results)] as HTMLElement[];
};

export function isElementVisible(el: HTMLElement | null): boolean {
    if (!el || !el.ownerDocument) return false;
    try {
        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    } catch (e) {
        return false;
    }
}

export function findAgentPanel(): HTMLElement | null {
    for (const selector of PANEL_SELECTORS) {
        const found = queryAll(selector).find(p => p.offsetWidth > 50 && p.offsetHeight > 50);
        if (found) return found;
    }
    return null;
}
