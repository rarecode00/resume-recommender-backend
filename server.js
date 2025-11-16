const express = require('express');
const multer = require('multer');
const cors = require('cors');
const mongoose = require('mongoose');
const pdf = require('pdf-parse');
require('dotenv').config();

const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-recommender')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Session Schema
const sessionSchema = new mongoose.Schema({
  sessionId: String,
  jobDescription: String,
  results: Array,
  createdAt: { type: Date, default: Date.now }
});

const Session = mongoose.model('Session', sessionSchema);

// File Upload Configuration
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Extract text from PDF
async function extractTextFromPDF(buffer) {
  try {
    const data = await pdf(buffer);
    return data.text.replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

// Get embeddings using direct HuggingFace API
async function getEmbedding(text) {
  try {
    const truncatedText = text.substring(0, 5000);

    const response = await fetch(
      "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: truncatedText,
          options: {
            wait_for_model: true,
            use_cache: false
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("HuggingFace API Error:", response.status, errorText);
      throw new Error(`HuggingFace API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result[0]; // embedding
    }

    if (Array.isArray(result)) {
      return result;
    }

    throw new Error("Unexpected embedding format from HuggingFace");
  } catch (error) {
    console.error("Embedding error:", error);
    throw new Error("Failed to generate embedding: " + error.message);
  }
}


// Calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    console.error('Invalid vectors for similarity calculation');
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Extract keywords
function extractKeywords(text, jobDescription, topN = 5) {
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'is', 'was', 'are', 'been', 'be', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
  ]);
  
  const resumeWords = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const jobWords = jobDescription.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  
  const jobWordSet = new Set(jobWords.filter(w => !commonWords.has(w)));
  const matchingWords = {};
  
  resumeWords.forEach(word => {
    if (jobWordSet.has(word) && !commonWords.has(word)) {
      matchingWords[word] = (matchingWords[word] || 0) + 1;
    }
  });
  
  if (Object.keys(matchingWords).length === 0) {
    const wordFreq = {};
    resumeWords.forEach(word => {
      if (!commonWords.has(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });
    
    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([word]) => word);
  }
  
  return Object.entries(matchingWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    ai: 'HuggingFace Transformers (Direct API)',
    timestamp: new Date().toISOString()
  });
});

// Main API Endpoint
app.post('/api/analyze', upload.array('resumes', 10), async (req, res) => {
  try {
    console.log('📥 Received analysis request');
    
    const { jobDescription } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No resumes uploaded' });
    }

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required' });
    }

    console.log(`📄 Processing ${files.length} resumes...`);

    // Get job description embedding
    console.log('🤖 Generating job description embedding...');
    const jobEmbedding = await getEmbedding(jobDescription);
    console.log(`✅ Job embedding generated (${jobEmbedding.length} dimensions)`);

    // Process all resumes with delay to avoid rate limits
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        console.log(`📑 Processing resume ${i + 1}/${files.length}: ${file.originalname}`);
        
        const resumeText = await extractTextFromPDF(file.buffer);
        console.log(`✅ Extracted ${resumeText.length} characters`);
        
        // Add delay between API calls to avoid rate limits
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        const resumeEmbedding = await getEmbedding(resumeText);
        const score = cosineSimilarity(jobEmbedding, resumeEmbedding);
        const keywords = extractKeywords(resumeText, jobDescription);

        console.log(`✅ ${file.originalname} - Score: ${(score * 100).toFixed(1)}%`);

        results.push({
          filename: file.originalname,
          score: score,
          keywords: keywords,
          textLength: resumeText.length
        });
      } catch (error) {
        console.error(`❌ Error processing ${file.originalname}:`, error);
        results.push({
          filename: file.originalname,
          score: 0,
          keywords: [],
          error: error.message
        });
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);
    
    // Add rank
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    // Save to database
    const sessionId = `session_${Date.now()}`;
    await Session.create({
      sessionId,
      jobDescription,
      results
    });

    console.log('✅ Analysis complete!');

    res.json({
      sessionId,
      results
    });

  } catch (error) {
    console.error('❌ Analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze resumes',
      details: error.message 
    });
  }
});

// Get session results
app.get('/api/session/:sessionId', async (req, res) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🤗 Using HuggingFace Direct API for embeddings`);
});