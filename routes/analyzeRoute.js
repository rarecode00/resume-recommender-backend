const express = require('express');
const router = express.Router();
const Analysis = require('../models/Analysis');
const { upload, extractTextFromPDF, extractKeywords } = require('../utils/fileUtils');
const { getEmbedding, cosineSimilarity } = require('../services/embeddingService');

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    ai: 'HuggingFace Transformers (Direct API)',
    timestamp: new Date().toISOString()
  });
});

// Main analysis endpoint
router.post('/analyze', upload.array('resumes', 10), async (req, res) => {
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

    // Generate job description embedding
    console.log('🤖 Generating job description embedding...');
    const jobEmbedding = await getEmbedding(jobDescription);
    console.log(`✅ Job embedding generated (${jobEmbedding.length} dimensions)`);

    // Process resumes with delay to avoid rate limits
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        console.log(`📑 Processing resume ${i + 1}/${files.length}: ${file.originalname}`);
        
        const resumeText = await extractTextFromPDF(file.buffer);
        console.log(`✅ Extracted ${resumeText.length} characters`);
        
        // Delay between API calls
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

    // Sort by score and add rank
    results.sort((a, b) => b.score - a.score);
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

    // Save to database
    const sessionId = `session_${Date.now()}`;
    await Analysis.create({
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
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await Analysis.findOne({ sessionId: req.params.sessionId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
});

module.exports = router;