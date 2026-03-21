import { log, queryAll, PANEL_SELECTORS } from './DomUtils';
import './State';

export const OVERLAY_ID = '__autoAcceptBgOverlay';
const STYLE_ID = '__autoAcceptBgStyles';

const OVERLAY_STYLES = `
    #__autoAcceptBgOverlay { position: fixed; background: rgba(0, 0, 0, 0.97); z-index: 2147483647; font-family: system-ui, -apple-system, sans-serif; color: #fff; display: flex; flex-direction: column; justify-content: center; align-items: center; pointer-events: none; opacity: 0; transition: opacity 0.3s ease; overflow: hidden; }
    #__autoAcceptBgOverlay.visible { opacity: 1; }
    .aab-container { width: 90%; max-width: 420px; padding: 24px; }
    .aab-slot { margin-bottom: 16px; padding: 12px 16px; background: rgba(255, 255, 255, 0.03); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08); }
    .aab-header { display: flex; align-items: center; margin-bottom: 8px; gap: 10px; }
    .aab-name { flex: 1; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #e0e0e0; }
    .aab-status { font-size: 10px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; }
    .aab-slot.in-progress .aab-status { color: #a855f7; background: rgba(168, 85, 247, 0.15); }
    .aab-slot.completed .aab-status { color: #22c55e; background: rgba(34, 197, 94, 0.15); }
    .aab-progress-track { height: 4px; background: rgba(255, 255, 255, 0.08); border-radius: 2px; overflow: hidden; }
    .aab-progress-fill { height: 100%; border-radius: 2px; transition: width 0.4s ease, background 0.3s ease; }
    .aab-slot.in-progress .aab-progress-fill { width: 60%; background: linear-gradient(90deg, #a855f7, #8b5cf6); animation: pulse-progress 1.5s ease-in-out infinite; }
    .aab-slot.completed .aab-progress-fill { width: 100%; background: linear-gradient(90deg, #22c55e, #16a34a); }
    @keyframes pulse-progress { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
`;

export const stripTimeSuffix = (text: string): string => {
    return (text || '').trim().replace(/\s*\d+[smh]$/, '').trim();
};

const deduplicateNames = (names: string[]): string[] => {
    const counts: Record<string, number> = {};
    return names.map(name => {
        if (counts[name] === undefined) {
            counts[name] = 1;
            return name;
        } else {
            counts[name]++;
            return `${name} (${counts[name]})`;
        }
    });
};

export function loadTabsOntoOverlay(tabNames: string[]) {
    const container = document.getElementById(OVERLAY_ID + '-c');
    if (!container || !tabNames || tabNames.length === 0) return;

    log(`[Overlay] Loading ${tabNames.length} tabs onto overlay`);

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    const completionStatus = window.__autoAcceptState?.completionStatus || {};

    tabNames.forEach(name => {
        const isCompleted = completionStatus[name] === 'done' || completionStatus[name] === 'done-errors';
        const stateClass = isCompleted ? 'completed' : 'in-progress';
        const statusText = isCompleted ? 'COMPLETED' : 'IN PROGRESS';

        const slot = document.createElement('div');
        slot.className = `aab-slot ${stateClass}`;
        slot.setAttribute('data-name', name);

        const header = document.createElement('div');
        header.className = 'aab-header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'aab-name';
        nameSpan.textContent = name;
        header.appendChild(nameSpan);

        const statusSpan = document.createElement('span');
        statusSpan.className = 'aab-status';
        statusSpan.textContent = statusText;
        header.appendChild(statusSpan);

        slot.appendChild(header);

        const track = document.createElement('div');
        track.className = 'aab-progress-track';
        const fill = document.createElement('div');
        fill.className = 'aab-progress-fill';
        track.appendChild(fill);
        slot.appendChild(track);

        container.appendChild(slot);
    });
}

export function updateTabNames(tabs: HTMLElement[]) {
    const rawNames = Array.from(tabs).map((tab) => {
        const fullText = (tab.textContent || '').trim();
        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        if (lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            if (lastLine.length > 0 && lastLine.length < 100) {
                return stripTimeSuffix(lastLine);
            }
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                if (line.length > 0 && line.length < 100 && !line.startsWith('//') && !line.startsWith('/*') && !line.includes('{')) {
                    return stripTimeSuffix(line);
                }
            }
        }

        return stripTimeSuffix(fullText.substring(0, 50));
    });
    const tabNames = deduplicateNames(rawNames);

    if (tabNames.length === 0 && (window.__autoAcceptState?.tabNames?.length || 0) > 0) {
        return;
    }

    const tabNamesChanged = JSON.stringify(window.__autoAcceptState?.tabNames) !== JSON.stringify(tabNames);

    if (tabNamesChanged) {
        log(`[Tabs] Detected ${tabNames.length} tabs: ${tabNames.join(', ')}`);
        if (window.__autoAcceptState) {
            window.__autoAcceptState.tabNames = tabNames;
        }
    }

    if (tabNames.length >= 3) {
        const container = document.getElementById(OVERLAY_ID + '-c');
        const needsLoad = tabNamesChanged || (container && container.children.length === 0);
        if (needsLoad) {
            loadTabsOntoOverlay(tabNames);
        }
    }
}

export function mountOverlay() {
    if (document.getElementById(OVERLAY_ID)) {
        log('[Overlay] Already mounted');
        return;
    }

    log('[Overlay] Mounting overlay...');

    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = OVERLAY_STYLES;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    const container = document.createElement('div');
    container.className = 'aab-container';
    container.id = OVERLAY_ID + '-c';

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    let panel: HTMLElement | null = null;
    for (const selector of PANEL_SELECTORS) {
        const found = queryAll(selector).find(p => p.offsetWidth > 50);
        if (found) {
            panel = found;
            log(`[Overlay] Found AI panel: ${selector}`);
            break;
        }
    }

    const syncPosition = () => {
        if (panel) {
            const rect = panel.getBoundingClientRect();
            overlay.style.top = rect.top + 'px';
            overlay.style.left = rect.left + 'px';
            overlay.style.width = rect.width + 'px';
            overlay.style.height = rect.height + 'px';
        } else {
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
        }
    };

    syncPosition();

    if (panel) {
        const resizeObserver = new ResizeObserver(syncPosition);
        resizeObserver.observe(panel);
        (overlay as any)._resizeObserver = resizeObserver;
    }

    requestAnimationFrame(() => overlay.classList.add('visible'));
    log('[Overlay] Overlay mounted');
}

export function dismountOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    log('[Overlay] Dismounting overlay...');
    if ((overlay as any)._resizeObserver) {
        (overlay as any)._resizeObserver.disconnect();
    }
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
}

export function markTabCompleted(tabName: string) {
    const container = document.getElementById(OVERLAY_ID + '-c');
    if (!container) return;

    const slots = container.querySelectorAll('.aab-slot');
    for (const slot of Array.from(slots)) {
        if (slot.getAttribute('data-name') === tabName) {
            if (!slot.classList.contains('completed')) {
                log(`[Overlay] Marking "${tabName}" as completed`);
                slot.classList.remove('in-progress');
                slot.classList.add('completed');
                const statusSpan = slot.querySelector('.aab-status');
                if (statusSpan) statusSpan.textContent = 'COMPLETED';
            }
            break;
        }
    }
}

export const updateConversationCompletionState = (rawTabName: string, status: string) => {
    const tabName = stripTimeSuffix(rawTabName);
    const current = window.__autoAcceptState?.completionStatus?.[tabName];
    if (current !== status) {
        log(`[State] ${tabName}: ${current} -> ${status}`);
        if (window.__autoAcceptState) {
            window.__autoAcceptState.completionStatus[tabName] = status;
        }
    }
};
