"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { useSession, signOut } from "next-auth/react"

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

const handleSignOut = async () => {
  if (typeof window !== 'undefined') {
    // Only clear playlist cache — do not clear everything
    // This prevents other users seeing this user's data
    // but preserves cache if same user signs back in
    localStorage.removeItem('playlist-categories')
    localStorage.removeItem('video-search-index')
    localStorage.removeItem('category-emojis')
    // Remove all playlist video caches
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('playlist-videos-')) {
        localStorage.removeItem(key)
      }
    })
  }
  await signOut({ callbackUrl: '/' })
}

export default function CategoryPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const categoryName = decodeURIComponent(params.categoryName as string)
  
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

  const [categoryPlaylists, setCategoryPlaylists] = useState<YouTubePlaylist[]>(() => {
  if (typeof window === 'undefined') return []
  try {
    const cached = localStorage.getItem('playlist-categories')
    if (cached) {
      const parsed = JSON.parse(cached)
      const playlists = parsed.categorizedPlaylists[categoryName] || []
      // Filter out empty playlists and hidden playlists
      const nonEmptyPlaylists = playlists.filter((playlist: YouTubePlaylist) => 
        playlist.contentDetails.itemCount !== 0 && 
        playlist.contentDetails.itemCount > 0
      )
      return nonEmptyPlaylists
    }
  } catch (e) {}
  return []
})
  const [loading, setLoading] = useState(true)
  const [showMoveDropdown, setShowMoveDropdown] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('name-az')
  const [lockConfirmation, setLockConfirmation] = useState<string | null>(null)
  const [videoCountFilter, setVideoCountFilter] = useState('all')

  useEffect(() => {
    const loadData = () => {
      try {
        console.log(`=== LOADING CATEGORY: ${categoryName} ===`)
        
        // Check if we already have data from lazy initial state
        if (Object.keys(categorizedPlaylists).length > 0 && categoryPlaylists.length > 0) {
          console.log('Using data from lazy initial state - instant load!')
          setLoading(false)
          return // Cache exists - skip all API calls
        }
        
        // Only fetch fresh data if localStorage is empty
        console.log('No cached data found, fetching fresh data...')
        
        // TODO: Add fresh data fetching logic here if needed
        // For now, just set loading to false
        
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [categoryName])

  // Update filtered playlists when base data or filters change
  useEffect(() => {
    // This will trigger re-render of filtered results
  }, [categoryPlaylists, searchTerm, sortBy, videoCountFilter])

  const getThumbnailUrl = (playlist: YouTubePlaylist) => {
    return playlist.snippet.thumbnails.high?.url ||
           playlist.snippet.thumbnails.medium?.url ||
           playlist.snippet.thumbnails.default?.url ||
           "/placeholder-playlist.jpg"
  }

  const movePlaylistToCategory = async (playlistId: string, targetCategory: string) => {
  try {
    // Step 1: Get current localStorage data
    const cached = localStorage.getItem('playlist-categories')
    if (!cached) {
      alert('Cache not found. Please refresh the page.')
      return
    }
    const data = JSON.parse(cached)
    const categories = { ...data.categorizedPlaylists }

    // Step 2: Find playlist in current category
    const playlist = categories[categoryName]?.find((p: YouTubePlaylist) => p.id === playlistId)
    if (!playlist) {
      alert('Playlist not found in current category.')
      return
    }

    console.log(`Moving "${playlist.snippet.title}" from "${categoryName}" to "${targetCategory}"`)

    // Step 3: Add to target category first
    if (!categories[targetCategory]) {
      categories[targetCategory] = []
    }
    categories[targetCategory] = [...categories[targetCategory], playlist]

    // Step 4: Remove from current category
    categories[categoryName] = categories[categoryName].filter((p: YouTubePlaylist) => p.id !== playlistId)

    // Step 5: Remove current category if now empty
    if (categories[categoryName].length === 0) {
      delete categories[categoryName]
    }

    // Step 6: Save to localStorage
    const updatedData = { ...data, categorizedPlaylists: categories }
    localStorage.setItem('playlist-categories', JSON.stringify(updatedData))

    // Step 7: Update UI state
    setCategoryPlaylists(categories[categoryName] || [])
    setCategorizedPlaylists(categories)

    // Step 8: Call API to lock playlist on server
    const response = await fetch('/api/lock-playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        playlistId,
        playlistName: playlist.snippet.title,
        targetCategory
      })
    })

    if (response.ok) {
      setLockConfirmation(`"${playlist.snippet.title}" moved to ${targetCategory}`)
      setTimeout(() => setLockConfirmation(null), 3000)
    } else {
      console.error('Failed to lock on server but localStorage updated successfully')
      setLockConfirmation(`Moved to ${targetCategory} (local only)`)
      setTimeout(() => setLockConfirmation(null), 3000)
    }
  } catch (error) {
    console.error('Move failed:', error)
    alert('Failed to move playlist. Please try again.')
  }
}

  const getHiddenPlaylists = (): string[] => {
    try {
      const hidden = localStorage.getItem('hidden-playlists')
      const hiddenPlaylists = hidden ? JSON.parse(hidden) : []
      console.log('getHiddenPlaylists called, returning:', hiddenPlaylists)
      return hiddenPlaylists
    } catch (error) {
      console.warn('Error reading hidden playlists:', error)
      return []
    }
  }

  const hidePlaylist = (playlistId: string) => {
    console.log(`=== HIDE PLAYLIST CALLED ===`)
    console.log('Hiding playlist ID:', playlistId)
    console.log('Call stack:', new Error().stack)
    console.log('========================')
    
    try {
      const hidden = getHiddenPlaylists()
      hidden.push(playlistId)
      localStorage.setItem('hidden-playlists', JSON.stringify(hidden))
      
      // Remove from current view
      setCategoryPlaylists(prev => prev.filter(p => p.id !== playlistId))
      
      // Update categorized playlists
      setCategorizedPlaylists(prev => {
        const updated = { ...prev }
        updated[categoryName] = updated[categoryName]?.filter(p => p.id !== playlistId) || []
        return updated
      })
    } catch (error) {
      console.error('Error hiding playlist:', error)
    }
  }

  const isPlaylistHidden = (playlistId: string): boolean => {
    const hiddenPlaylists = getHiddenPlaylists()
    const isHidden = hiddenPlaylists.includes(playlistId)
    console.log(`isPlaylistHidden: Checking playlist "${playlistId}" - Hidden: ${isHidden}`)
    return isHidden
  }

  const handlePlaylistClick = (playlistId: string) => {
    router.push(`/dashboard/playlist/${playlistId}`)
  }

  const getFilteredAndSortedPlaylists = (): YouTubePlaylist[] => {
    let filtered = categoryPlaylists.filter(playlist => 
      playlist.snippet.title.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // Apply video count filter
    if (videoCountFilter !== 'all') {
      filtered = filtered.filter(playlist => {
        const count = playlist.contentDetails.itemCount
        switch (videoCountFilter) {
          case '1-10':
            return count >= 1 && count <= 10
          case '11-50':
            return count >= 11 && count <= 50
          case '50+':
            return count > 50
          default:
            return true
        }
      })
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name-az':
          return a.snippet.title.localeCompare(b.snippet.title)
        case 'name-za':
          return b.snippet.title.localeCompare(a.snippet.title)
        case 'most-videos':
          return b.contentDetails.itemCount - a.contentDetails.itemCount
        case 'fewest-videos':
          return a.contentDetails.itemCount - b.contentDetails.itemCount
        case 'newest-first':
          return 0 // Default order (would need date info)
        case 'oldest-first':
          return 0 // Default order (would need date info)
        default:
          return 0
      }
    })

    return filtered
  }

  const getAvailableCategories = () => {
    return Object.keys(categorizedPlaylists).filter(cat => cat !== categoryName)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
          <p className="text-white">Loading category...</p>
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
          
          <h1 className="text-2xl font-bold text-white">{categoryName}</h1>
          
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition-colors"
          >
            Home
          </button>
          
          <button
            onClick={handleSignOut}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Sign Out
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
                placeholder="Filter playlists..."
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
                <option value="name-az">Name A-Z</option>
                <option value="name-za">Name Z-A</option>
                <option value="most-videos">Most Videos</option>
                <option value="fewest-videos">Fewest Videos</option>
                <option value="newest-first">Newest First</option>
                <option value="oldest-first">Oldest First</option>
              </select>
            </div>

            {/* Video Count Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Video Count</label>
              <select
                value={videoCountFilter}
                onChange={(e) => setVideoCountFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All</option>
                <option value="1-10">1-10 videos</option>
                <option value="11-50">11-50 videos</option>
                <option value="50+">50+ videos</option>
              </select>
            </div>

            {/* Results Count */}
            <div className="flex items-center">
              <span className="text-sm text-slate-300">
                Showing {getFilteredAndSortedPlaylists().length} of {categoryPlaylists.length} playlists
              </span>
            </div>
          </div>
        </div>

        {/* Playlists Grid */}
        {categoryPlaylists.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {getFilteredAndSortedPlaylists().map((playlist) => (
              <div key={playlist.id} className="relative group">
                <div
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
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      {playlist.contentDetails.itemCount} videos
                    </div>
                  </div>
                  
                  {/* Playlist Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-white mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">
                      {playlist.snippet.title}
                    </h3>
                    <p className="text-slate-400 text-sm">
                      {playlist.contentDetails.itemCount === 1 ? '1 video' : `${playlist.contentDetails.itemCount} videos`}
                    </p>
                  </div>
                </div>

                {/* Move Dropdown Button */}
                <div className="absolute top-2 right-2">
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowMoveDropdown(showMoveDropdown === playlist.id ? null : playlist.id)
                      }}
                      className="bg-black/70 hover:bg-black/80 text-white text-xs px-2 py-1 rounded transition-colors"
                    >
                      Move to...
                    </button>
                    
                    {showMoveDropdown === playlist.id && (
                      <div className="absolute top-full mt-1 right-0 bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-10 min-w-[150px]">
                        {getAvailableCategories().map((category) => (
                          <button
                            key={category}
                            onClick={(e) => {
                              e.stopPropagation()
                              movePlaylistToCategory(playlist.id, category)
                            }}
                            className="block w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors first:rounded-t-lg last:rounded-b-lg"
                          >
                            {category}
                          </button>
                        ))}
                        <hr className="border-slate-600 my-1" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            hidePlaylist(playlist.id)
                          }}
                          className="block w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors last:rounded-b-lg"
                        >
                          Hide
                        </button>
                        {getAvailableCategories().length === 0 && (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            No other categories
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-12 border border-slate-700/50">
              <h3 className="text-xl font-semibold text-white mb-2">No Playlists in This Category</h3>
              <p className="text-slate-400 mb-4">
                This category doesn't have any playlists yet.
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Back to Categories
              </button>
            </div>
          </div>
        )}
        
        {/* Lock Confirmation Message */}
        {lockConfirmation && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm">
            {lockConfirmation}
          </div>
        )}
      </div>
    </div>
  )
}
