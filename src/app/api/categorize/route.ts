import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

interface PlaylistForCategorization {
  id: string
  title: string
  description: string
  videoTitles?: string[]
}

interface CategorizedPlaylist {
  id: string
  category: string
}

// Helper function to categorize a single batch of playlists
async function categorizeBatch(
  batch: PlaylistForCategorization[], 
  batchNumber: number, 
  totalBatches: number
): Promise<Record<string, string>> {
  const apiKey = process.env.OPENAI_API_KEY
  console.log(`=== BATCH ${batchNumber}/${totalBatches} ===`)
  console.log("API Key available:", !!apiKey)
  
  const openai = new OpenAI({
    apiKey: apiKey,
  })

  // Prepare playlist data for AI with video titles
  const playlistData = batch.map((p, index) => {
    const videoContext = p.videoTitles && p.videoTitles.length > 0 
      ? `\n   Sample videos: ${p.videoTitles.slice(0, 3).join(", ")}`
      : '\n   Description: (none)'
    
    return `${index + 1}. ID: ${p.id}\n   Title: "${p.title}"${p.description ? `\n   Description: "${p.description}"` : ''}${videoContext}`
  }).join('\n\n')

  const systemPrompt = `You are a playlist categorizer. Given a playlist name and sample video titles, assign it to ONE of these categories: Food & Cooking, Fashion & Beauty, Fitness & Health, Kids Education, Technology & Learning, Dance, Music, Travel, Entertainment. You MUST pick one of these 10 categories. Never use General or Other. If unsure, pick the closest match based on video titles.

For each playlist, return the category name and also suggest a single relevant emoji for this category.

Here are playlists to categorize:
${playlistData}

Return JSON format: {"playlist_id": {"category": "category_name", "emoji": "emoji"}}`

  console.log(`Sending ${batch.length} playlists to OpenAI`)
  console.log("Playlist data length:", playlistData.length)
  console.log("First playlist sample:", playlistData.substring(0, 300))
  console.log("=== OPENAI API CALL START ===")
  console.log("Model: gpt-4o-mini")
  console.log("Temperature: 0.1")
  console.log("Max tokens: 2000")

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        }
      ],
      temperature: 0.1, // Lower temperature for more consistent results
      max_tokens: 2000,
    })

    console.log("=== OPENAI API RESPONSE RECEIVED ===")
    console.log("Response status:", completion.choices.length > 0 ? "SUCCESS" : "NO_CHOICES")
    console.log("Number of choices:", completion.choices.length)
    console.log("Usage:", completion.usage)
    
    const responseContent = completion.choices[0]?.message?.content
    
    if (!responseContent) {
      console.error("=== OPENAI RESPONSE ERROR ===")
      console.error("No response content from OpenAI")
      console.error("Full completion object:", JSON.stringify(completion, null, 2))
      console.error("Choices array:", completion.choices)
      console.error("Message object:", completion.choices[0]?.message)
      throw new Error("No response from OpenAI")
    }

    console.log("=== OPENAI RESPONSE CONTENT ===")
    console.log("Response length:", responseContent.length)
    console.log("Raw response (first 300 chars):", responseContent.substring(0, 300))
    console.log("Raw response (last 300 chars):", responseContent.length > 300 ? responseContent.substring(responseContent.length - 300) : responseContent)
    console.log("Response contains JSON:", responseContent.includes("{"))
    console.log("Response contains playlist IDs:", responseContent.includes("playlist_id") || responseContent.includes("id"))

    // Parse the JSON response
    let categorizedPlaylists: Record<string, string>
    let categoryEmojis: Record<string, string> = {}
    
    console.log("=== JSON PARSING START ===")
    
    try {
      // Clean up the response and parse JSON
      let cleanResponse = responseContent.trim()
      console.log("Original response trimmed length:", cleanResponse.length)
      
      // Remove any markdown code blocks more robustly
      cleanResponse = cleanResponse.replace(/```json\s*\n?/g, '').replace(/```\s*\n?/g, '')
      console.log("After markdown removal length:", cleanResponse.length)
      
      // Try to find JSON object in the response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        cleanResponse = jsonMatch[0]
        console.log("Found JSON object via regex, length:", cleanResponse.length)
      } else {
        console.log("No JSON object found via regex")
        console.log("Cleaned response (first 500 chars):", cleanResponse.substring(0, 500))
      }
      
      console.log("Final clean response (first 200 chars):", cleanResponse.substring(0, 200))
      console.log("Final clean response (last 200 chars):", cleanResponse.length > 200 ? cleanResponse.substring(cleanResponse.length - 200) : cleanResponse)
      
      const parsedResponse = JSON.parse(cleanResponse)
      
      // Extract categories and emojis from the new response format
      categorizedPlaylists = {}
      categoryEmojis = {}
      
      for (const [playlistId, categoryData] of Object.entries(parsedResponse)) {
        if (typeof categoryData === 'string') {
          // Legacy format: just category name
          categorizedPlaylists[playlistId] = categoryData
        } else if (categoryData && typeof categoryData === 'object' && 'category' in categoryData) {
          // New format: {category: "name", emoji: "emoji"}
          const data = categoryData as { category: string; emoji?: string }
          categorizedPlaylists[playlistId] = data.category
          if (data.emoji) {
            categoryEmojis[playlistId] = data.emoji
          }
        }
      }
      
      console.log("=== JSON PARSING SUCCESS ===")
      console.log("Parsed playlists count:", Object.keys(categorizedPlaylists).length)
      console.log("Parsed playlist IDs:", Object.keys(categorizedPlaylists))
      console.log("Parsed categories:", Object.values(categorizedPlaylists))
      console.log("Parsed emojis:", Object.values(categoryEmojis))
      
      // Store emojis in localStorage for dynamic categories
      if (Object.keys(categoryEmojis).length > 0) {
        try {
          const existingEmojis = localStorage.getItem('category-emojis')
          const allEmojis = existingEmojis ? { ...JSON.parse(existingEmojis), ...categoryEmojis } : categoryEmojis
          localStorage.setItem('category-emojis', JSON.stringify(allEmojis))
          console.log("Stored category emojis in localStorage:", Object.keys(categoryEmojis).length)
        } catch (e) {
          console.error("Failed to store category emojis in localStorage:", e)
        }
      }
      
    } catch (parseError: any) {
      console.error("=== JSON PARSING FAILED ===")
      console.error("Parse error type:", parseError?.constructor?.name || 'Unknown')
      console.error("Parse error message:", parseError instanceof Error ? parseError.message : parseError?.message || 'Unknown error')
      console.error("Raw response (first 500 chars):", responseContent.substring(0, 500))
      console.error("Raw response (last 500 chars):", responseContent.length > 500 ? responseContent.substring(responseContent.length - 500) : responseContent)
      throw new Error(`Failed to parse AI response: ${parseError instanceof Error ? parseError.message : parseError?.message || 'Unknown error'}`)
    }

    return categorizedPlaylists
    
  } catch (openaiError) {
    console.error(`OpenAI API call failed for batch ${batchNumber}:`, openaiError)
    
    // Check for specific OpenAI errors
    if (openaiError instanceof Error) {
      if (openaiError.message.includes("401") || openaiError.message.includes("authentication")) {
        console.error("OpenAI authentication error - invalid API key")
      }
      if (openaiError.message.includes("429") || openaiError.message.includes("rate limit")) {
        console.error("OpenAI rate limit exceeded")
      }
      if (openaiError.message.includes("quota") || openaiError.message.includes("billing")) {
        console.error("OpenAI quota/billing issue")
      }
    }
    
    throw openaiError
  }
}

export async function POST(request: NextRequest) {
  try {
    // First, check if OpenAI API key is available
    const apiKey = process.env.OPENAI_API_KEY
    console.log("=== OPENAI API KEY CHECK ===")
    console.log("API Key exists:", !!apiKey)
    console.log("API Key length:", apiKey?.length || 0)
    console.log("API Key starts with 'sk-':", apiKey?.startsWith('sk-') || false)
    console.log("API Key starts with 'sk-proj-':", apiKey?.startsWith('sk-proj-') || false)
    
    if (!apiKey) {
      console.error("ERROR: OPENAI_API_KEY environment variable is not set")
      return NextResponse.json(
        { error: "OpenAI API key is missing. Please set OPENAI_API_KEY environment variable." },
        { status: 500 }
      )
    }
    
    if (!apiKey || (!apiKey.startsWith('sk-') && !apiKey.startsWith('sk-proj-'))) {
      console.error("ERROR: OPENAI_API_KEY is missing or has invalid format")
      return NextResponse.json(
        { error: "Invalid OpenAI API key format. API key should start with 'sk-' or 'sk-proj-'" },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { playlists }: { playlists: PlaylistForCategorization[] } = body

    if (!playlists || !Array.isArray(playlists)) {
      return NextResponse.json(
        { error: "Invalid request: playlists array is required" },
        { status: 400 }
      )
    }

    console.log("=== CATEGORIZATION START ===")
    console.log("Playlists to categorize:", playlists.length)
    console.log("Sample playlist data:", playlists.slice(0, 3).map(p => ({ 
      id: p.id, 
      title: p.title, 
      description: p.description?.substring(0, 100) + "..." 
    })))

    const openai = new OpenAI({
      apiKey: apiKey,
    })

    // Test OpenAI connection with a simple API call
    console.log("=== TESTING OPENAI CONNECTION ===")
    try {
      const testResponse = await openai.models.list()
      console.log("OpenAI connection successful. Available models:", testResponse.data.length)
    } catch (testError) {
      console.error("OpenAI connection test failed:", testError)
      return NextResponse.json(
        { error: `OpenAI API connection failed: ${testError instanceof Error ? testError.message : 'Unknown error'}` },
        { status: 500 }
      )
    }

    // Fetch video titles for better categorization context
    console.log("🔄 Fetching video titles for all playlists...")
    const playlistsWithContext = await Promise.all(
      playlists.map(async (playlist) => { // Process ALL playlists, not just 20
        try {
          const videoResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/youtube/videos`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ playlistId: playlist.id })
          })

          if (videoResponse.ok) {
            const videoData = await videoResponse.json()
            return {
              ...playlist,
              videoTitles: videoData.videoTitles || []
            }
          } else {
            return playlist // Return original playlist if video fetch fails
          }
        } catch (error) {
          console.warn(`Failed to fetch videos for playlist ${playlist.id}:`, error)
          return playlist // Return original playlist if video fetch fails
        }
      })
    )

    console.log("✅ Video titles fetched for", playlistsWithContext.length, "playlists")

    // Process playlists in batches to handle OpenAI token limits
    const BATCH_SIZE = 15
    const totalBatches = Math.ceil(playlistsWithContext.length / BATCH_SIZE)
    console.log(`📦 Processing ${playlistsWithContext.length} playlists in ${totalBatches} batches of ${BATCH_SIZE}`)
    
    let allCategorizedPlaylists: Record<string, string> = {}
    let processedCount = 0

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * BATCH_SIZE
      const endIndex = Math.min(startIndex + BATCH_SIZE, playlistsWithContext.length)
      const batch = playlistsWithContext.slice(startIndex, endIndex)
      
      console.log(`🔄 Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} playlists)`)
      
      try {
        const batchResults = await categorizeBatch(batch, batchIndex + 1, totalBatches)
        
        // Merge batch results
        Object.assign(allCategorizedPlaylists, batchResults)
        processedCount += batch.length
        
        console.log(`✅ Batch ${batchIndex + 1} complete. Processed ${processedCount}/${playlistsWithContext.length} playlists`)
        
        // Add a small delay between batches to avoid rate limiting
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
        
      } catch (error) {
      }
    }

    console.log(`All batches complete! Categorized ${Object.keys(allCategorizedPlaylists).length} playlists`)

    // Check for missing playlists
    const inputPlaylistIds = playlists.map(p => p.id)
    const categorizedPlaylistIds = Object.keys(allCategorizedPlaylists)
    const missingPlaylistIds = inputPlaylistIds.filter(id => !categorizedPlaylistIds.includes(id))
    
    if (missingPlaylistIds.length > 0) {
      console.log(`=== MISSING PLAYLISTS FOUND: ${missingPlaylistIds.length} ===`)
      const missingPlaylists = playlists.filter(p => missingPlaylistIds.includes(p.id))
      console.log("Missing playlists found:", missingPlaylists.map(p => `${p.id}: "${p.title}"`))
      
      // Re-process missing playlists in a separate batch
      console.log("=== RETRYING MISSING PLAYLISTS ===")
      try {
        const missingPlaylistsWithContext = playlistsWithContext.filter(p => missingPlaylistIds.includes(p.id))
        const retryResults = await categorizeBatch(missingPlaylistsWithContext, 999, 999) // Use special batch number
        
        // Add retry results to main results
        Object.assign(allCategorizedPlaylists, retryResults)
        
        // Check if any are still missing after retry
        const stillMissingIds = missingPlaylistIds.filter(id => !Object.keys(retryResults).includes(id))
        
        if (stillMissingIds.length > 0) {
          console.log(`=== STILL MISSING AFTER RETRY: ${stillMissingIds.length} ===`)
          const stillMissingPlaylists = playlists.filter(p => stillMissingIds.includes(p.id))
          console.log("Still missing playlists:", stillMissingPlaylists.map(p => `${p.id}: "${p.title}"`))
          
          // Use fallback: assign to category with most keyword overlap
          console.log("=== USING FALLBACK CATEGORIZATION ===")
          const categories = ["Food & Cooking", "Fashion & Beauty", "Fitness & Health", "Kids Education", "Technology & Learning", "Dance", "Music", "Travel", "Entertainment"]
          
          for (const playlist of stillMissingPlaylists) {
            let bestCategory = "Entertainment" // default fallback
            let bestScore = 0
            
            for (const category of categories) {
              const categoryKeywords = category.toLowerCase().split(/\s+(?:&|and)\s+/)
              const playlistTitle = playlist.title.toLowerCase()
              
              let score = 0
              for (const keyword of categoryKeywords) {
                if (playlistTitle.includes(keyword)) {
                  score += 1
                }
              }
              
              if (score > bestScore) {
                bestScore = score
                bestCategory = category
              }
            }
            
            allCategorizedPlaylists[playlist.id] = bestCategory
            console.log(`Fallback: Assigned "${playlist.title}" to "${bestCategory}" (score: ${bestScore})`)
          }
        } else {
          console.log("All missing playlists successfully categorized on retry!")
        }
      } catch (retryError) {
        console.error("Retry failed for missing playlists:", retryError)
        
        // Ultimate fallback - assign all missing to "Entertainment"
        const stillMissingPlaylists = playlists.filter(p => missingPlaylistIds.includes(p.id) && !allCategorizedPlaylists[p.id])
        for (const playlist of stillMissingPlaylists) {
          allCategorizedPlaylists[playlist.id] = "Entertainment"
          console.log(`Ultimate fallback: Assigned "${playlist.title}" to Entertainment`)
        }
      }
    }

    console.log(`Final result: ${Object.keys(allCategorizedPlaylists).length}/${playlists.length} playlists categorized`)

    // Log final category distribution
    const categoryCount: Record<string, number> = {}
    Object.values(allCategorizedPlaylists).forEach(category => {
      categoryCount[category] = (categoryCount[category] || 0) + 1
    })
    console.log("📊 Final category distribution:", categoryCount)

    // Validate the response using batch results
    const result: CategorizedPlaylist[] = []
    for (const playlist of playlists) {
      const category = allCategorizedPlaylists[playlist.id]
      if (!category) {
        console.warn("⚠️ No category found for playlist:", playlist.id, playlist.title)
        // Don't default to "General" - let the frontend handle missing categories
      } else {
        result.push({ id: playlist.id, category: category.trim() })
      }
    }

    // Group playlists by category for easier frontend processing
    const groupedByCategory: Record<string, CategorizedPlaylist[]> = {}
    result.forEach(item => {
      if (!groupedByCategory[item.category]) {
        groupedByCategory[item.category] = []
      }
      groupedByCategory[item.category].push(item)
    })

    console.log("🎉 Final categorization complete!")
    console.log("📂 Categories created:", Object.keys(groupedByCategory).sort())

    return NextResponse.json({
      categorizedPlaylists: result,
      groupedByCategory,
      categories: Object.keys(groupedByCategory).sort()
    })

  } catch (error) {
    console.error("💥 Error in categorization API:", error)
    
    // Check for OpenAI API errors
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        console.error("🔑 OpenAI API key error")
        return NextResponse.json(
          { error: "Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable." },
          { status: 401 }
        )
      }
      if (error.message.includes("quota") || error.message.includes("rate limit")) {
        console.error("💸 OpenAI quota exceeded")
        return NextResponse.json(
          { error: "OpenAI API quota exceeded. Please check your billing." },
          { status: 429 }
        )
      }
    }

    return NextResponse.json(
      { error: "Failed to categorize playlists. Please try again." },
      { status: 500 }
    )
  }
}
