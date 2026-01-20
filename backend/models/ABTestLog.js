const mongoose = require('mongoose');

const abtestLogSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  abtestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ABTest',
    required: true
  },
  userId: String,
  creativeIndex: Number,
  creativeName: String,
  isOriginal: Boolean,
  url: String,
  device: String,
  browser: String,
  os: String,
  language: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// インデックスの設定
abtestLogSchema.index({ projectId: 1, abtestId: 1, timestamp: -1 });
abtestLogSchema.index({ abtestId: 1, creativeIndex: 1 });
abtestLogSchema.index({ userId: 1, abtestId: 1 });

module.exports = mongoose.model('ABTestLog', abtestLogSchema);
