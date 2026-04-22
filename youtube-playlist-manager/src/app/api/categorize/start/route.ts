import { NextRequest, NextResponse } from "next/server"

interface CategorizeJob {
  id: string
  status: 'fetching' | 'categorizing' | 'finalizing' | 'completed' | 'error'
  progress: {
    current: number
    total: number
    message: string
  }
  result?: any
  error?: string
  startTime: number
}

// In-memory store for jobs (in production, use Redis or database)
const jobs = new Map<string, CategorizeJob>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playlists }: { playlists: any[] } = body

    if (!playlists || !Array.isArray(playlists)) {
      return NextResponse.json(
        { error: "Invalid request: playlists array is required" },
        { status: 400 }
      )
    }

    // Generate unique job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Initialize job
    const job: CategorizeJob = {
      id: jobId,
      status: 'fetching',
      progress: {
        current: 0,
        total: playlists.length,
        message: 'Fetching your playlists...'
      },
      startTime: Date.now()
    }
    
    jobs.set(jobId, job)
    
    // Start categorization in background
    runCategorization(jobId, playlists)
    
    return NextResponse.json({ jobId })
    
  } catch (error) {
    console.error("Error starting categorization:", error)
    return NextResponse.json(
      { error: "Failed to start categorization" },
      { status: 500 }
    )
  }
}

async function runCategorization(jobId: string, playlists: any[]) {
  const job = jobs.get(jobId)
  if (!job) return
  
  try {
    // Update status to fetching
    job.status = 'fetching'
    job.progress = {
      current: 0,
      total: playlists.length,
      message: 'Fetching your playlists...'
    }
    
    // Import the categorize route to access its functions
    const categorizeModule = await import('../route')
    
    // Simulate progress updates during categorization
    job.status = 'categorizing'
    
    const totalBatches = Math.ceil(playlists.length / 15) // BATCH_SIZE from main route
    let processedCount = 0
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchSize = Math.min(15, playlists.length - processedCount)
      processedCount += batchSize
      
      job.progress = {
        current: processedCount,
        total: playlists.length,
        message: `Categorizing playlists... Batch ${batchIndex + 1} of ${totalBatches}`
      }
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    // Finalizing
    job.status = 'finalizing'
    job.progress = {
      current: playlists.length,
      total: playlists.length,
      message: 'Almost done... finalizing categories'
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Mark as completed
    job.status = 'completed'
    job.progress = {
      current: playlists.length,
      total: playlists.length,
      message: 'Categorization complete!'
    }
    
    // For now, just return a mock result
    job.result = { categorizedPlaylists: [], groupedByCategory: {}, categories: [] }
    
  } catch (error) {
    console.error("Categorization failed:", error)
    job.status = 'error'
    job.error = error instanceof Error ? error.message : 'Unknown error'
    job.progress.message = 'Error during categorization'
  }
}

// Export progress endpoint
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')
  
  if (!jobId) {
    return NextResponse.json(
      { error: "Job ID is required" },
      { status: 400 }
    )
  }
  
  const job = jobs.get(jobId)
  if (!job) {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404 }
    )
  }
  
  // Clean up old jobs (older than 1 hour)
  const now = Date.now()
  for (const [id, job] of jobs.entries()) {
    if (now - job.startTime > 3600000) { // 1 hour
      jobs.delete(id)
    }
  }
  
  return NextResponse.json(job)
}
