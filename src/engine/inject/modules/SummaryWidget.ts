import { log, findAgentPanel } from './DomUtils';
import './State';

const SUMMARY_WIDGET_ID = '__autoAcceptSummaryWidget';
const SUMMARY_STYLE_ID = '__autoAcceptSummaryStyles';
const SUMMARY_BUTTON_ID = '__autoAcceptSummaryButton';
const SUMMARY_STATUS_ID = '__autoAcceptSummaryStatus';
const SUMMARY_BODY_ID = '__autoAcceptSummaryBody';

const SUMMARY_STYLES = `
    #__autoAcceptSummaryWidget { position: fixed; z-index: 2147483646; width: 340px; max-height: 60vh; padding: 12px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(12, 12, 16, 0.96); color: #f6f6f6; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4); display: flex; flex-direction: column; gap: 8px; font-family: system-ui, -apple-system, sans-serif; }
    #__autoAcceptSummaryWidget .aas-title { font-size: 12px; font-weight: 600; opacity: 0.95; letter-spacing: 0.2px; }
    #__autoAcceptSummaryButton { height: 30px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; font-size: 12px; font-weight: 600; }
    #__autoAcceptSummaryButton[disabled] { opacity: 0.6; cursor: default; }
    #__autoAcceptSummaryStatus { font-size: 11px; min-height: 15px; opacity: 0.8; }
    #__autoAcceptSummaryBody { white-space: pre-wrap; font-size: 12px; line-height: 1.45; overflow: auto; max-height: 42vh; padding-right: 2px; }
    #__autoAcceptSummaryWidget.error #__autoAcceptSummaryStatus { color: #fca5a5; }
`;

export function setSummaryWidgetState(payload: any) {
    const widget = document.getElementById(SUMMARY_WIDGET_ID);
    if (!widget) return;
    const button = document.getElementById(SUMMARY_BUTTON_ID) as HTMLButtonElement;
    const status = document.getElementById(SUMMARY_STATUS_ID);
    const body = document.getElementById(SUMMARY_BODY_ID);
    const state = payload || {};
    const statusType = state.status || 'idle';

    widget.classList.toggle('error', statusType === 'error');

    if (statusType === 'loading') {
        if (button) {
            button.disabled = true;
            button.textContent = 'Summarizing...';
        }
        if (status) status.textContent = 'Generating session recap...';
        if (body && !body.textContent) body.textContent = '';
        return;
    }

    if (statusType === 'success') {
        if (button) {
            button.disabled = false;
            button.textContent = 'Regenerate Summary';
        }
        if (status) status.textContent = `Updated ${new Date().toLocaleTimeString()}`;
        if (body) body.textContent = String(state.summary || '').trim();
        return;
    }

    if (statusType === 'error') {
        if (button) {
            button.disabled = false;
            button.textContent = 'Retry Summary';
        }
        if (status) status.textContent = String(state.error || 'Failed to generate summary.');
        if (body && !body.textContent) body.textContent = '';
        return;
    }

    if (button) {
        button.disabled = false;
        button.textContent = 'Summarize Session';
    }
    if (status) status.textContent = 'Click to generate a recap for this session.';
}

export function mountSummaryWidget() {
    if (document.getElementById(SUMMARY_WIDGET_ID)) return;

    if (!document.getElementById(SUMMARY_STYLE_ID)) {
        const style = document.createElement('style');
        style.id = SUMMARY_STYLE_ID;
        style.textContent = SUMMARY_STYLES;
        document.head.appendChild(style);
    }

    const widget = document.createElement('div');
    widget.id = SUMMARY_WIDGET_ID;
    widget.innerHTML = `
        <div class="aas-title">Auto Accept Session Recap</div>
        <button id="${SUMMARY_BUTTON_ID}" type="button">Summarize Session</button>
        <div id="${SUMMARY_STATUS_ID}"></div>
        <div id="${SUMMARY_BODY_ID}"></div>
    `;
    document.body.appendChild(widget);

    const panel = findAgentPanel();
    const syncPosition = () => {
        if (panel && panel.getBoundingClientRect) {
            const rect = panel.getBoundingClientRect();
            widget.style.left = `${Math.max(8, rect.right - widget.offsetWidth - 12)}px`;
            widget.style.top = `${Math.max(8, rect.bottom - Math.min(rect.height - 10, widget.offsetHeight + 12))}px`;
        } else {
            widget.style.right = '18px';
            widget.style.bottom = '18px';
            widget.style.left = 'auto';
            widget.style.top = 'auto';
        }
    };
    syncPosition();
    (widget as any)._onWindowResize = syncPosition;
    window.addEventListener('resize', syncPosition);

    if (panel) {
        const resizeObserver = new ResizeObserver(syncPosition);
        resizeObserver.observe(panel);
        (widget as any)._resizeObserver = resizeObserver;
    }

    const button = document.getElementById(SUMMARY_BUTTON_ID);
    if (button) {
        button.addEventListener('click', () => {
            const state = window.__autoAcceptState;
            if (!state || state.summaryRequestPending) return;
            state.summaryRequestPending = true;
            state.summaryRequestedAt = Date.now();
            setSummaryWidgetState({ status: 'loading' });
        });
    }

    setSummaryWidgetState({ status: 'idle' });
    log('[Summary] Widget mounted');
}

export function dismountSummaryWidget() {
    const widget = document.getElementById(SUMMARY_WIDGET_ID);
    if (!widget) return;
    if ((widget as any)._resizeObserver) (widget as any)._resizeObserver.disconnect();
    if ((widget as any)._onWindowResize) window.removeEventListener('resize', (widget as any)._onWindowResize);
    widget.remove();
    log('[Summary] Widget dismounted');
}
