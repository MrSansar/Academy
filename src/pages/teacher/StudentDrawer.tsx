import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ErrorNote } from '../../components/ui'
import { dayPhrase, formatMinutes, formatRelative, formatShort, pct, pctRound } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import {
  cellKind,
  progressKey,
  rowStats,
  type OvClass,
  type OvNote,
  type OvProgress,
  type OvStudent,
  type QuizResult,
} from '../../lib/teacherOverview'
import { Kpi, NoteItem, StatusChip } from './parts'

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * One student's details over the overview: every assigned lesson, quiz results and notes. A modal
 * panel on the right; Escape, the close button or a click outside closes it.
 */
export function StudentDrawer({
  cls,
  student,
  progress,
  notes,
  quiz,
  now,
  onClose,
  onHandle,
  onRemoved,
}: {
  cls: OvClass
  student: OvStudent
  progress: Map<string, OvProgress>
  /** Notes in this class (any student); filtered here. */
  notes: OvNote[]
  /** This student's quiz results per lesson; undefined while loading. */
  quiz: Map<string, QuizResult> | undefined
  now: number
  onClose: () => void
  onHandle: (note: OvNote, handled: boolean) => void
  onRemoved: () => void
}) {
  const headingId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const close = useRef(onClose)
  const [removeError, setRemoveError] = useState('')
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    close.current = onClose
  }, [onClose])

  // Focus the panel, keep Tab inside it, close on Escape, and put focus back where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    heading.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close.current()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      before?.focus?.({ preventScroll: true })
    }
  }, [student.id])

  const r = rowStats(student.id, cls.assignments, progress, quiz, notes, now)
  const mine = notes.filter((n) => n.studentId === student.id)
  const upcoming = cls.assignments.filter((a) => new Date(a.due_at).getTime() >= now)
  const past = cls.assignments.filter((a) => new Date(a.due_at).getTime() < now).reverse()
  const firstName = student.name.split(' ')[0]

  async function remove() {
    if (!window.confirm(`Remove ${student.name} from ${cls.name}? Their watch history is kept and returns if they rejoin.`)) return
    setRemoving(true)
    const { error } = await supabase.from('enrollments').delete().eq('class_id', cls.id).eq('student_id', student.id)
    setRemoving(false)
    if (error) setRemoveError(errorMessage(error))
    else onRemoved()
  }

  return (
    <>
      <div className="t-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="t-drawer" role="dialog" aria-modal="true" aria-labelledby={headingId} ref={panel}>
        <header className="t-drawer__head">
          <div>
            <h2 id={headingId} ref={heading} tabIndex={-1}>
              {student.name}
            </h2>
            <p className="t-muted t-small">
              {student.email} · joined {cls.name} {formatShort(student.joinedAt)}
            </p>
          </div>
          <button type="button" className="t-iconbtn" onClick={onClose} aria-label={`Close ${student.name}’s details`}>
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <dl className="t-kpis t-kpis--drawer">
          <Kpi label="Lessons done" value={`${r.done}/${r.assigned}`} sub={r.late ? `${r.late} finished late` : undefined} />
          <Kpi label="Not done before class" value={r.missed} tone={r.missed ? 'bad' : undefined} />
          <Kpi
            label="Quiz, first try"
            value={!quiz ? '…' : r.quiz.answered ? pctRound((r.quiz.right / r.quiz.answered) * 100) : '–'}
            sub={quiz && r.quiz.answered ? `${r.quiz.right} of ${r.quiz.answered} right` : quiz && r.quiz.questions ? 'Not tried yet' : undefined}
          />
          <Kpi label="Last active" value={r.lastActive ? formatRelative(r.lastActive, now) : 'Never'} />
        </dl>

        {cls.assignments.length === 0 ? (
          <p className="t-empty">Nothing has been assigned to this class yet.</p>
        ) : (
          [...upcoming, ...past].map((a) => {
            const isPast = new Date(a.due_at).getTime() < now
            return (
              <section key={a.id} className="t-drawer__sec" aria-label={a.title}>
                <h3 className="t-drawer__h">
                  <Link to={`/teach/assignments/${a.id}`}>{a.title}</Link>
                  <span className="t-muted t-small">
                    {isPast ? 'Was due' : 'Due'} {dayPhrase(a.due_at, new Date(now))}
                  </span>
                </h3>
                <table className="t-dtable">
                  <thead>
                    <tr>
                      <th scope="col">Lesson</th>
                      <th scope="col">Status</th>
                      <th scope="col">Watched</th>
                      <th scope="col">Finished</th>
                      <th scope="col">Quiz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.lessons.map((l) => {
                      const p = progress.get(progressKey(student.id, l.id))
                      const q = quiz?.get(l.id)
                      return (
                        <tr key={l.id}>
                          <th scope="row">
                            {l.title} <span className="t-muted t-small">{formatMinutes(l.duration_seconds)}</span>
                          </th>
                          <td>
                            <StatusChip kind={cellKind(p, a.due_at, now)} p={p} />
                          </td>
                          <td className="t-num">{p ? pct(Number(p.percent_watched)) : <span className="t-muted">0%</span>}</td>
                          <td className="t-nowrap">
                            {p?.completed_at ? formatShort(p.completed_at) : <span className="t-muted">–</span>}
                          </td>
                          <td className="t-num">
                            {!q || q.questions === 0 ? (
                              <span className="t-muted">–</span>
                            ) : q.answered === 0 ? (
                              <span className="t-muted">not tried</span>
                            ) : (
                              <span className={q.firstTryRight / q.answered < 0.6 ? 't-bad' : undefined}>
                                {q.firstTryRight}/{q.questions}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            )
          })
        )}

        <section className="t-drawer__sec" aria-labelledby={`${headingId}-n`}>
          <h3 className="t-drawer__h" id={`${headingId}-n`}>
            Notes from {firstName} <span className="t-muted t-small">{mine.length}</span>
          </h3>
          {mine.length === 0 ? (
            <p className="t-muted t-small">No “What was confusing?” notes.</p>
          ) : (
            <ul className="t-notes">
              {mine.map((n) => (
                <NoteItem key={n.id} note={n} now={now} showStudent={false} onHandle={onHandle} />
              ))}
            </ul>
          )}
        </section>

        <section className="t-drawer__sec t-drawer__danger" aria-label="Remove from class">
          <p className="t-muted t-small">
            Removing {firstName} hides this class’s assignments from them. Watch history is kept and comes back if they
            rejoin with the code.
          </p>
          <button type="button" className="btn btn--ghost btn--small t-btn-danger" onClick={() => void remove()} disabled={removing}>
            {removing ? 'Removing…' : `Remove from ${cls.name}`}
          </button>
          <ErrorNote>{removeError}</ErrorNote>
        </section>
      </div>
    </>
  )
}
