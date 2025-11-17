const { HUGGINGFACE_API_KEY } = require('../config/env');

// Get embeddings using HuggingFace API
async function getEmbedding(text) {
  try {
    const truncatedText = text.substring(0, 5000);

    const response = await fetch(
      "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`,
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
      return result[0];
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

// Calculate cosine similarity between vectors
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

module.exports = {
  getEmbedding,
  cosineSimilarity
};