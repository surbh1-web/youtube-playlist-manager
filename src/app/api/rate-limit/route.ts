import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { readPreferences, writePreferences, getUserKey } from '@/lib/preferences'

// Per-user, per-action rate limiter for the two expensive user actions:
//   - "recategorize" (full rebuild)
//   - "refresh" (incremental sync)
// Enforced ONLY when RATE_LIMIT_ENABLED === 'true' (so local `npm run dev` is unlimited
// unless you opt in). Rolling window; counter lives in the per-user prefs file so it is
// the same across logins, sessions, and browsers.

const ALLOWED_ACTIONS = new Set(['recategorize', 'refresh'])

function config() {
  const enabled = process.env.RATE_LIMIT_ENABLED === 'true'
  const max = Math.max(1, parseInt(process.env.RATE_LIMIT_MAX || '5', 10) || 5)
  const windowMs = Math.max(1, parseInt(process.env.RATE_LIMIT_WINDOW_MIN || '60', 10) || 60) * 60_000
  return { enabled, max, windowMs }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const userKey = getUserKey(session.user.email)

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '')
    const peek = body?.peek === true
    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { enabled, max, windowMs } = config()

    // Feature off (e.g. local dev without the flag): always allowed, nothing recorded.
    if (!enabled) {
      return NextResponse.json({ allowed: true, enabled: false, remaining: max, limit: max, retryAfterMs: 0 })
    }

    const prefs = await readPreferences(userKey)
    const now = Date.now()
    const rl = { ...(prefs.rateLimits || {}) }
    const recent = (rl[action] || []).filter((t) => now - t < windowMs)

    if (recent.length >= max) {
      const oldest = Math.min(...recent)
      const retryAfterMs = Math.max(0, windowMs - (now - oldest))
      // Persist the pruned list so it doesn't grow unbounded; do NOT record this attempt.
      rl[action] = recent
      await writePreferences(userKey, { ...prefs, rateLimits: rl })
      return NextResponse.json({ allowed: false, enabled: true, remaining: 0, limit: max, retryAfterMs })
    }

    // Peek = report status without consuming an attempt (used to gray the button on load).
    if (peek) {
      const retryAfterMs = recent.length ? Math.max(0, windowMs - (now - Math.min(...recent))) : 0
      return NextResponse.json({
        allowed: true, enabled: true, remaining: max - recent.length, limit: max, retryAfterMs,
      })
    }

    // Record this attempt.
    recent.push(now)
    rl[action] = recent
    await writePreferences(userKey, { ...prefs, rateLimits: rl })
    const remaining = max - recent.length
    // If this attempt used the last slot, tell the client when the window frees up (oldest
    // ages out) so it can gray the button immediately and re-enable it when time rolls over.
    const retryAfterMs = remaining <= 0 ? Math.max(0, windowMs - (now - Math.min(...recent))) : 0
    return NextResponse.json({ allowed: true, enabled: true, remaining, limit: max, retryAfterMs })
  } catch (error) {
    // Fail OPEN: a rate-limit outage must never block the user's core actions.
    return NextResponse.json({ allowed: true, enabled: false, error: 'rate-limit check failed' })
  }
}
