/** Small pieces shared by the teacher pages. Plain on purpose: numbers and words, no decoration. */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatRelative, formatShort, pct } from '../../lib/format'
import { isRecentNote, studentPath, type CellKind, type OvNote, type OvProgress, type Prep } from '../../lib/teacherOverview'
import type { NoteStatus } from '../../lib/useNoteActions'

/** One bar for a whole class: finished / started / not opened, with the numbers spelled out. */
export function PrepBar({ prep, compact = false }: { prep: Prep<{ id: string; name: string }>; compact?: boolean }) {
  const total = prep.ready.length + prep.started.length + prep.notOpened.length
  const w = (n: number) => `${total ? (n / total) * 100 : 0}%`
  return (
    <div className={compact ? 't-prep t-prep--compact' : 't-prep'}>
      <div className="t-prep__bar" aria-hidden="true">
        <span className="t-prep__ready" style={{ width: w(prep.ready.length) }} />
        <span className="t-prep__started" style={{ width: w(prep.started.length) }} />
      </div>
      <p className="t-prep__legend">
        <span>
          <i className="t-dot t-dot--done" aria-hidden="true" />
          <strong>{prep.ready.length}</strong> finished
        </span>
        <span>
          <i className="t-dot t-dot--progress" aria-hidden="true" />
          <strong>{prep.started.length}</strong> started
        </span>
        <span>
          <i className="t-dot" aria-hidden="true" />
          <strong>{prep.notOpened.length}</strong> not opened
        </span>
      </p>
    </div>
  )
}

/** Names of students who haven't opened an assignment; each opens that student's details. */
export function NotOpenedList({ prep, classId, max = 8 }: { prep: Prep<{ id: string; name: string }>; classId: string; max?: number }) {
  if (prep.notOpened.length === 0) return null
  const shown = prep.notOpened.slice(0, max)
  const more = prep.notOpened.length - shown.length
  return (
    <p className="t-names">
      <span className="t-names__label">Not opened:</span>{' '}
      {shown.map((s, i) => (
        <span key={s.id}>
          <Link to={studentPath(classId, s.id)}>{s.name}</Link>
          {i < shown.length - 1 ? ', ' : ''}
        </span>
      ))}
      {more > 0 && <span className="t-muted"> and {more} more</span>}
    </p>
  )
}

const CELL_LABEL: Record<CellKind, string> = {
  done: 'Complete',
  late: 'Complete, late',
  missed: 'Not finished before class',
  progress: 'Started',
  soon: 'Not opened, due soon',
  todo: 'Not opened',
}

/** A lesson's state as a small chip: ✓, ✓ late, 40%, Missed, or a dash. The full wording is read out. */
export function StatusChip({ kind, p }: { kind: CellKind; p?: Pick<OvProgress, 'percent_watched'> }) {
  const watched = p ? pct(Number(p.percent_watched)) : ''
  const text =
    kind === 'done'
      ? '✓'
      : kind === 'late'
        ? '✓ late'
        : kind === 'progress'
          ? watched
          : kind === 'missed'
            ? p
              ? watched
              : 'Missed'
            : '–'
  const spoken = kind === 'progress' || (kind === 'missed' && p) ? `${CELL_LABEL[kind]}, ${watched} watched` : CELL_LABEL[kind]
  return (
    <span className={`t-chip t-chip--${kind}`}>
      <span aria-hidden="true">{text}</span>
      <span className="visually-hidden">{spoken}</span>
    </span>
  )
}

/** One student note as a plain row, with "Mark handled" / "Reopen". */
export function NoteItem({
  note,
  now,
  classId,
  showLesson = true,
  showStudent = true,
  onHandle,
}: {
  note: OvNote
  /** When the page loaded; decides the "New" tag. */
  now: number
  /** Links the student's name to their details in this class. */
  classId?: string
  showLesson?: boolean
  showStudent?: boolean
  /** Omit for a read-only row. */
  onHandle?: (note: OvNote, handled: boolean) => void
}) {
  const handled = Boolean(note.handledAt)
  return (
    <li className={handled ? 't-note t-note--handled' : 't-note'}>
      <p className="t-note__body">{note.body}</p>
      <p className="t-note__meta">
        {isRecentNote(note, now) && <span className="t-tag t-tag--accent">New</span>}
        {showStudent &&
          (classId ? (
            <Link className="t-note__who" to={studentPath(classId, note.studentId)}>
              {note.studentName}
            </Link>
          ) : (
            <span className="t-note__who">{note.studentName}</span>
          ))}
        {showLesson && (
          <span>
            on <Link to={`/teach/lessons/${note.lessonId}`}>{note.lessonTitle}</Link>
          </span>
        )}
        <time dateTime={note.created_at} title={formatShort(note.created_at)}>
          {formatRelative(note.created_at, now)}
        </time>
        {handled && (
          <span className="t-note__handled">
            Handled <time dateTime={note.handledAt!}>{formatRelative(note.handledAt!, now)}</time>
          </span>
        )}
      </p>
      {onHandle && (
        <p className="t-note__act">
          {handled ? (
            <button type="button" className="t-linkbtn" onClick={() => onHandle(note, false)}>
              Reopen<span className="visually-hidden"> {note.studentName}’s note</span>
            </button>
          ) : (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => onHandle(note, true)}>
              Mark handled<span className="visually-hidden"> ({note.studentName}’s note)</span>
            </button>
          )}
        </p>
      )}
    </li>
  )
}

/** "Marked 2 notes handled. Undo", or an error, after a note action. */
export function NoteActionStatus({ status, error }: { status: NoteStatus | null; error: string }) {
  return (
    <div className="t-livestatus" aria-live="polite">
      {error ? (
        <p className="error">{error}</p>
      ) : status ? (
        <p className="t-livestatus__msg">
          {status.text}{' '}
          {status.undo && (
            <button type="button" className="t-linkbtn" onClick={status.undo}>
              Undo
            </button>
          )}
        </p>
      ) : null}
    </div>
  )
}

/** A figure with a label: "Need attention 4 · 3 missed a lesson". */
export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' | 'ok' }) {
  return (
    <div className={tone ? `t-kpi t-kpi--${tone}` : 't-kpi'}>
      <dt className="t-kpi__label">{label}</dt>
      <dd className="t-kpi__value">{value}</dd>
      {sub && <dd className="t-kpi__sub">{sub}</dd>}
    </div>
  )
}
