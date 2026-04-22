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
