const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: String,
  url: String,
  apiKey: {
    type: String,
    required: true,
    unique: true
  }
});

module.exports = mongoose.model('Project', projectSchema);
