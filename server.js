const express = require('express');
const cors = require('cors');
const { PORT, FRONTEND_URL } = require('./config/env');
const connectDB = require('./config/db');
const analyzeRoute = require('./routes/analyzeRoute');

const app = express();

// CORS configuration
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json());

// Connect to database
connectDB();

// Routes
app.use('/api', analyzeRoute);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🤗 Using HuggingFace Direct API for embeddings`);
});