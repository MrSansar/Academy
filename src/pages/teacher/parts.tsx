/** Small pieces shared by the teacher's dashboard, class, notes and student pages. */
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { ClassMark } from '../../components/Notebook'
import { tilt } from '../../lib/fun'
import { formatRelative, formatShort } from '../../lib/format'
import { classesForNote, isRecentNote, studentPath, type OvClass, type OvNote, type Prep } from '../../lib/teacherOverview'
import type { NoteStatus } from '../../lib/useNoteActions'

/** One bar for a whole class: finished / started / not opened, with the numbers spelled out. */
export function PrepBar({ prep }: { prep: Prep<{ id: string; name: string }> }) {
  const total = prep.ready.length + prep.started.length + prep.notOpened.length
  const w = (n: number) => `${total ? (n / total) * 100 : 0}%`
  return (
    <div className="prep">
      <div className="prep__bar" aria-hidden="true">
        <span className="prep__ready" style={{ width: w(prep.ready.length) }} />
        <span className="prep__started" style={{ width: w(prep.started.length) }} />
      </div>
      <p className="prep__legend">
        <span className="prep__n prep__n--ready">{prep.ready.length}</span> ready ·{' '}
        <span className="prep__n prep__n--started">{prep.started.length}</span> started ·{' '}
        <span className="prep__n">{prep.notOpened.length}</span> not opened
        <span className="muted"> of {total}</span>
      </p>
    </div>
  )
}

/** Names of students who haven't opened an assignment, each linking to their page. */
export function NotOpenedList({
  prep,
  classId,
  level,
  max = 6,
}: {
  prep: Prep<{ id: string; name: string }>
  classId: string
  level: 'none' | 'soon' | 'urgent'
  max?: number
}) {
  if (prep.notOpened.length === 0) return null
  const shown = prep.notOpened.slice(0, max)
  const more = prep.notOpened.length - shown.length
  return (
    <p className={`nudge nudge--${level}`}>
      <span className="nudge__label">Not opened yet:</span>{' '}
      {shown.map((s, i) => (
        <span key={s.id}>
          <Link to={studentPath(classId, s.id)}>{s.name}</Link>
          {i < shown.length - 1 ? ', ' : ''}
        </span>
      ))}
      {more > 0 && <span className="muted"> and {more} more</span>}
    </p>
  )
}

/** A student's note, shown as the sticky note they wrote, with "Mark handled" / "Reopen". */
export function NoteCard({
  note,
  now,
  classes = [],
  showLesson = true,
  showStudent = true,
  onHandle,
}: {
  note: OvNote
  /** When the page loaded; decides the "New" tag. */
  now: number
  classes?: OvClass[]
  showLesson?: boolean
  showStudent?: boolean
  /** Omit for a read-only card. */
  onHandle?: (note: OvNote, handled: boolean) => void
}) {
  const where = classesForNote(note, classes)
  const home = where[0]
  const handled = Boolean(note.handledAt)
  return (
    <li
      className={handled ? 'notecard notecard--handled' : 'notecard'}
      style={{ '--tilt': `${tilt(String(note.id), 1.6)}deg` } as CSSProperties}
    >
      {isRecentNote(note, now) && <span className="notecard__new">New</span>}
      <p className="notecard__body">{note.body}</p>
      <p className="notecard__meta">
        {showStudent &&
          (home ? (
            <Link className="notecard__who" to={studentPath(home.id, note.studentId)}>
              {note.studentName}
            </Link>
          ) : (
            <span className="notecard__who">{note.studentName}</span>
          ))}
        {showLesson && (
          <span className="notecard__lesson">
            on <Link to={`/teach/lessons/${note.lessonId}`}>{note.lessonTitle}</Link>
          </span>
        )}
        <span className="notecard__time">
          <time dateTime={note.created_at} title={formatShort(note.created_at)}>
            {formatRelative(note.created_at, now)}
          </time>
          {where.length > 0 && (
            <>
              {' · '}
              {where.map((c) => (
                <ClassMark key={c.id} id={c.id} name={c.name} />
              ))}
            </>
          )}
        </span>
      </p>
      {handled ? (
        <p className="notecard__handled">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="10" fill="currentColor" />
            <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            Handled <time dateTime={note.handledAt!}>{formatRelative(note.handledAt!, now)}</time>
          </span>
          {onHandle && (
            <button type="button" className="linkish" onClick={() => onHandle(note, false)}>
              Reopen<span className="visually-hidden"> {note.studentName}’s note</span>
            </button>
          )}
        </p>
      ) : (
        onHandle && (
          <button type="button" className="btn btn--ink btn--small notecard__act" onClick={() => onHandle(note, true)}>
            Mark handled<span className="visually-hidden"> ({note.studentName}’s note)</span>
          </button>
        )
      )}
    </li>
  )
}

/** "Marked 2 notes handled. Undo", or an error, after a note action. */
export function NoteActionStatus({ status, error }: { status: NoteStatus | null; error: string }) {
  return (
    <div className="notestatus" aria-live="polite">
      {error ? (
        <p className="error">{error}</p>
      ) : status ? (
        <p className="notestatus__msg">
          {status.text}{' '}
          {status.undo && (
            <button type="button" className="linkish" onClick={status.undo}>
              Undo
            </button>
          )}
        </p>
      ) : null}
    </div>
  )
}
