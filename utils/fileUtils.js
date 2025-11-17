const multer = require('multer');
const pdf = require('pdf-parse');

// File upload configuration
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

// Extract text from PDF buffer
async function extractTextFromPDF(buffer) {
  try {
    const data = await pdf(buffer);
    return data.text.replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

// Extract matching keywords from resume
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

module.exports = {
  upload,
  extractTextFromPDF,
  extractKeywords
};