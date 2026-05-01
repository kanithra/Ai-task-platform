import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { tasksAPI } from '../api';

const OPERATIONS = [
  { value: 'uppercase', label: 'UPPERCASE', desc: 'Convert text to uppercase' },
  { value: 'lowercase', label: 'lowercase', desc: 'Convert text to lowercase' },
  { value: 'reverse', label: 'esreveR', desc: 'Reverse the text string' },
  { value: 'word_count', label: 'Word Count', desc: 'Count words, chars, lines' },
];

const STATUS_FILTERS = ['all', 'pending', 'running', 'success', 'failed'];

export default function Tasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState({ title: '', inputText: '', operation: 'uppercase' });

  const fetchTasks = useCallback(async () => {
    try {
      const params = { page, limit: 9 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await tasksAPI.list(params);
      setTasks(res.data.tasks);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await tasksAPI.create(form);
      setShowCreate(false);
      setForm({ title: '', inputText: '', operation: 'uppercase' });
      setStatusFilter('all');
      setPage(1);
      fetchTasks();
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this task?')) return;
    await tasksAPI.delete(id);
    fetchTasks();
  };

  const formatDate = (d) => new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">{total} task{total !== 1 ? 's' : ''} total</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Task</button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            className={`filter-btn ${statusFilter === s ? 'active' : ''}`}
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}><div className="loader" /></div>
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◈</div>
          <div className="empty-title">No tasks found</div>
          <div className="empty-text">
            {statusFilter !== 'all' ? `No ${statusFilter} tasks` : 'Create your first task to get started'}
          </div>
          {statusFilter === 'all' && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Task</button>
          )}
        </div>
      ) : (
        <>
          <div className="tasks-grid">
            {tasks.map(task => (
              <div key={task._id} className="task-card" onClick={() => navigate(`/tasks/${task._id}`)}>
                <div className="task-card-header">
                  <div>
                    <div className="task-title">{task.title}</div>
                    <div className="task-meta" style={{ marginTop: '6px' }}>
                      <span className="task-op-badge">{task.operation}</span>
                      <span>{formatDate(task.createdAt)}</span>
                    </div>
                  </div>
                  <span className={`badge badge-${task.status}`}>
                    <span className="badge-dot"></span>
                    {task.status}
                  </span>
                </div>

                <div className="task-preview">
                  {task.inputText.slice(0, 80)}{task.inputText.length > 80 ? '...' : ''}
                </div>

                {task.result && (
                  <div className="task-preview" style={{ borderLeft: '2px solid var(--success)', marginTop: '6px', color: 'var(--success)' }}>
                    ✓ {String(task.result).slice(0, 60)}{String(task.result).length > 60 ? '...' : ''}
                  </div>
                )}

                <div className="task-actions">
                  <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/tasks/${task._id}`); }}>
                    View Details
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={(e) => handleDelete(e, task._id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {total > 9 && (
            <div className="pagination">
              <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Page {page} of {Math.ceil(total / 9)}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / 9)} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* Create Task Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">New Task</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>

            {createError && <div className="alert alert-error">⚠ {createError}</div>}

            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Task Title</label>
                <input
                  className="form-input"
                  placeholder="e.g. Process customer feedback"
                  value={form.title}
                  onChange={e => setForm({...form, title: e.target.value})}
                  required maxLength={100}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Operation</label>
                <select
                  className="form-select"
                  value={form.operation}
                  onChange={e => setForm({...form, operation: e.target.value})}
                >
                  {OPERATIONS.map(op => (
                    <option key={op.value} value={op.value}>{op.label} — {op.desc}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Input Text</label>
                <textarea
                  className="form-textarea"
                  placeholder="Enter the text to process..."
                  value={form.inputText}
                  onChange={e => setForm({...form, inputText: e.target.value})}
                  required maxLength={5000}
                  style={{ minHeight: '120px' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {form.inputText.length}/5000 characters
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={creating}>
                  {creating ? <><span className="loader" /> Creating...</> : '▶ Create & Run'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
