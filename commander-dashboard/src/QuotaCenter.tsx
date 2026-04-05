import { useState, useEffect } from 'react';
import { Gauge, Clock, ArrowDown, AlertTriangle, Zap, Activity } from 'lucide-react';

/** Shape of a single model's usage data from the API. */
interface ModelUsage {
  model: string;
  count: number;
  tokens_used: number;
  daily_limit: number;
  percentage: number;
  status: 'ok' | 'warning' | 'critical';
}

/** Shape of the full /api/usage response. */
interface UsageResponse {
  active_model: string;
  cascade: string[];
  reset_seconds: number;
  models: ModelUsage[];
}

/** Shape of a throttle event from /api/usage/throttle-history. */
interface ThrottleEvent {
  id: number;
  timestamp: string;
  from_model: string;
  to_model: string;
  reason: string;
}

/** Friendly display names for model IDs. */
const MODEL_LABELS: Record<string, string> = {
  'gemini-3.1-pro': 'Pro 3.1',
  'gemini-thinking': 'Thinking',
  'gemini-3-flash': 'Flash 3',
  'gemini-2.5-flash': 'Flash 2.5',
  'gemini-2.5-flash-lite': 'Flash Lite',
  'deep-research': 'Deep Research',
  'deep-think-3.1': 'Deep Think',
  'gemini-agent': 'Gemini Agent',
  'screen-automation': 'Screen Auto',
  'image-gen': 'Image Gen',
  'video-gen': 'Video Gen',
};

/**
 * Format seconds into a human-readable countdown string.
 * Used for the quota reset timer display.
 */
function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const isReactDev = window.location.port === '5174';
const API_BASE = `http://localhost:${isReactDev ? 5002 : 5001}`;

/**
 * QuotaCenter — Real-time dashboard panel showing Google AI Ultra
 * usage across all models, with auto-throttle cascade status,
 * quota reset countdown, and throttle event history.
 */
export default function QuotaCenter() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [history, setHistory] = useState<ThrottleEvent[]>([]);
  const [countdown, setCountdown] = useState<number>(0);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/usage`, { cache: 'no-store' });
        const data: UsageResponse = await res.json();
        setUsage(data);
        setCountdown(data.reset_seconds);

        const histRes = await fetch(`${API_BASE}/api/usage/throttle-history`, { cache: 'no-store' });
        setHistory(await histRes.json());
      } catch {
        /* Supervisor offline — silently degrade */
      }
    };

    fetchUsage();
    const poller = setInterval(fetchUsage, 5000);
    return () => clearInterval(poller);
  }, []);

  // Tick the countdown every second without re-fetching
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(prev => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  if (!usage) {
    return (
      <div className="quota-center">
        <div className="section-title"><Gauge size={14} /> Quota Center</div>
        <div className="empty-state">Connecting to Supervisor...</div>
      </div>
    );
  }

  // Split models into coding-critical vs media/utility
  const codingModels = usage.models.filter(m =>
    ['gemini-3.1-pro', 'gemini-thinking', 'gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].includes(m.model)
  );
  const toolModels = usage.models.filter(m =>
    ['deep-research', 'deep-think-3.1', 'gemini-agent', 'screen-automation', 'image-gen', 'video-gen'].includes(m.model)
  );

  return (
    <div className="quota-center">
      {/* Header with active model + reset timer */}
      <div className="quota-header">
        <div className="section-title"><Gauge size={14} /> Quota Center</div>
        <div className="quota-meta">
          <span className="active-model-badge" title="Currently active model in the auto-throttle cascade">
            <Zap size={12} /> {MODEL_LABELS[usage.active_model] || usage.active_model}
          </span>
          <span className="reset-timer" title="Time until Google resets daily quotas (midnight PT)">
            <Clock size={12} /> {formatCountdown(countdown)}
          </span>
        </div>
      </div>

      {/* Coding Model Gauges */}
      <div className="quota-section-label">Coding Models</div>
      <div className="quota-gauges">
        {codingModels.map(m => (
          <div key={m.model} className={`quota-gauge ${m.status}`} title={`${m.count} / ${m.daily_limit} prompts used`}>
            <div className="gauge-label">
              {MODEL_LABELS[m.model] || m.model}
              {m.model === usage.active_model && <span className="active-dot" />}
            </div>
            <div className="gauge-bar-track">
              <div
                className={`gauge-bar-fill gauge-${m.status}`}
                style={{ width: `${Math.min(m.percentage, 100)}%` }}
              />
            </div>
            <div className="gauge-stats">
              <span>{m.count} / {m.daily_limit === 99999 ? '∞' : m.daily_limit}</span>
              <span className={`gauge-pct gauge-pct-${m.status}`}>{m.percentage}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tool & Agent Gauges */}
      <div className="quota-section-label" style={{ marginTop: '12px' }}>Tools & Agents</div>
      <div className="quota-gauges compact">
        {toolModels.map(m => (
          <div key={m.model} className={`quota-gauge mini ${m.status}`}>
            <div className="gauge-label">{MODEL_LABELS[m.model] || m.model}</div>
            <div className="gauge-bar-track">
              <div
                className={`gauge-bar-fill gauge-${m.status}`}
                style={{ width: `${Math.min(m.percentage, 100)}%` }}
              />
            </div>
            <div className="gauge-stats">
              <span>{m.count}/{m.daily_limit}</span>
              <span className={`gauge-pct gauge-pct-${m.status}`}>{m.percentage}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Auto-Throttle Cascade Visualizer */}
      <div className="cascade-strip" title="Auto-Throttle fallback order">
        <Activity size={12} />
        {usage.cascade.map((model, idx) => (
          <span key={model} className={`cascade-node ${model === usage.active_model ? 'cascade-active' : ''}`}>
            {MODEL_LABELS[model] || model}
            {idx < usage.cascade.length - 1 && <ArrowDown size={10} className="cascade-arrow" />}
          </span>
        ))}
      </div>

      {/* Throttle Event Log */}
      {history.length > 0 && (
        <div className="throttle-log">
          <div className="quota-section-label"><AlertTriangle size={12} /> Recent Throttle Events</div>
          {history.slice(0, 3).map(evt => (
            <div key={evt.id} className="throttle-event">
              <span className="te-time">{evt.timestamp.split(' ')[1] || evt.timestamp}</span>
              <span className="te-detail">{MODEL_LABELS[evt.from_model] || evt.from_model} → {MODEL_LABELS[evt.to_model] || evt.to_model}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
