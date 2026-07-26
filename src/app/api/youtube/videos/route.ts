import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions, getAccessToken } from "@/lib/auth"

interface PlaylistVideosRequest {
  playlistId: string
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

    const body = await request.json() as PlaylistVideosRequest
    const { playlistId } = body

    if (!playlistId) {
      return NextResponse.json(
        { error: "Playlist ID is required" },
        { status: 400 }
      )
    }

    // Fetch playlist items to get video titles
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems")
    url.searchParams.set("part", "snippet,contentDetails")
    url.searchParams.set("maxResults", "5") // Get first 5 videos for categorization context
    url.searchParams.set("playlistId", playlistId)

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
        { error: "Failed to fetch playlist videos", details: errorData },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Extract video titles for better categorization context
    const videoTitles = data.items?.map((item: any) => item.snippet?.title).filter(Boolean) || []

    return NextResponse.json({
      playlistId,
      videoTitles,
      totalVideos: data.pageInfo?.totalResults || 0
    })

  } catch (error) {
    console.error("Error fetching playlist videos:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
