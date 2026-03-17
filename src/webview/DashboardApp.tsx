import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

interface SwarmLog {
    timestamp: number;
    threadId: string;
    role: string;
    message: string;
    type: 'info' | 'error' | 'success';
}

const App = () => {
    const [logs, setLogs] = useState<SwarmLog[]>([]);
    const [specialistsCount, setSpecialistsCount] = useState(0);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            if (message.command === 'streamLog') {
                setLogs((prevLogs) => {
                    const newLogs = [message.log, ...prevLogs];
                    return newLogs.slice(0, 50); // Keep last 50 logs
                });
            } else if (message.command === 'updateSpecialistsCount') {
                setSpecialistsCount(message.count);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const getLogColor = (type: string) => {
        switch (type) {
            case 'error': return 'var(--vscode-terminal-ansiRed)';
            case 'success': return 'var(--vscode-terminal-ansiGreen)';
            default: return 'var(--vscode-terminal-ansiCyan)';
        }
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'var(--vscode-font-family)' }}>
            <h1>Agent Manager Pro <span style={{ fontSize: '0.5em', opacity: 0.5, verticalAlign: 'super' }}>(Streaming)</span></h1>

            <div style={{ marginTop: '20px', padding: '15px', background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                    <h3 style={{ margin: '0 0 10px 0' }}>Corporate Framework Status</h3>
                    <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                        <li style={{ marginBottom: '5px' }}>🟢 <b>Overseer:</b> Active (Google One AI Ultra / Antigravity)</li>
                        <li style={{ marginBottom: '5px' }}>🟢 <b>Sub-Manager:</b> Active (Gemini 3 Flash)</li>
                        <li>{specialistsCount > 0 ? '🟢' : '⚪'} <b>Specialists:</b> {specialistsCount} Active</li>
                    </ul>
                </div>
            </div>

            <div style={{ marginTop: '20px' }}>
                <h3>Real-Time Fleet Telemetry</h3>
                <div style={{
                    background: 'var(--vscode-editor-background)',
                    border: '1px solid var(--vscode-widget-border)',
                    borderRadius: '6px',
                    height: '300px',
                    overflowY: 'auto',
                    padding: '10px',
                    fontFamily: 'monospace',
                    fontSize: '0.9em'
                }}>
                    {logs.length === 0 ? (
                        <div style={{ opacity: 0.5, textAlign: 'center', marginTop: '120px' }}>
                            Waiting for Swarm activity...
                        </div>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px dashed var(--vscode-editorGroup-border)' }}>
                                <span style={{ opacity: 0.6, marginRight: '10px' }}>
                                    [{new Date(log.timestamp).toLocaleTimeString()}]
                                </span>
                                <strong style={{ color: getLogColor(log.type), marginRight: '10px' }}>
                                    {log.role}
                                </strong>
                                <span>{log.message}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
}
