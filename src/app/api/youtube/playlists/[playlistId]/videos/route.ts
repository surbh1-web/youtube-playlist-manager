import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions, getAccessToken } from "@/lib/auth"

interface YouTubeVideoItem {
  id: string
  snippet: {
    title: string
    description: string
    channelTitle: string
    publishedAt: string
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
  }
  contentDetails: {
    duration: string
  }
}

interface VideosResponse {
  videos: YouTubeVideoItem[]
  pageInfo: {
    totalResults: number
    resultsPerPage: number
  }
  nextPageToken?: string
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ playlistId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const accessToken = await getAccessToken(request)

    if (!session?.user?.email || !accessToken) {
      return NextResponse.json(
        { error: "Unauthorized - No access token found" },
        { status: 401 }
      )
    }

    const { playlistId } = await context.params

    // Fetch playlist items from YouTube API (token in header, never in the URL)
    const playlistItemsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlistId)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    )

    if (!playlistItemsResponse.ok) {
      const errorData = await playlistItemsResponse.json().catch(() => ({}))
      console.error("YouTube API Error:", errorData)
      return NextResponse.json(
        { error: "Failed to fetch playlist items from YouTube", details: errorData },
        { status: playlistItemsResponse.status }
      )
    }

    const playlistItemsData = await playlistItemsResponse.json()

    // Extract video IDs and fetch video details
    const videoIds = playlistItemsData.items
      ?.filter((item: any) => item.snippet.resourceId?.kind === "youtube#video")
      ?.map((item: any) => item.snippet.resourceId.videoId)
      ?.join(',')

    if (!videoIds) {
      return NextResponse.json({
        videos: [],
        pageInfo: {
          totalResults: 0,
          resultsPerPage: 0
        }
      })
    }

    // Fetch video details (token in header, never in the URL)
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoIds)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
    )

    if (!videosResponse.ok) {
      const errorData = await videosResponse.json().catch(() => ({}))
      console.error("YouTube Videos API Error:", errorData)
      return NextResponse.json(
        { error: "Failed to fetch video details from YouTube", details: errorData },
        { status: videosResponse.status }
      )
    }

    const videosData = await videosResponse.json()

    const videos: YouTubeVideoItem[] = videosData.items?.map((item: any) => ({
      id: item.id,
      snippet: {
        title: item.snippet.title,
        description: item.snippet.description,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnails: item.snippet.thumbnails
      },
      contentDetails: {
        duration: item.contentDetails.duration
      }
    })) || []

    const response: VideosResponse = {
      videos,
      pageInfo: {
        totalResults: playlistItemsData.pageInfo?.totalResults || 0,
        resultsPerPage: playlistItemsData.pageInfo?.resultsPerPage || 0
      },
      nextPageToken: playlistItemsData.nextPageToken
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error("Error in playlist videos API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
