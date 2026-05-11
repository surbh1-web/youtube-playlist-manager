"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"

// Disable static generation to allow useSession
export const dynamic = 'force-dynamic'

interface YouTubePlaylist {
  id: string
  snippet: {
    title: string
    description: string
    thumbnails: {
      high?: { url: string; width: number; height: number }
      medium?: { url: string; width: number; height: number }
      default?: { url: string; width: number; height: number }
    }
  }
  contentDetails: {
    itemCount: number
  }
  status: {
    privacyStatus: string
  }
}

interface ExtendedPlaylist extends YouTubePlaylist {
  categoryName: string
}

interface CachedData {
  categorizedPlaylists: Record<string, YouTubePlaylist[]>
  lastUpdated: string
  userEmail?: string
}

const CATEGORY_CONFIG: Record<string, { emoji: string; gradient: string; border: string }> = {
  'Food & Cooking': { emoji: '🍛', gradient: 'linear-gradient(135deg, #1a3a2a 0%, #0d2b1e 100%)', border: '#2d6a4f40' },
  'Fashion & Beauty': { emoji: '👗', gradient: 'linear-gradient(135deg, #3a1a3a 0%, #2b0d2b 100%)', border: '#9b2c9b40' },
  'Fitness & Health': { emoji: '💪', gradient: 'linear-gradient(135deg, #1a2a3a 0%, #0d1e2b 100%)', border: '#2c6a9b40' },
  'Dance': { emoji: '💃', gradient: 'linear-gradient(135deg, #3a2a1a 0%, #2b1e0d 100%)', border: '#9b6a2c40' },
  'Technology & Learning': { emoji: '💻', gradient: 'linear-gradient(135deg, #1a1a3a 0%, #0d0d2b 100%)', border: '#2c2c9b40' },
  'Kids Education': { emoji: '🎒', gradient: 'linear-gradient(135deg, #3a3a1a 0%, #2b2b0d 100%)', border: '#9b9b2c40' },
  'Travel': { emoji: '✈️', gradient: 'linear-gradient(135deg, #1a3a3a 0%, #0d2b2b 100%)', border: '#2c9b9b40' },
  'Music': { emoji: '🎵', gradient: 'linear-gradient(135deg, #3a1a2a 0%, #2b0d1e 100%)', border: '#9b2c6a40' },
  'Entertainment': { emoji: '🎬', gradient: 'linear-gradient(135deg, #3a1a1a 0%, #2b0d0d 100%)', border: '#9b2c2c40' },
  'Motivation & Self Improvement': { emoji: '🌟', gradient: 'linear-gradient(135deg, #3a2a1a 0%, #2b1e0d 100%)', border: '#9b7a2c40' },
}

const FALLBACK_COLORS = [
  { gradient: 'linear-gradient(135deg, #1a2a3a 0%, #0d1e2b 100%)', border: '#2c5a7a40' },
  { gradient: 'linear-gradient(135deg, #2a1a3a 0%, #1e0d2b 100%)', border: '#5a2c7a40' },
  { gradient: 'linear-gradient(135deg, #3a1a2a 0%, #2b0d1e 100%)', border: '#7a2c5a40' },
  { gradient: 'linear-gradient(135deg, #1a3a2a 0%, #0d2b1e 100%)', border: '#2c7a5a40' },
  { gradient: 'linear-gradient(135deg, #3a3a1a 0%, #2b2b0d 100%)', border: '#7a7a2c40' },
  { gradient: 'linear-gradient(135deg, #1a1a3a 0%, #0d0d2b 100%)', border: '#2c2c7a40' },
]

const getCategoryConfig = (categoryName: string, index: number) => {
  if (CATEGORY_CONFIG[categoryName]) return { ...CATEGORY_CONFIG[categoryName] }
  
  // Check localStorage for dynamic category emojis
  try {
    const categoryEmojis = localStorage.getItem('category-emojis')
    if (categoryEmojis) {
      const emojis: Record<string, string> = JSON.parse(categoryEmojis)
      if (emojis[categoryName]) {
        const fallback = FALLBACK_COLORS[index % FALLBACK_COLORS.length]
        return { emoji: emojis[categoryName], ...fallback }
      }
    }
  } catch (e) {}
  
  const fallback = FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  return { emoji: '📁', ...fallback }
}

const handleSignOut = async () => {
  await signOut({ callbackUrl: '/' })
}

export default function Dashboard() {
  const sessionData = useSession()
  const router = useRouter()
  
  // Check for token refresh errors and redirect to sign in if refresh fails
  useEffect(() => {
    if (sessionData.status === 'authenticated' && sessionData.data?.error === 'RefreshAccessTokenError') {
      console.error('Token refresh failed, signing out user')
      signOut({ callbackUrl: '/auth/signin' })
    }
  }, [sessionData])
  const [categorizedPlaylists, setCategorizedPlaylists] = useState<Record<string, YouTubePlaylist[]>>(() => {
  if (typeof window === 'undefined') return {}
  try {
    const cached = localStorage.getItem('playlist-categories')
    if (cached) {
      const parsed = JSON.parse(cached)
      return parsed.categorizedPlaylists || {}
    }
  } catch (e) {}
  return {}
})
  const [loading, setLoading] = useState(true)
  const [recategorizing, setRecategorizing] = useState(false)
  const [showHiddenPlaylists, setShowHiddenPlaylists] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('name-az')
  const [activeMode, setActiveMode] = useState('Categories')
  const [buildingIndex, setBuildingIndex] = useState(false)
  const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0 })
  const [syncStatus, setSyncStatus] = useState<string>('')
  const [newPlaylists, setNewPlaylists] = useState<any[]>([])
  const [deletedCount, setDeletedCount] = useState<number>(0)
  const [cacheAge, setCacheAge] = useState<string>('')

  const getHiddenPlaylists = (): string[] => {
    try {
      const hidden = localStorage.getItem('hidden-playlists')
      return hidden ? JSON.parse(hidden) : []
    } catch (error) {
      console.warn('Error reading hidden playlists:', error)
      return []
    }
  }

  const getHiddenPlaylistsWithDetails = (): YouTubePlaylist[] => {
    const hiddenIds = getHiddenPlaylists()
    const hiddenPlaylists: YouTubePlaylist[] = []
    
    Object.values(categorizedPlaylists).forEach(categoryPlaylists => {
      categoryPlaylists.forEach(playlist => {
        if (hiddenIds.includes(playlist.id)) {
          hiddenPlaylists.push(playlist)
        }
      })
    })
    
    return hiddenPlaylists
  }

  const unhidePlaylist = (playlistId: string) => {
    try {
      const hidden = getHiddenPlaylists()
      const updatedHidden = hidden.filter(id => id !== playlistId)
      localStorage.setItem('hidden-playlists', JSON.stringify(updatedHidden))
      
      // Refresh data
      fetchPlaylistsAndCategories()
    } catch (error) {
      console.error('Error unhiding playlist:', error)
    }
  }

  const getCacheAge = (lastUpdated: string): string => {
    if (!lastUpdated) return 'Unknown'
    
    const now = new Date()
    const lastSync = new Date(lastUpdated)
    const diffMs = now.getTime() - lastSync.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffHours < 1) return 'Less than 1 hour ago'
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays === 1) return '1 day ago'
    return `${diffDays} days ago`
  }

  const validateCacheData = (data: any): data is CachedData => {
    return data && 
           typeof data === 'object' && 
           data.categorizedPlaylists && 
           typeof data.categorizedPlaylists === 'object' &&
           data.lastUpdated &&
           typeof data.lastUpdated === 'string'
  }

  const runBackgroundSync = async () => {
    try {
      setSyncStatus('syncing')
      
      const response = await fetch('/api/sync', {
        method: 'POST',
        credentials: 'include'
      })
      
      if (!response.ok) {
        console.error('Background sync failed')
        setSyncStatus('idle')
        return
      }
      
      const result = await response.json()
      
      // Handle changes silently without full reload
      if (result.deletedPlaylists?.length > 0) {
        const cachedData = localStorage.getItem('playlist-categories')
        if (cachedData) {
          const parsed = JSON.parse(cachedData)
          result.deletedPlaylists.forEach((deletedId: string) => {
            Object.keys(parsed.categorizedPlaylists).forEach(category => {
              parsed.categorizedPlaylists[category] = parsed.categorizedPlaylists[category].filter(
                (playlist: any) => playlist.id !== deletedId
              )
            })
          })
          
          // Remove empty categories
          Object.keys(parsed.categorizedPlaylists).forEach(category => {
            if (parsed.categorizedPlaylists[category].length === 0) {
              delete parsed.categorizedPlaylists[category]
            }
          })
          
          console.log("Saving to cache")
          localStorage.setItem('playlist-categories', JSON.stringify(parsed))
          setCategorizedPlaylists(parsed.categorizedPlaylists)
          setCacheAge('Just now')
        }
      }
      
      if (result.newPlaylists?.length > 0 || result.renamedPlaylists?.length > 0) {
        // If there are new or renamed playlists, do a full refresh
        fetchPlaylistsAndCategories(false)
      }
      
      setSyncStatus('done')
      setTimeout(() => setSyncStatus('idle'), 3000)
    } catch (error) {
      console.error('Background sync error:', error)
      setSyncStatus('idle')
    }
  }

  const fetchPlaylistsAndCategories = async (useCache = true) => {
    try {
      // Check localStorage first for instant display
      const cachedData = localStorage.getItem('playlist-categories')
      if (cachedData && useCache) {
        try {
          const parsed = JSON.parse(cachedData)
          if (validateCacheData(parsed)) {
            setCategorizedPlaylists(parsed.categorizedPlaylists)
            setCacheAge(getCacheAge(parsed.lastUpdated))
            setLoading(false) // Hide loading immediately
            
            // Check if cache is recent (< 24 hours)
            const lastSync = new Date(parsed.lastUpdated)
            const now = new Date()
            const diffHours = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60)
            
            // If cache is recent, run sync in background but skip full fetch
            if (diffHours < 24) {
              runBackgroundSync()
              return
            }
          }
        } catch (e) {
          console.warn('Failed to parse cached data:', e)
        }
      }

      // If no cache or cache is old, proceed with full fetch
      setLoading(true)
      console.log('fetchPlaylistsAndCategories: Starting full fetch')

      try {
        // Fetch playlists from API
        const playlistsResponse = await fetch("/api/youtube/playlists", {
          credentials: 'include' // Include authentication session
        })
        if (!playlistsResponse.ok) {
          if (playlistsResponse.status === 401) {
            throw new Error("Please sign in again")
          }
          throw new Error(`Failed to fetch playlists: ${playlistsResponse.status}`)
        }
        const playlistsData = await playlistsResponse.json()
        const fetchedPlaylists = playlistsData.playlists || []

        // Fetch categories from API
        const categorizeResponse = await fetch("/api/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: 'include', // Include authentication session
          body: JSON.stringify({
            playlists: fetchedPlaylists.map((p: YouTubePlaylist) => ({
              id: p.id,
              title: p.snippet.title,
              description: p.snippet.description
            }))
          })
        })

        if (!categorizeResponse.ok) {
          if (categorizeResponse.status === 401) {
            throw new Error("Please sign in again")
          }
          throw new Error(`Failed to categorize playlists: ${categorizeResponse.status}`)
        }

        const categorizationData = await categorizeResponse.json()
        
        // Group playlists by category
        const grouped: Record<string, YouTubePlaylist[]> = {}
        fetchedPlaylists.forEach((playlist: YouTubePlaylist) => {
          const category = categorizationData.categorizedPlaylists.find((cp: any) => cp.id === playlist.id)?.category
          if (category) {
            if (!grouped[category]) {
              grouped[category] = []
            }
            grouped[category].push(playlist)
          }
        })
        
        setCategorizedPlaylists(grouped)
        setCacheAge('Just now')

        // Store in localStorage
        const cacheData: CachedData = {
          categorizedPlaylists: grouped,
          lastUpdated: new Date().toISOString(),
          userEmail: sessionData.data?.user?.email || undefined
        }
        console.log("Saving to cache")
        localStorage.setItem('playlist-categories', JSON.stringify(cacheData))

      } catch (fetchError: any) {
        console.error('Fetch error:', fetchError)
        if (fetchError?.message === "Please sign in again") {
          // Redirect to login page
          router.push('/auth/signin')
          return
        }
        
        // Show error to user
        if (fetchError?.error === "token_expired") {
          // Clear session and show specific message
          alert("Your Google session has expired. Please sign in again.")
          
          // Clear current session and redirect to homepage
          setTimeout(() => {
            router.push('/')
          }, 2000)
          return
        }
        
        alert(`Error: ${fetchError?.message || 'Unknown error occurred'}`)
      }
    } catch (error: any) {
      console.error("Error in fetchPlaylistsAndCategories:", error)
      alert(`Error: Failed to load playlists. Please try again.`)
    } finally {
      setLoading(false)
      setRecategorizing(false)
    }
  }

  useEffect(() => {
  // If cache exists, check if it belongs to current user
  if (Object.keys(categorizedPlaylists).length > 0) {
    const cached = localStorage.getItem('playlist-categories')
    if (cached) {
      const parsed = JSON.parse(cached)
      // If different user, clear and refetch
      if (parsed.userEmail && sessionData.data?.user?.email && parsed.userEmail !== sessionData.data.user.email) {
        localStorage.removeItem('playlist-categories')
        fetchPlaylistsAndCategories(false)
        return
      }
      console.log("Cache loaded successfully")
    }
    // Same user — use cache instantly
    setLoading(false)
    return
  }
  // No cache — fetch fresh
  fetchPlaylistsAndCategories()
}, [sessionData.data?.user?.email])

  const handleRecategorize = () => {
    localStorage.removeItem('playlist-categories')
    setRecategorizing(true)
    fetchPlaylistsAndCategories(false)
  }

  const getThumbnailUrl = (playlist: YouTubePlaylist) => {
    return playlist.snippet.thumbnails.high?.url ||
           playlist.snippet.thumbnails.medium?.url ||
           playlist.snippet.thumbnails.default?.url ||
           "/placeholder-playlist.jpg"
  }

  const handleCategoryClick = (categoryName: string) => {
    router.push(`/dashboard/category/${encodeURIComponent(categoryName)}`)
  }

  const handlePlaylistClick = (playlistId: string) => {
    router.push(`/dashboard/playlist/${playlistId}`)
  }

  const handleVideoClick = (videoId: string) => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank')
  }

  // Search playlists across all categories
  const searchPlaylists = (): { playlist: YouTubePlaylist; category: string }[] => {
    // Return empty array if search term is empty to show normal category grid
    if (searchTerm.trim() === '') return []
    
    const hiddenPlaylists = getHiddenPlaylists()
    const results: { playlist: YouTubePlaylist; category: string }[] = []
    
    Object.entries(categorizedPlaylists).forEach(([categoryName, playlists]) => {
      playlists.forEach(playlist => {
        if (
          playlist.contentDetails.itemCount > 0 &&
          !hiddenPlaylists.includes(playlist.id) &&
          playlist.snippet.title.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          results.push({ playlist, category: categoryName })
        }
      })
    })
    
    return results
  }

  // Build video search index
  const buildVideoIndex = async (): Promise<void> => {
    try {
      setBuildingIndex(true)
      
      // Get all playlists across all categories
      const allPlaylists: (YouTubePlaylist & { categoryName: string })[] = []
      Object.entries(categorizedPlaylists).forEach(([categoryName, playlists]) => {
        playlists.forEach(playlist => {
          if (playlist.contentDetails.itemCount > 0) {
            allPlaylists.push({ ...playlist, categoryName })
          }
        })
      })
      
      setIndexProgress({ current: 0, total: allPlaylists.length })
      
      const videoIndex: {
        videoId: string
        videoTitle: string
        playlistId: string
        playlistName: string
        categoryName: string
        thumbnailUrl: string
      }[] = []
      
      // Process playlists one by one
      for (let i = 0; i < allPlaylists.length; i++) {
        const playlist = allPlaylists[i]
        
        try {
          const response = await fetch(`/api/youtube/playlists/${playlist.id}/videos`)
          if (response.ok) {
            const videosData = await response.json()
            const videos = videosData.videos || []
            
            videos.forEach((video: any) => {
              videoIndex.push({
                videoId: video.id,
                videoTitle: video.snippet.title,
                playlistId: playlist.id,
                playlistName: playlist.snippet.title,
                categoryName: playlist.categoryName,
                thumbnailUrl: video.snippet.thumbnails?.high?.url || 
                               video.snippet.thumbnails?.medium?.url || 
                               video.snippet.thumbnails?.default?.url || 
                               "/placeholder-video.jpg"
              })
            })
          }
        } catch (error) {
          console.warn(`Failed to fetch videos for playlist ${playlist.id}:`, error)
        }
        
        // Update progress
        setIndexProgress({ current: i + 1, total: allPlaylists.length })
      }
      
      // Save index to localStorage
      localStorage.setItem('video-search-index', JSON.stringify(videoIndex))
      
    } catch (error) {
      console.error('Error building video index:', error)
    } finally {
      setBuildingIndex(false)
    }
  }

  // Check if video index exists and build if needed
  const ensureVideoIndex = async (): Promise<void> => {
    const existingIndex = localStorage.getItem('video-search-index')
    if (!existingIndex) {
      await buildVideoIndex()
    }
  }

  // Search videos from index
  const searchVideos = (): {
    videoId: string
    videoTitle: string
    playlistId: string
    playlistName: string
    categoryName: string
    thumbnailUrl: string
  }[] => {
    try {
      // Return empty array if search term is empty to show normal category grid
      if (searchTerm.trim() === '') return []
      
      const indexData = localStorage.getItem('video-search-index')
      if (!indexData) return []
      
      const videoIndex = JSON.parse(indexData)
      
      // Filter by search text first
      const filteredVideos = videoIndex.filter((video: any) =>
        video.videoTitle.toLowerCase().includes(searchTerm.toLowerCase())
      )
      
      // Deduplicate by videoId - keep first occurrence
      const uniqueVideos = new Map()
      filteredVideos.forEach((video: any) => {
        if (!uniqueVideos.has(video.videoId)) {
          uniqueVideos.set(video.videoId, video)
        }
      })
      
      return Array.from(uniqueVideos.values())
    } catch (error) {
      console.warn('Error searching videos:', error)
      return []
    }
  }

  // Filter and sort categories
  const filteredAndSortedCategories = useMemo(() => {
    const hiddenPlaylists = getHiddenPlaylists()
    let categories: Record<string, YouTubePlaylist[]> = {}
    
    // Filter out empty categories and hidden playlists
    Object.entries(categorizedPlaylists).forEach(([categoryName, playlists]) => {
      const visiblePlaylists = playlists.filter(playlist => 
        playlist.contentDetails.itemCount > 0 &&
        !hiddenPlaylists.includes(playlist.id)
      )
      
      if (visiblePlaylists.length > 0) {
        categories[categoryName] = visiblePlaylists
      }
    })

    // Apply search filter only for Categories mode
    if (activeMode === 'Categories' && searchTerm.trim() !== '') {
      const filtered: Record<string, YouTubePlaylist[]> = {}
      Object.entries(categories).forEach(([categoryName, playlists]) => {
        if (categoryName.toLowerCase().includes(searchTerm.toLowerCase())) {
          filtered[categoryName] = playlists
        }
      })
      categories = filtered
    }

    // Sort categories
    const sortedEntries = Object.entries(categories).sort(([a], [b]) => {
      switch (sortBy) {
        case 'name-az':
          return a.localeCompare(b)
        case 'name-za':
          return b.localeCompare(a)
        case 'most-playlists':
          return categories[b].length - categories[a].length
        case 'fewest-playlists':
          return categories[a].length - categories[b].length
        default:
          return 0
      }
    })
    
    return Object.fromEntries(sortedEntries)
  }, [categorizedPlaylists, activeMode, searchTerm, sortBy])

  const handleSearchChange = async (value: string) => {
    setSearchTerm(value)
    
    // Build video index when user switches to Videos mode and types for the first time
    if (activeMode === 'Videos' && value.trim() !== '') {
      await ensureVideoIndex()
    }
  }

  const clearSearch = () => {
    setSearchTerm('')
  }

  const handleModeChange = (mode: string) => {
    setActiveMode(mode)
    clearSearch() // Clear search when switching modes
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
          <p className="text-white">Loading your playlists...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">YouTube Playlist Manager</h1>
            <p className="text-slate-400">
              {Object.keys(categorizedPlaylists).length} categories
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleRecategorize}
              disabled={recategorizing}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {recategorizing && (
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              Re-categorize All Playlists
            </button>
            <button
              onClick={() => setShowHiddenPlaylists(true)}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Manage Hidden Playlists ({getHiddenPlaylists().length})
            </button>
            <button
              onClick={handleSignOut}
              className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Search and Controls */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8">
          {/* Search Box */}
          <div className="relative flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-2">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={
                activeMode === 'Categories' ? 'Search categories...' :
                activeMode === 'Playlists' ? 'Search playlists...' :
                'Search video titles...'
              }
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
            />
            {searchTerm && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-8 text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="w-full lg:w-48">
            <label className="block text-sm font-medium text-slate-300 mb-2">Sort</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="name-az">Name A-Z</option>
              <option value="name-za">Name Z-A</option>
              <option value="most-playlists">Most Playlists</option>
              <option value="fewest-playlists">Fewest Playlists</option>
            </select>
          </div>

          {/* Results Count */}
          <div className="flex items-end">
            <span className="text-sm text-slate-300">
              {activeMode === 'Playlists' && searchTerm.trim() !== ''
                ? `Showing ${searchPlaylists().length} results`
                : activeMode === 'Videos' && searchTerm.trim() !== ''
                ? `Showing ${searchVideos().length} results`
                : `Showing ${Object.keys(filteredAndSortedCategories).length} of ${Object.keys(categorizedPlaylists).length} categories`
              }
            </span>
            {cacheAge && activeMode === 'Categories' && (
              <span className="text-xs text-slate-500 ml-2">
                Last updated: {cacheAge}
              </span>
            )}
          </div>
        </div>

        {/* Video Index Building Progress */}
        {buildingIndex && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 mb-6 border border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                <span className="text-slate-300">
                  Building search index... {indexProgress.current}/{indexProgress.total} playlists
                </span>
              </div>
              <div className="w-32 bg-slate-700 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(indexProgress.current / indexProgress.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Grid */}
        {activeMode === 'Playlists' && searchTerm.trim() !== '' ? (
          // Playlists Search Results
          searchPlaylists().length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {searchPlaylists().map(({ playlist, category }, index) => (
                <div
                  key={`${category}-${playlist.id}-${index}`}
                  onClick={() => handlePlaylistClick(playlist.id)}
                  className="bg-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-700 hover:border-slate-600 transition-all cursor-pointer group hover:scale-105"
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-slate-700 relative">
                    <img
                      src={getThumbnailUrl(playlist)}
                      alt={playlist.snippet.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/placeholder-playlist.jpg"
                      }}
                    />
                  </div>
                  
                  {/* Playlist Info */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                        {playlist.snippet.title}
                      </h3>
                      <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded-full ml-2 flex-shrink-0">
                        {playlist.contentDetails.itemCount}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mb-2">
                      {playlist.contentDetails.itemCount === 1 ? '1 video' : `${playlist.contentDetails.itemCount} videos`}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {category}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-12 border border-slate-700/50">
                <h3 className="text-xl font-semibold text-white mb-2">No Playlists Found</h3>
                <p className="text-slate-400 mb-4">
                  No playlists match your search.
                </p>
                <button
                  onClick={clearSearch}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Clear Search
                </button>
              </div>
            </div>
          )
        ) : activeMode === 'Videos' && searchTerm.trim() !== '' ? (
          // Videos Search Results
          searchVideos().length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {searchVideos().map((video, index) => (
                <div
                  key={`${video.videoId}-${video.playlistId}-${index}`}
                  onClick={() => handleVideoClick(video.videoId)}
                  className="bg-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-700 hover:border-slate-600 transition-all cursor-pointer group hover:scale-105"
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-slate-700 relative">
                    <img
                      src={video.thumbnailUrl}
                      alt={video.videoTitle}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/placeholder-video.jpg"
                      }}
                    />
                  </div>
                  
                  {/* Video Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-2 mb-2">
                      {video.videoTitle}
                    </h3>
                    <p className="text-slate-400 text-sm mb-1">
                      {video.playlistName}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {video.categoryName}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-12 border border-slate-700/50">
                <h3 className="text-xl font-semibold text-white mb-2">No Videos Found</h3>
                <p className="text-slate-400 mb-4">
                  No videos match your search.
                </p>
                <button
                  onClick={clearSearch}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Clear Search
                </button>
              </div>
            </div>
          )
        ) : (
          // Categories Grid (normal view)
          Object.keys(filteredAndSortedCategories).length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Object.keys(filteredAndSortedCategories).map((categoryName, index) => {
                const config = getCategoryConfig(categoryName, index)
                const playlists = categorizedPlaylists[categoryName] || []
                return (
                  <div
                    key={categoryName}
                    onClick={() => router.push(`/dashboard/category/${encodeURIComponent(categoryName)}`)}
                    style={{
                      background: config.gradient,
                      border: `1px solid ${config.border}`,
                      borderRadius: '16px',
                      padding: '28px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '14px',
                      cursor: 'pointer',
                      minHeight: '160px',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-4px)'
                      e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.4)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div style={{ fontSize: '44px' }}>{config.emoji}</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, textAlign: 'center', color: 'white', letterSpacing: '0.3px' }}>
                      {categoryName}
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.75, background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: '20px', color: 'white' }}>
                      {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-12 border border-slate-700/50">
                <h3 className="text-xl font-semibold text-white mb-2">No Categories Found</h3>
                <p className="text-slate-400 mb-4">
                  {searchTerm.trim() !== '' 
                    ? "No categories match your search." 
                    : "Your playlists haven't been categorized yet."}
                </p>
                {searchTerm.trim() !== '' ? (
                  <button
                    onClick={clearSearch}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Clear Search
                  </button>
                ) : (
                  <button
                    onClick={handleRecategorize}
                    disabled={recategorizing}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    {recategorizing ? 'Categorizing...' : 'Categorize Playlists'}
                  </button>
                )}
              </div>
            </div>
          )
        )}

        {/* Hidden Playlists Modal */}
        {showHiddenPlaylists && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-white">Manage Hidden Playlists</h2>
                  <button
                    onClick={() => setShowHiddenPlaylists(false)}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                {getHiddenPlaylistsWithDetails().length > 0 ? (
                  <div className="space-y-3">
                    {getHiddenPlaylistsWithDetails().map((playlist, index) => (
                      <div key={`hidden-${playlist.id}-${index}`} className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                        <div className="flex-1">
                          <h3 className="font-semibold text-white mb-1">{playlist.snippet.title}</h3>
                          <p className="text-slate-400 text-sm">{playlist.contentDetails.itemCount} videos</p>
                        </div>
                        <button
                          onClick={() => unhidePlaylist(playlist.id)}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                        >
                          Unhide
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-slate-400">No hidden playlists found.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sync Status Indicator */}
        {syncStatus === 'syncing' && (
          <div className="fixed bottom-4 left-4 bg-slate-800 text-white px-3 py-2 rounded-lg shadow-lg text-sm z-50">
            Checking for new playlists...
          </div>
        )}
        {syncStatus === 'new_found' && (
          <div className="fixed bottom-4 left-4 bg-slate-800 text-white px-3 py-2 rounded-lg shadow-lg text-sm z-50">
            {newPlaylists.length} new playlists found — categorizing...
          </div>
        )}
        {syncStatus === 'deleted_found' && (
          <div className="fixed bottom-4 left-4 bg-slate-800 text-white px-3 py-2 rounded-lg shadow-lg text-sm z-50">
            {deletedCount} playlists removed
          </div>
        )}
        {/* Show nothing when syncStatus is 'idle' or 'done' */}
      </div>
    </div>
  )
}
