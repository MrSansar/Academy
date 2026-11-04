import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from './supabase'
import { setNotesHandled, withHandled, type OvNote } from './teacherOverview'

export interface NoteStatus {
  text: string
  undo?: () => void
}

/**
 * Mark notes handled / open from any teacher page. Updates the page at once, saves, rolls the
 * page back if the save fails, and offers Undo for the last change.
 */
export function useNoteActions(update: (fn: (notes: OvNote[]) => OvNote[]) => void) {
  const [status, setStatus] = useState<NoteStatus | null>(null)
  const [error, setError] = useState('')
  const runRef = useRef<(ids: number[], handled: boolean, text: string, undoable?: boolean) => Promise<void>>(null)

  const run = useCallback(
    async (ids: number[], handled: boolean, text: string, undoable = true) => {
      if (ids.length === 0) return
      const at = new Date().toISOString()
      update((ns) => withHandled(ns, ids, handled, at))
      setError('')
      try {
        await setNotesHandled(ids, handled)
        setStatus({
          text,
          undo: undoable
            ? () => void runRef.current?.(ids, !handled, handled ? 'Moved back to open.' : 'Marked handled again.', false)
            : undefined,
        })
      } catch (e) {
        update((ns) => withHandled(ns, ids, !handled, at))
        setStatus(null)
        setError(errorMessage(e))
      }
    },
    [update],
  )
  useEffect(() => {
    runRef.current = run
  }, [run])

  /** One note: "Mark handled" or "Reopen". */
  const toggle = useCallback(
    (n: OvNote, handled: boolean) =>
      void run([n.id], handled, handled ? `Marked ${n.studentName}’s note handled.` : `${n.studentName}’s note is open again.`),
    [run],
  )

  return { run, toggle, status, error }
}
