import { useEffect, useId, useState, type FormEvent } from 'react'
import { formatShort } from '../lib/format'
import { errorMessage, supabase } from '../lib/supabase'
import type { ConfusionNote } from '../lib/types'

/** Optional "What was confusing?" box. Only the student and the teacher can read the notes. */
export function ConfusionBox({ lessonId, userId, disabled }: { lessonId: string; userId: string; disabled: boolean }) {
  const [notes, setNotes] = useState<ConfusionNote[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const id = useId()

  useEffect(() => {
    supabase
      .from('confusion_notes')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('student_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setNotes(data ?? []))
  }, [lessonId, userId])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return setError('Write a few words first.')
    setBusy(true)
    setError('')
    const { data, error } = await supabase
      .from('confusion_notes')
      .insert({ lesson_id: lessonId, body: text })
      .select()
      .single()
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setNotes((n) => [data, ...n])
    setBody('')
    setSent(true)
  }

  return (
    <section className="card confusion" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>What was confusing?</h2>
      <form onSubmit={submit}>
        <label htmlFor={id} className="hint">
          Optional. Only your teacher sees this; it helps decide what to go over in class.
        </label>
        <textarea
          id={id}
          rows={3}
          maxLength={2000}
          value={body}
          disabled={disabled}
          onChange={(e) => {
            setBody(e.target.value)
            setSent(false)
          }}
        />
        <div className="row">
          <button className="btn btn--small" disabled={busy || disabled}>
            {busy ? 'Sending…' : 'Send to my teacher'}
          </button>
          <span aria-live="polite" className="ok">
            {sent && 'Sent. Thank you.'}
          </span>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
      {notes.length > 0 && (
        <details className="mynotes">
          <summary>Your earlier notes ({notes.length})</summary>
          <ul>
            {notes.map((n) => (
              <li key={n.id}>
                <time className="muted">{formatShort(n.created_at)}</time> {n.body}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
