import { useSyncExternalStore } from 'react'

/**
 * When the teacher last looked at the notes, so new ones can be marked "new" and counted in the
 * nav. Kept on this device only; it's a reading aid, not data anyone else needs.
 */
const KEY = 'chalkline:notes-seen-at'
const EVENT = 'chalkline:notes-seen'

export function notesSeenAt(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Remember `at` (the newest note's time) as read. Never moves backwards. */
export function markNotesSeen(at: string): void {
  const prev = notesSeenAt()
  if (prev && prev >= at) return
  try {
    localStorage.setItem(KEY, at)
  } catch {
    // still fine for this visit
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function useNotesSeenAt(): string | null {
  return useSyncExternalStore(subscribe, notesSeenAt, () => null)
}

export const isNewNote = (createdAt: string, seenAt: string | null) => !seenAt || createdAt > seenAt
