const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema({
  devices: [String],
  browsers: [String],
  oss: [String],
  languages: [String],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Suggestion', suggestionSchema);
