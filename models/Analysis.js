const mongoose = require('mongoose');

const analysisSchema = new mongoose.Schema({
  sessionId: String,
  jobDescription: String,
  results: Array,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Analysis', analysisSchema);