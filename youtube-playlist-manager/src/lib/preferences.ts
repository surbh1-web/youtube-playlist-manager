import { promises as fs } from 'fs'
import path from 'path'
import { UserPreferences } from '@/types/preferences'

const PREFERENCES_FILE_PATH = path.join(process.cwd(), 'data', 'user-preferences.json')

export const sanitizeInput = (text: string): string => {
  if (typeof text !== 'string') return ''
  
  // Remove HTML tags and dangerous content
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim()
}

export const readPreferences = async (): Promise<UserPreferences> => {
  try {
    const data = await fs.readFile(PREFERENCES_FILE_PATH, 'utf8')
    const preferences = JSON.parse(data)
    
    // Validate structure
    if (!preferences || typeof preferences !== 'object') {
      throw new Error('Invalid preferences structure')
    }
    
    return {
      playlists: preferences.playlists || {},
      lockedPlaylists: preferences.lockedPlaylists || {},
      categories: preferences.categories || [],
      lastSync: preferences.lastSync || null
    }
  } catch (error) {
    console.warn('Error reading preferences, using defaults:', error)
    return {
      playlists: {},
      lockedPlaylists: {},
      categories: [],
      lastSync: null
    }
  }
}

export const writePreferences = async (data: UserPreferences): Promise<boolean> => {
  try {
    // Validate data structure before writing
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data structure')
    }
    
    const validatedData = {
      playlists: data.playlists || {},
      lockedPlaylists: data.lockedPlaylists || {},
      categories: data.categories || [],
      lastSync: data.lastSync || null
    }
    
    // Use file locking to prevent concurrent writes
    const fileData = JSON.stringify(validatedData, null, 2)
    await fs.writeFile(PREFERENCES_FILE_PATH, fileData, 'utf8')
    
    return true
  } catch (error) {
    console.error('Error writing preferences:', error)
    return false
  }
}
