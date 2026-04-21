// OpenAI Embeddings Helper Functions

interface EmbeddingResponse {
  data: Array<{
    embedding: number[]
  }>
}

export const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    })

    if (!response.ok) {
      throw new Error('Failed to generate embedding')
    }

    const data: EmbeddingResponse = await response.json()
    return data.data[0].embedding
  } catch (error) {
    console.error('Embedding error:', error)
    throw error
  }
}

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) {
    throw new Error('Vectors must be the same length')
  }

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    magnitudeA += a[i] * a[i]
    magnitudeB += b[i] * b[i]
  }

  magnitudeA = Math.sqrt(magnitudeA)
  magnitudeB = Math.sqrt(magnitudeB)

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0
  }

  return dotProduct / (magnitudeA * magnitudeB)
}

export const isWordSuperset = (newTitle: string, oldTitle: string): boolean => {
  const oldWords = oldTitle.toLowerCase().split(/\s+/).filter(word => word.length > 0)
  const newWords = newTitle.toLowerCase().split(/\s+/).filter(word => word.length > 0)
  
  // Check if all words in old title exist in new title
  return oldWords.every(word => newWords.includes(word))
}
