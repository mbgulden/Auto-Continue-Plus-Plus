import { log } from './modules/DomUtils';
import { clickAcceptButtons } from './modules/ClickingEngine';
import { mountOverlay, dismountOverlay } from './modules/OverlayManager';
import { setSummaryWidgetState, mountSummaryWidget, dismountSummaryWidget } from './modules/SummaryWidget';
import { collectVisibleConversationText, cursorTabLoop, antigravityTabLoop } from './modules/TabCycler';
import { AutoAcceptState } from './modules/State';

(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    log('Script loaded (Modular payload)');

    if (!window.__autoAcceptState) {
        window.__autoAcceptState = {
            isRunning: false,
            sessionID: 0,
            clicks: 0,
            blocked: 0,
            fileEdits: 0,
            terminalCommands: 0,
            clickInterval: null,
            mode: null,
            ide: null,
            pollInterval: 1000,
            bannedCommands: [],
            tabNames: [],
            completionStatus: {},
            _noTabCycles: 0,
            _recoveryTS: [],
            summaryRequestPending: false,
            summaryRequestedAt: 0,
            lastSummary: '',
            userInteracting: false,
            _userInteractingTimer: null,
            _onUserInteract: null
        };
    }

    window.__autoAcceptGetStats = function () {
        const s = window.__autoAcceptState || {} as any;
        return {
            clicks: s.clicks || 0,
            blocked: s.blocked || 0,
            fileEdits: s.fileEdits || 0,
            terminalCommands: s.terminalCommands || 0
        };
    };

    window.__autoAcceptConsumeSummaryRequest = function () {
        const s = window.__autoAcceptState || {} as any;
        if (!s.summaryRequestPending) return { requested: false };
        s.summaryRequestPending = false;
        return {
            requested: true,
            requestedAt: s.summaryRequestedAt || Date.now()
        };
    };

    window.__autoAcceptSetSummaryResult = function (payload: any) {
        const s = window.__autoAcceptState || {} as any;
        const p = payload || {};
        if (p.status === 'loading') {
            setSummaryWidgetState({ status: 'loading' });
            return;
        }

        if (p.status === 'success') {
            s.lastSummary = String(p.summary || '');
            setSummaryWidgetState({
                status: 'success',
                summary: s.lastSummary
            });
            return;
        }

        if (p.status === 'error') {
            setSummaryWidgetState({
                status: 'error',
                error: String(p.error || 'Failed to generate summary.')
            });
            return;
        }

        setSummaryWidgetState({ status: 'idle' });
    };

    window.__autoAcceptGetVisibleConversationText = function (maxChars: number) {
        const cap = Number(maxChars) > 0 ? Number(maxChars) : 12000;
        return collectVisibleConversationText(cap);
    };

    window.__autoAcceptStart = function (config: any) {
        const state = window.__autoAcceptState as AutoAcceptState;

        if (state.isRunning) {
            log('Already running, stopping first...');
            if (window.__autoAcceptStop) window.__autoAcceptStop();
        }

        state.isRunning = true;
        state.sessionID++;
        state.mode = config.isBackgroundMode ? 'background' : 'simple';
        state.ide = (config.ide || 'cursor').toLowerCase();
        state.pollInterval = config.pollInterval || 1000;
        state.tabNames = [];
        state.completionStatus = {};
        state._noTabCycles = 0;
        state.summaryRequestPending = false;
        state.summaryRequestedAt = 0;
        state.userInteracting = false;
        if (state._userInteractingTimer) { clearTimeout(state._userInteractingTimer); state._userInteractingTimer = null; }

        if (state._onUserInteract) document.removeEventListener('mousedown', state._onUserInteract, true);
        const onUserInteract = () => {
            const s = window.__autoAcceptState;
            if (!s || !s.isRunning) return;
            s.userInteracting = true;
            if (s._userInteractingTimer) clearTimeout(s._userInteractingTimer);
            s._userInteractingTimer = setTimeout(() => { s.userInteracting = false; }, 1500);
        };
        state._onUserInteract = onUserInteract;
        document.addEventListener('mousedown', onUserInteract, true);

        if (config.bannedCommands) {
            state.bannedCommands = Array.isArray(config.bannedCommands) ? config.bannedCommands : [];
            log(`Banned commands loaded: ${state.bannedCommands.length} patterns`);
        }

        log(`Starting ${state.mode} mode for ${state.ide} (interval=${state.pollInterval}ms)...`);

        const runClickLoop = () => {
            if (state.isRunning) {
                clickAcceptButtons();
                const jitter = state.pollInterval * (Math.random() * 0.3 - 0.15);
                state.clickInterval = setTimeout(runClickLoop, state.pollInterval + jitter);
            }
        };
        runClickLoop();

        log(`Clicking loop started (${state.pollInterval}ms interval with jitter)`);

        if (config.isBackgroundMode) {
            dismountSummaryWidget();
            mountOverlay();

            const sessionID = state.sessionID;
            setTimeout(() => {
                if (state.isRunning && state.sessionID === sessionID) {
                    if (state.ide === 'cursor') {
                        cursorTabLoop(sessionID);
                    } else {
                        antigravityTabLoop(sessionID);
                    }
                }
            }, 1000);

            log('Background mode: overlay mounted, tab cycling starting in 1s');
        } else {
            dismountOverlay();
            mountSummaryWidget();
            setSummaryWidgetState({ status: 'idle' });
        }

        log('Active!');
    };

    window.__autoAcceptStop = function () {
        const state = window.__autoAcceptState as AutoAcceptState;
        state.isRunning = false;

        if (state.clickInterval) {
            clearTimeout(state.clickInterval);
            state.clickInterval = null;
        }

        if (state._onUserInteract) {
            document.removeEventListener('mousedown', state._onUserInteract, true);
            state._onUserInteract = null;
        }
        if (state._userInteractingTimer) {
            clearTimeout(state._userInteractingTimer);
            state._userInteractingTimer = null;
        }
        state.userInteracting = false;

        dismountOverlay();
        dismountSummaryWidget();

        log('Stopped');
    };

    window.__autoAcceptSetFocusState = function () { };
    window.__autoAcceptUpdateBannedCommands = function (bannedList: string[]) {
        const state = window.__autoAcceptState;
        if (state) {
            state.bannedCommands = Array.isArray(bannedList) ? bannedList : [];
            log(`Banned commands updated: ${state.bannedCommands.length} patterns`);
        }
    };

    log('Ready');
})();
