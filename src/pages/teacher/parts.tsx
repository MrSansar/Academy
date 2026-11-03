/** Small pieces shared by the teacher's dashboard, class, notes and student pages. */
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { ClassMark } from '../../components/Notebook'
import { tilt } from '../../lib/fun'
import { formatRelative, formatShort } from '../../lib/format'
import { classesForNote, studentPath, type OvClass, type OvNote, type Prep } from '../../lib/teacherOverview'

/** One bar for a whole class: finished / started / not opened, with the numbers spelled out. */
export function PrepBar({ prep }: { prep: Prep }) {
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
  prep: Prep
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

/** A student's note, shown as the sticky note they wrote. */
export function NoteCard({
  note,
  classes,
  isNew,
  showLesson = true,
  showStudent = true,
}: {
  note: OvNote
  classes: OvClass[]
  isNew: boolean
  showLesson?: boolean
  showStudent?: boolean
}) {
  const where = classesForNote(note, classes)
  const home = where[0]
  return (
    <li className="notecard" style={{ '--tilt': `${tilt(String(note.id), 1.6)}deg` } as CSSProperties}>
      {isNew && <span className="notecard__new">New</span>}
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
            {formatRelative(note.created_at)}
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
    </li>
  )
}
