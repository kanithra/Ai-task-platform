const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  inputText: {
    type: String,
    required: [true, 'Input text is required'],
    maxlength: [5000, 'Input text cannot exceed 5000 characters']
  },
  operation: {
    type: String,
    required: true,
    enum: ['uppercase', 'lowercase', 'reverse', 'word_count']
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'success', 'failed'],
    default: 'pending',
    index: true
  },
  result: {
    type: String,
    default: null
  },
  logs: [{
    timestamp: { type: Date, default: Date.now },
    level: { type: String, enum: ['info', 'error', 'warn'], default: 'info' },
    message: String
  }],
  jobId: { type: String, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  errorMessage: { type: String, default: null }
}, { timestamps: true });

// Compound indexes for common query patterns
taskSchema.index({ userId: 1, createdAt: -1 });
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('Task', taskSchema);
