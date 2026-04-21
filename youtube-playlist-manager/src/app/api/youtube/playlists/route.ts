import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"

interface YouTubePlaylist {
  id: string
  snippet: {
    title: string
    description: string
    channelTitle: string
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
    itemCount: number
  }
  status: {
    privacyStatus: string
  }
}

interface PlaylistsResponse {
  items: YouTubePlaylist[]
  nextPageToken?: string
  pageInfo: {
    totalResults: number
    resultsPerPage: number
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized - No access token found" },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const pageToken = searchParams.get("pageToken")
    
    const allPlaylists: YouTubePlaylist[] = []
    let currentPageToken: string | null = pageToken
    let hasMore = true

    // Fetch all playlists with pagination
    while (hasMore) {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlists")
      url.searchParams.set("part", "snippet,contentDetails,status")
      url.searchParams.set("maxResults", "50")
      url.searchParams.set("mine", "true")
      
      if (currentPageToken) {
        url.searchParams.set("pageToken", currentPageToken)
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("YouTube API Error:", errorData)
        
        // Check for token expiration (401 or 403)
        if (response.status === 401 || response.status === 403) {
          return NextResponse.json(
            { 
              error: "token_expired", 
              message: "Google access token expired" 
            },
            { status: 401 }
          )
        }
        
        return NextResponse.json(
          { error: "Failed to fetch playlists from YouTube API", details: errorData },
          { status: response.status }
        )
      }

      const data: PlaylistsResponse = await response.json()
      
      // Debug: Log exact data structure of first 3 playlists
      console.log("=== PLAYLIST DATA STRUCTURE DEBUG ===")
      console.log("First 3 playlists:")
      data.items.slice(0, 3).forEach((playlist, index) => {
        console.log(`Playlist ${index + 1}:`, {
          id: playlist.id,
          title: playlist.snippet?.title,
          contentDetails: playlist.contentDetails,
          itemCount: playlist.contentDetails?.itemCount,
          // Log all possible video count fields
          videoCount: (playlist as any).videoCount,
          fullContentDetails: playlist.contentDetails
        })
      })
      console.log("=== END DEBUG ===")
      
      // Filter out auto-generated YouTube playlists
      const filteredPlaylists = data.items.filter((playlist: YouTubePlaylist) => {
        const playlistId = playlist.id || ''
        const title = playlist.snippet?.title || ''
        const channelTitle = playlist.snippet?.channelTitle || ''
        
        // Remove playlists with auto-generated IDs
        if (playlistId.startsWith('WL') || playlistId.startsWith('LL') || playlistId.startsWith('RD')) {
          return false
        }
        
        // Remove playlists with empty titles
        if (!title || title.trim() === '') {
          return false
        }
        
        // Remove playlists where title matches channel name exactly
        if (title === channelTitle) {
          return false
        }
        
        return true
      })
      
      allPlaylists.push(...filteredPlaylists)
      
      // If we received a pageToken from the request, only return one page
      // Otherwise, fetch all pages
      if (pageToken) {
        return NextResponse.json({
          playlists: data.items,
          nextPageToken: data.nextPageToken,
          pageInfo: data.pageInfo,
        })
      }
      
      currentPageToken = data.nextPageToken || null
      hasMore = !!currentPageToken
    }

    return NextResponse.json({
      playlists: allPlaylists,
      pageInfo: {
        totalResults: allPlaylists.length,
        resultsPerPage: allPlaylists.length,
      },
    })

  } catch (error) {
    console.error("Error fetching playlists:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
