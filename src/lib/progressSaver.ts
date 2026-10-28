import { coveredSeconds, mergeIntervals, type Interval } from './intervals'
import type { LessonProgress } from './types'
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase'

// Kept in sync by AuthProvider so a save can be sent synchronously while the page unloads.
let accessToken: string | null = null
export function setAccessToken(token: string | null): void {
  accessToken = token
}

export interface SavePayload {
  lessonId: string
  intervals: Interval[]
  duration: number | null
  position: number | null
}

function rpcArgs(p: SavePayload) {
  return {
    p_lesson_id: p.lessonId,
    p_intervals: p.intervals.map(([s, e]) => [round(s), round(e)]),
    p_duration: p.duration ? round(p.duration) : undefined,
    p_position: p.position !== null ? round(p.position) : undefined,
  }
}

const round = (n: number) => Math.round(n * 100) / 100

/** Normal save. Resolves with the merged progress row from the server. */
export async function saveProgress(p: SavePayload): Promise<LessonProgress> {
  const { data, error } = await supabase.rpc('save_progress', rpcArgs(p))
  if (error) throw error
  return data
}

/**
 * Fire-and-forget save that survives the tab closing (fetch keepalive). Used on
 * pagehide/visibilitychange, where an awaited request would be cancelled.
 */
export function saveProgressOnExit(p: SavePayload): void {
  if (!accessToken || !SUPABASE_URL) return
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/save_progress`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcArgs(p)),
    }).catch(() => {})
  } catch {
    // The local stash below still has the data; it is sent on the next visit.
  }
}

// ---- Local stash: unsaved intervals survive a crash or offline close ----------------

interface Stash {
  intervals: Interval[]
  duration: number | null
  position: number | null
}

const stashKey = (userId: string, lessonId: string) => `chalkline:unsaved:${userId}:${lessonId}`

export function writeStash(userId: string, lessonId: string, stash: Stash): void {
  try {
    if (stash.intervals.length === 0) localStorage.removeItem(stashKey(userId, lessonId))
    else localStorage.setItem(stashKey(userId, lessonId), JSON.stringify(stash))
  } catch {
    // Private mode or storage full: progress is still saved to the server every 10 s.
  }
}

export function readStash(userId: string, lessonId: string): Stash | null {
  try {
    const raw = localStorage.getItem(stashKey(userId, lessonId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stash
    return Array.isArray(parsed.intervals) ? parsed : null
  } catch {
    return null
  }
}

export function clearStash(userId: string, lessonId: string): void {
  writeStash(userId, lessonId, { intervals: [], duration: null, position: null })
}

/** True if the server already has everything in `extra` (e.g. the exit save got through). */
export function alreadySaved(server: Interval[], extra: Interval[]): boolean {
  return coveredSeconds(mergeIntervals([...server, ...extra])) - coveredSeconds(server) < 0.1
}
