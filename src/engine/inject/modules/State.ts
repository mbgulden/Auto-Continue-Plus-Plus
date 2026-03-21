export interface AutoAcceptState {
    isRunning: boolean;
    sessionID: number;
    clicks: number;
    blocked: number;
    fileEdits: number;
    terminalCommands: number;
    clickInterval: any;
    mode: string | null;
    ide: string | null;
    pollInterval: number;
    bannedCommands: string[];
    tabNames: string[];
    completionStatus: Record<string, string>;
    _noTabCycles: number;
    _recoveryTS: number[];
    summaryRequestPending: boolean;
    summaryRequestedAt: number;
    lastSummary: string;
    userInteracting: boolean;
    _userInteractingTimer: any;
    _onUserInteract: any;
}

declare global {
    interface Window {
        __autoAcceptState?: AutoAcceptState;
        __autoAcceptGetStats?: () => any;
        __autoAcceptConsumeSummaryRequest?: () => any;
        __autoAcceptSetSummaryResult?: (payload: any) => void;
        __autoAcceptGetVisibleConversationText?: (maxChars: number) => string;
        __autoAcceptStart?: (config: any) => void;
        __autoAcceptStop?: () => void;
        __autoAcceptSetFocusState?: () => void;
        __autoAcceptUpdateBannedCommands?: (bannedList: string[]) => void;
    }
}
