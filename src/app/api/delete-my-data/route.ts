import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { deleteUserPlaylistData, getUserKey } from '@/lib/preferences'

// Deletes all playlist data stored server-side for the signed-in user.
// Does NOT touch authentication: the client signs the user out afterwards, and the
// next login rebuilds playlist data from YouTube as usual.
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const ok = await deleteUserPlaylistData(getUserKey(session.user.email))
    if (!ok) {
      return NextResponse.json({ error: 'Failed to delete data' }, { status: 500 })
    }
    return NextResponse.json({ message: 'Playlist data deleted' })
  } catch (error) {
    console.error('Error deleting user data:', error)
    return NextResponse.json({ error: 'Failed to delete data' }, { status: 500 })
  }
}
