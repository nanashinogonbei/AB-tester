const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  userId: String,
  url: String,
  event: String,
  device: String,
  browser: String,
  os: String,
  language: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  exitTimestamp: Date
});

// インデックスの設定
logSchema.index({ projectId: 1, timestamp: -1 });
logSchema.index({ projectId: 1, userId: 1 });
logSchema.index({ projectId: 1, event: 1 });

module.exports = mongoose.model('Log', logSchema);
