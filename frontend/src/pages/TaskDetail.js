import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { tasksAPI } from '../api';

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTask = useCallback(async () => {
    try {
      const res = await tasksAPI.get(id);
      setTask(res.data.task);
    } catch (err) {
      setError('Task not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTask();
    // Poll every 3 seconds if task is pending/running
    const interval = setInterval(() => {
      if (task && (task.status === 'pending' || task.status === 'running')) {
        fetchTask();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchTask, task?.status]);

  const formatDate = (d) => d ? new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }) : '—';

  const formatLogTime = (d) => new Date(d).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  if (loading) return <div style={{ textAlign: 'center', padding: '80px' }}><div className="loader" /></div>;
  if (error) return (
    <div>
      <button className="btn btn-secondary" onClick={() => navigate('/tasks')}>← Back</button>
      <div className="alert alert-error" style={{ marginTop: '20px' }}>⚠ {error}</div>
    </div>
  );

  const duration = task.startedAt && task.completedAt
    ? `${((new Date(task.completedAt) - new Date(task.startedAt)) / 1000).toFixed(2)}s`
    : null;

  return (
    <div>
      <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tasks')} style={{ marginBottom: '24px' }}>
        ← Back to Tasks
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Task Info */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Task Details</h2>
            <span className={`badge badge-${task.status}`}>
              <span className="badge-dot"></span>
              {task.status}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { label: 'Title', value: task.title },
              { label: 'Operation', value: <span className="task-op-badge">{task.operation}</span> },
              { label: 'Created', value: formatDate(task.createdAt) },
              { label: 'Started', value: formatDate(task.startedAt) },
              { label: 'Completed', value: formatDate(task.completedAt) },
              { label: 'Duration', value: duration || '—' },
              { label: 'Job ID', value: <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{task.jobId || '—'}</span> },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: '90px', flexShrink: 0, textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px', paddingTop: '2px' }}>{label}</span>
                <span style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Input Text</h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{task.inputText.length} chars</span>
          </div>
          <div className="log-terminal" style={{ maxHeight: '200px' }}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {task.inputText}
            </pre>
          </div>
        </div>
      </div>

      {/* Result */}
      {task.result && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-header">
            <h2 className="card-title" style={{ color: 'var(--success)' }}>✓ Result</h2>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigator.clipboard.writeText(task.result)}
            >
              Copy
            </button>
          </div>
          <div className="result-box">
            {task.operation === 'word_count'
              ? (() => {
                  try {
                    const data = JSON.parse(task.result);
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        {Object.entries(data).map(([k, v]) => (
                          <div key={k} style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
                            <div style={{ fontSize: '24px', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--accent-bright)' }}>{v}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>{k.replace(/_/g, ' ')}</div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch { return task.result; }
                })()
              : task.result
            }
          </div>
        </div>
      )}

      {/* Error */}
      {task.errorMessage && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          ✕ Error: {task.errorMessage}
        </div>
      )}

      {/* Logs */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Execution Logs</h2>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{task.logs?.length || 0} entries</span>
        </div>
        <div className="log-terminal">
          {task.logs?.length > 0 ? (
            task.logs.map((log, i) => (
              <div key={i} className="log-entry">
                <span className="log-time">{formatLogTime(log.timestamp)}</span>
                <span className={`log-level-${log.level}`}>[{log.level.toUpperCase()}]</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>No logs available</span>
          )}
        </div>
      </div>
    </div>
  );
}
