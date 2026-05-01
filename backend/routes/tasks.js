const express = require('express');
const Task = require('../models/Task');
const { authenticate } = require('../middleware/auth');
const { taskQueue } = require('../config/queue');
const logger = require('../config/logger');

const router = express.Router();

// All task routes require authentication
router.use(authenticate);

// GET /api/tasks - List all tasks for user
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = { userId: req.user._id };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [tasks, total] = await Promise.all([
      Task.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Task.countDocuments(filter)
    ]);

    res.json({ tasks, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    logger.error('Get tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST /api/tasks - Create a new task
router.post('/', async (req, res) => {
  try {
    const { title, inputText, operation } = req.body;
    const validOps = ['uppercase', 'lowercase', 'reverse', 'word_count'];

    if (!title || !inputText || !operation) {
      return res.status(400).json({ error: 'title, inputText and operation are required' });
    }
    if (!validOps.includes(operation)) {
      return res.status(400).json({ error: `operation must be one of: ${validOps.join(', ')}` });
    }

    const task = await Task.create({
      userId: req.user._id,
      title,
      inputText,
      operation,
      status: 'pending',
      logs: [{ level: 'info', message: 'Task created and queued for processing' }]
    });

    // Push to Redis queue
    const job = await taskQueue.add({ taskId: task._id.toString(), operation, inputText }, { jobId: task._id.toString() });

    await Task.findByIdAndUpdate(task._id, { jobId: job.id });

    logger.info(`Task created: ${task._id} | op: ${operation}`);
    res.status(201).json({ message: 'Task created successfully', task });
  } catch (err) {
    logger.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// GET /api/tasks/:id - Get single task
router.get('/:id', async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ task });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid task ID' });
    logger.error('Get task error:', err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// DELETE /api/tasks/:id - Delete a task
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    logger.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// GET /api/tasks/:id/logs - Get task logs
router.get('/:id/logs', async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id }).select('logs status');
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ logs: task.logs, status: task.status });
  } catch (err) {
    logger.error('Get logs error:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;
