import React from 'react';
import { createRoot } from 'react-dom/client';

const App = () => {
    return (
        <div style={{ padding: '20px', fontFamily: 'var(--vscode-font-family)' }}>
            <h1>Agent Manager Pro</h1>
            <p>Welcome to the Phase 5 Command Center. Real-time streaming and the Calendar for AI will be built here.</p>

            <div style={{ marginTop: '20px', padding: '15px', background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: '6px' }}>
                <h3>Corporate Framework Status</h3>
                <ul style={{ listStyleType: 'none', padding: 0 }}>
                    <li>🟢 <b>Overseer:</b> Active (Gemini 3.1 Pro)</li>
                    <li>🟢 <b>Sub-Manager:</b> Active (Gemini 3 Flash)</li>
                    <li>⚪ <b>Specialists:</b> 0 Active</li>
                </ul>
            </div>
        </div>
    );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
}
