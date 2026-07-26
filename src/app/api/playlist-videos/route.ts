import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions, getAccessToken } from "@/lib/auth"

interface VideoItem {
  id: string
  snippet: {
    title: string
    description: string
    thumbnails: {
      high?: {
        url: string
        width: number
        height: number
      }
      medium?: {
        url: string
        width: number
        height: number
      }
      default?: {
        url: string
        width: number
        height: number
      }
    }
    channelTitle: string
    publishedAt: string
  }
  contentDetails: {
    duration: string
  }
}

interface VideosResponse {
  items: VideoItem[]
  nextPageToken?: string
  pageInfo: {
    totalResults: number
    resultsPerPage: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const accessToken = await getAccessToken(request)

    if (!session?.user?.email || !accessToken) {
      return NextResponse.json(
        { error: "Unauthorized - No access token found" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { playlistId } = body

    if (!playlistId) {
      return NextResponse.json(
        { error: "Playlist ID is required" },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const pageToken = searchParams.get("pageToken")
    
    const allVideos: VideoItem[] = []
    let currentPageToken: string | null = pageToken
    let hasMore = true

    // Fetch all videos with pagination
    while (hasMore) {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems")
      url.searchParams.set("part", "snippet,contentDetails")
      url.searchParams.set("maxResults", "50")
      url.searchParams.set("playlistId", playlistId)
      
      if (currentPageToken) {
        url.searchParams.set("pageToken", currentPageToken)
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("YouTube API Error:", errorData)
        return NextResponse.json(
          { error: "Failed to fetch videos from YouTube API", details: errorData },
          { status: response.status }
        )
      }

      const data: VideosResponse = await response.json()
      
      allVideos.push(...data.items)
      
      // If we received a pageToken from request, only return one page
      // Otherwise, fetch all pages
      if (pageToken) {
        return NextResponse.json({
          videos: data.items,
          nextPageToken: data.nextPageToken,
          pageInfo: data.pageInfo,
        })
      }
      
      currentPageToken = data.nextPageToken || null
      hasMore = !!currentPageToken
    }

    return NextResponse.json({
      videos: allVideos,
      pageInfo: {
        totalResults: allVideos.length,
        resultsPerPage: allVideos.length,
      },
    })

  } catch (error) {
    console.error("Error fetching videos:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
