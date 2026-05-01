import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { tasksAPI } from '../api';
import { useAuth } from '../context/AuthContext';

const STATUS_ICON = { pending: '⏳', running: '⚡', success: '✓', failed: '✕' };

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pending: 0, running: 0, success: 0, failed: 0 });

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const res = await tasksAPI.list({ limit: 50 });
        const all = res.data.tasks;
        setTasks(all.slice(0, 5));
        setStats({
          total: res.data.total,
          pending: all.filter(t => t.status === 'pending').length,
          running: all.filter(t => t.status === 'running').length,
          success: all.filter(t => t.status === 'success').length,
          failed: all.filter(t => t.status === 'failed').length,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Welcome back, {user?.username} — here's your processing overview</p>
      </div>

      <div className="stats-row">
        {[
          { label: 'Total Tasks', value: stats.total, icon: '◈', color: '#7c6af7' },
          { label: 'Pending', value: stats.pending, icon: '⏳', color: '#f59e0b' },
          { label: 'Completed', value: stats.success, icon: '✓', color: '#22c55e' },
          { label: 'Failed', value: stats.failed, icon: '✕', color: '#ef4444' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{ background: s.color + '20' }}>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div>
              <div className="stat-value" style={{ color: s.color }}>{loading ? '—' : s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Recent Tasks</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tasks')}>View all →</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><div className="loader" /></div>
        ) : tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <div className="empty-title">No tasks yet</div>
            <div className="empty-text">Create your first AI task to get started</div>
            <button className="btn btn-primary" onClick={() => navigate('/tasks')}>+ New Task</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {tasks.map(task => (
              <div
                key={task._id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '14px 16px', background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius)', cursor: 'pointer',
                  border: '1px solid var(--border)', transition: 'all 0.15s'
                }}
                onClick={() => navigate(`/tasks/${task._id}`)}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <span style={{ fontSize: '18px' }}>{STATUS_ICON[task.status]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px' }}>{task.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{formatDate(task.createdAt)}</div>
                </div>
                <span className="task-op-badge">{task.operation}</span>
                <span className={`badge badge-${task.status}`}>
                  <span className="badge-dot"></span>
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
