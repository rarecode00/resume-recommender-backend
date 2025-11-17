require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-recommender',
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,
  FRONTEND_URL: process.env.FRONTEND_URL || '*'
};