import { useState, useEffect } from 'react';
import { Play, Hexagon, TerminalSquare, FileDigit, Cpu, Network, Zap, CheckCircle2, Shield, Globe, Server, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './App.css';
import './QuotaCenter.css';
import QuotaCenter from './QuotaCenter';

/** Agent record from the Supervisor API. */
interface AgentRecord {
  id: string;
  name: string;
  type: string;
  status: string;
  load: number;
}

/** Task record from the Supervisor API. */
interface TaskRecord {
  id: string;
  title: string;
  status: string;
  assignee: string;
}

/** Telemetry log entry from the Supervisor API. */
interface TelemetryEntry {
  id: number;
  time: string;
  level: string;
  msg: string;
}

/** Mutex lock record from the Supervisor API. */
interface MutexRecord {
  filepath: string;
  locked_by: string;
  sync_state: string;
}

const isReactDev = window.location.port === '5174';
const API_BASE = `http://localhost:${isReactDev ? 5002 : 5001}`;

function App() {
  const [megaprompt, setMegaprompt] = useState('');
  const [useJules, setUseJules] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isBackendLive, setIsBackendLive] = useState(false);
  const [viewMode, setViewMode] = useState<'timeline' | 'graph'>('timeline');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [mutexes, setMutexes] = useState<MutexRecord[]>([]);

  useEffect(() => {
    const syncDashboard = async () => {
      try {
        const fetchConfig = { cache: "no-store" as RequestCache };
        const agentRes = await fetch(`${API_BASE}/api/agents`, fetchConfig);
        setAgents(await agentRes.json());
        
        const taskRes = await fetch(`${API_BASE}/api/tasks`, fetchConfig);
        setTasks(await taskRes.json());
        
        const teleRes = await fetch(`${API_BASE}/api/telemetry`, fetchConfig);
        setTelemetry(await teleRes.json());
        
        const mutRes = await fetch(`${API_BASE}/api/mutex`, fetchConfig);
        setMutexes(await mutRes.json());

        setIsBackendLive(true);
      } catch {
        setIsBackendLive(false);
      }
    };
    const poller = setInterval(syncDashboard, 2000);
    syncDashboard();
    return () => clearInterval(poller);
  }, []);

  /** Dispatch a Megaprompt to the Supervisor for injection. */
  const handleLaunch = async () => {
    if (!megaprompt.trim()) return;
    setIsDeploying(true);
    try {
      await fetch(`${API_BASE}/api/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: megaprompt, use_jules: useJules })
      });
      setMegaprompt('');
    } catch (e) {
      console.error('Dispatch failed:', e);
    }
    setTimeout(() => setIsDeploying(false), 1000);
  };

  // Convert tasks to graph nodes dynamically
  const initialNodes: Node[] = tasks.map((t, idx) => ({
    id: t.id,
    position: { x: (idx % 2) * 250 + 50, y: idx * 100 + 50 },
    data: { label: t.title },
    style: {
      background: 'rgba(0,0,0,0.4)',
      color: '#fff',
      border: `1px solid ${t.status === 'completed' ? '#10b981' : '#6366f1'}`,
      borderRadius: '8px',
      padding: '10px'
    }
  }));

  const initialEdges: Edge[] = tasks.slice(1).map((t, idx) => ({
    id: `e-${tasks[idx].id}-${t.id}`,
    source: tasks[idx].id,
    target: t.id,
    animated: t.status !== 'completed',
    style: { stroke: '#6366f1' }
  }));

  // Context Score dynamically calculated
  const avgLoad = agents.length > 0
    ? (agents.reduce((acc, a) => acc + (a.load || 0), 0) / agents.length).toFixed(1)
    : "0.0";

  return (
    <div className="app-container dashboard-layout">
      
      <header className="header glass-panel">
        <div className="brand">
          <div className="logo-glow"><Hexagon /></div>
          <span className="brand-text">Swarm Commander</span>
        </div>
        <div className="header-stats">
          <a href="http://localhost:5000" target="_blank" rel="noreferrer" className="stat-badge hover-effect" title="View Network Topology">
            <Cpu size={16} /> Nodes: <span className="stat-value">{agents.length} Online</span>
          </a>
          <div className="stat-badge hover-effect" title="Average Network LLM Context Consumption">
            <Shield size={16} /> Context: <span className="stat-value">{avgLoad}%</span>
          </div>
          <div className="stat-badge jules-thread-badge hover-effect" title="Persistent Jules Identity ID">
            <Globe size={16} /> Session: <span className="stat-value">JLS-8A3B</span>
          </div>
          <div className="stat-badge" style={{ borderColor: isBackendLive ? 'var(--success)' : 'var(--danger)', background: isBackendLive ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)' }}>
            <div className={`status-dot ${!isBackendLive ? 'dot-dead' : ''}`} /> <span className="stat-value">{isBackendLive ? 'DB Bridge Active' : 'Offline'}</span>
          </div>
        </div>
      </header>

      <aside className="sidebar glass-panel">
        <div className="section-title"><Zap size={14} /> Execution Interface</div>
        <div className="megaprompt-box">
          <textarea 
            className="megaprompt-input" 
            placeholder="Type /swarm megaprompt or instructions..."
            value={megaprompt}
            onChange={(e) => setMegaprompt(e.target.value)}
          />
          <label className="jules-toggle" title="Forces Jules verification step before local code execution">
            <input type="checkbox" checked={useJules} onChange={(e) => setUseJules(e.target.checked)} />
            <span className="toggle-slider"></span>
            <span className="toggle-label"><Globe size={14}/> Enforce Jules Cloud Review</span>
          </label>
          <button className="btn-launch" onClick={handleLaunch} disabled={isDeploying || !isBackendLive}>
            {isDeploying ? <Hexagon className="animate-spin" /> : <Play size={18} fill="currentColor" />}
            {isDeploying ? 'DECOMPOSING DAG...' : 'INJECT MEGAPROMPT'}
          </button>
        </div>

        <div className="section-title" style={{ marginTop: '24px' }}><Network size={14} /> Global Agent Hive</div>
        <div className="agent-roster">
          {agents.map(ag => {
            const isExp = expandedAgent === ag.id;
            return (
              <div 
                key={ag.id} 
                className={`agent-card interactive-card ${ag.type === 'remote' ? 'jules-tier' : ''}`}
                onClick={() => setExpandedAgent(isExp ? null : ag.id)}
                title="Click to toggle agent telemetry parameters"
              >
                <div className="agent-header">
                  <span className="agent-name">
                    {ag.type === 'remote' ? <Globe size={14} /> : <Server size={14} />} 
                    {ag.name}
                  </span>
                  <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                    <span className={`agent-status status-${ag.status}`}>{ag.status}</span>
                    {isExp ? <ChevronUp size={14} color="#666" /> : <ChevronDown size={14} color="#666" />}
                  </div>
                </div>
                
                {isExp && (
                  <div className="agent-expanded-info">
                     <div><strong>Sub-Routine:</strong> {ag.type === 'remote' ? 'Awaiting cloud sync' : 'Parsing context maps'}</div>
                     <div><strong>Memory Usage:</strong> {(Math.random() * 50 + 10).toFixed(1)} MB</div>
                  </div>
                )}
                
                {ag.status === 'active' && !isExp && (
                  <div className="progress-bar-container">
                    <div className={`progress-bar ${ag.type === 'remote' ? 'jules-bar' : ''}`} style={{ width: `${ag.load || 10}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {!isBackendLive && <div className="offline-msg">Awaiting Backend Link...</div>}
        </div>
      </aside>

      <main className="main-flow glass-panel">
        <div className="flow-header">
          <h2 style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>Live Execution Fabric</h2>
          <div className="flow-controls">
            <button className={`flow-btn ${viewMode === 'timeline' ? 'active' : ''}`} onClick={() => setViewMode('timeline')}>Timeline View</button>
            <button className={`flow-btn ${viewMode === 'graph' ? 'active' : ''}`} onClick={() => setViewMode('graph')}>Dependency Graph</button>
          </div>
        </div>
        
        {viewMode === 'timeline' ? (
          <div className="task-board">
            {tasks.length === 0 && <div className="empty-state">No Active Dispatches</div>}
            {tasks.map(task => (
              <div key={task.id} className={`task-item ${task.status === 'completed' ? 'completed' : ''} ${task.status === 'jules-verification' ? 'task-jules' : ''} interactive-item`}>
                <div className="task-header">
                  <span className="task-title">{task.title}</span>
                  {task.status === 'completed' 
                    ? <CheckCircle2 color="var(--success)" size={20} />
                    : <span className="task-assignee">{task.assignee}</span>
                  }
                </div>
                <span className="task-desc">Task ID: {task.id}</span>
                {task.status === 'jules-verification' && <span className="jules-task-subtext">Waiting on cloud review and remote pull...</span>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: '12px', background: '#050505', overflow: 'hidden' }}>
            <ReactFlow nodes={initialNodes} edges={initialEdges}>
              <Background gap={12} size={1} />
              <Controls />
            </ReactFlow>
          </div>
        )}
      </main>

      <aside className="right-panel glass-panel">
        {/* === QUOTA CENTER (NEW) === */}
        <QuotaCenter />
        
        <div className="section-title" style={{ marginTop: '16px' }}><FileDigit size={14} /> Active Mutex Locks</div>
        <div className="file-tree">
          {mutexes.map((m, i) => (
             <div key={i} className="file-item interactive-item" title={`Locked by ${m.locked_by}`}>
               <Lock size={14}/> {m.filepath} 
               <span className={`sync-status ${m.sync_state}`}>{m.sync_state}</span>
             </div>
          ))}
          {mutexes.length === 0 && (
             <div className="file-item interactive-item" title="Idle State"><FileDigit size={14}/> src/App.tsx <span className="sync-status pushed-to-remote">Synced to Cloud</span></div>
          )}
        </div>

        <div className="section-title" style={{ marginTop: 'auto' }}><TerminalSquare size={14} /> Swarm Telemetry</div>
        <div className="terminal-preview" style={{ position: 'relative' }}>
          {telemetry.slice().reverse().map((log, i) => (
            <div key={i} className={`log-line ${log.level === 'jules' ? 'jules-log' : ''}`}>
              <span className="log-time">[{log.time}]</span>
              <span className={`log-${log.level}`}>
                {log.level === 'jules' && <Globe size={12} style={{marginRight: '4px', verticalAlign: 'middle'}} />}
                {log.msg}
              </span>
            </div>
          ))}
          {!isBackendLive && <div className="log-line"><span className="log-time">[{new Date().toLocaleTimeString()}]</span> <span className="log-error">Awaiting Supervisor Connection...</span></div>}
        </div>
      </aside>

    </div>
  );
}

export default App;
