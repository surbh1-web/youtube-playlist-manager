"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"

interface YouTubeVideo {
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

interface YouTubePlaylist {
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
  }
  contentDetails: {
    itemCount: number
  }
}

interface CachedData {
  categorizedPlaylists: Record<string, YouTubePlaylist[]>
  lastUpdated: string
}

interface VideosResponse {
  videos: YouTubeVideo[]
  pageInfo: {
    totalResults: number
    resultsPerPage: number
  }
  nextPageToken?: string
}

export default function PlaylistPage() {
  const router = useRouter()
  const params = useParams()
  const playlistId = params.playlistId as string
  
  const [videos, setVideos] = useState<YouTubeVideo[]>([])
  const [playlistName, setPlaylistName] = useState<string>("Playlist")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('title-az')
  const [channelFilter, setChannelFilter] = useState('all')

  const getPlaylistTitleFromCache = (playlistId: string): string => {
    try {
      const cachedData = localStorage.getItem('playlist-categories')
      if (cachedData) {
        const parsed: CachedData = JSON.parse(cachedData)
        
        // Search through all categories for the matching playlist
        for (const categoryPlaylists of Object.values(parsed.categorizedPlaylists)) {
          const playlist = categoryPlaylists.find(p => p.id === playlistId)
          if (playlist) {
            return playlist.snippet.title
          }
        }
      }
    } catch (error) {
      console.warn('Error reading playlist cache:', error)
    }
    
    return "Playlist" // Fallback title
  }

  const getUniqueChannels = (): string[] => {
    const channels = new Set(videos.map(video => video.snippet.channelTitle))
    return Array.from(channels).sort()
  }

  const getFilteredAndSortedVideos = (): YouTubeVideo[] => {
    let filtered = videos.filter(video => 
      video.snippet.title.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Apply channel filter
    if (channelFilter !== 'all') {
      filtered = filtered.filter(video => video.snippet.channelTitle === channelFilter)
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title-az':
          return a.snippet.title.localeCompare(b.snippet.title)
        case 'title-za':
          return b.snippet.title.localeCompare(a.snippet.title)
        case 'newest-first':
          return new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime()
        case 'oldest-first':
          return new Date(a.snippet.publishedAt).getTime() - new Date(b.snippet.publishedAt).getTime()
        default:
          return 0
      }
    })

    return filtered
  }

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setLoading(true)
        setError(null)

        // Set playlist title from cache
        const title = getPlaylistTitleFromCache(playlistId)
        setPlaylistName(title)

        const response = await fetch(`/api/youtube/playlists/${playlistId}/videos`)
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || "Failed to fetch videos")
        }

        const data: VideosResponse = await response.json()
        setVideos(data.videos || [])

      } catch (err) {
        console.error("Error fetching videos:", err)
        setError(err instanceof Error ? err.message : "An unknown error occurred")
      } finally {
        setLoading(false)
      }
    }

    if (playlistId) {
      fetchVideos()
    }
  }, [playlistId])

  // Update filtered videos when base data or filters change
  useEffect(() => {
    // This will trigger re-render of filtered results
  }, [videos, searchTerm, sortBy, channelFilter])

  const getThumbnailUrl = (video: YouTubeVideo) => {
    return video.snippet.thumbnails.high?.url ||
           video.snippet.thumbnails.medium?.url ||
           video.snippet.thumbnails.default?.url ||
           "/placeholder-video.jpg"
  }

  const handleVideoClick = (videoId: string) => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
          <p className="text-white">Loading videos...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
            <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <h3 className="text-red-400 font-semibold mb-2">Error Loading Videos</h3>
            <p className="text-slate-400 mb-4">{error}</p>
            <button
              onClick={() => router.back()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            ← Back
          </button>
          
          <h1 className="text-2xl font-bold text-white">{playlistName}</h1>
          
          <button
            onClick={() => router.push('/dashboard')}
            className="text-slate-300 hover:text-white transition-colors"
          >
            Home
          </button>
        </div>

        {/* Filter Bar */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 mb-6 border border-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search Box */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-300 mb-2">Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter videos..."
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-8 text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Sort</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="title-az">Title A-Z</option>
                <option value="title-za">Title Z-A</option>
                <option value="newest-first">Newest First</option>
                <option value="oldest-first">Oldest First</option>
              </select>
            </div>

            {/* Channel Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Channel</label>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All channels</option>
                {getUniqueChannels().map((channel) => (
                  <option key={channel} value={channel}>{channel}</option>
                ))}
              </select>
            </div>

            {/* Results Count */}
            <div className="flex items-center">
              <span className="text-sm text-slate-300">
                Showing {getFilteredAndSortedVideos().length} of {videos.length} videos
              </span>
            </div>
          </div>
        </div>

        {/* Videos Grid */}
        {videos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {getFilteredAndSortedVideos().map((video) => (
              <div
                key={video.id}
                onClick={() => handleVideoClick(video.id)}
                className="bg-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-700 hover:border-slate-600 transition-all cursor-pointer group hover:scale-105"
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-slate-700 relative">
                  <img
                    src={getThumbnailUrl(video)}
                    alt={video.snippet.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder-video.jpg"
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Video Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-white mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">
                    {video.snippet.title}
                  </h3>
                  <p className="text-slate-400 text-sm">
                    {video.snippet.channelTitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-12 border border-slate-700/50">
              <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              <h3 className="text-xl font-semibold text-white mb-2">No videos found</h3>
              <p className="text-slate-400 mb-4">
                This playlist doesn't have any videos yet.
              </p>
              <button
                onClick={() => router.back()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
