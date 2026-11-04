import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { StatusMark } from '../../components/Notebook'
import { Crumbs, ErrorNote, Loading } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { dayPhrase, formatMinutes, formatRelative, formatShort, pct } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import {
  loadOverview,
  loadStudentQuiz,
  progressKey,
  studentSummary,
  type OvAssignment,
  type OvNote,
  type Overview,
  type QuizResult,
} from '../../lib/teacherOverview'
import { lessonStatus } from '../../lib/types'
import { useNoteActions } from '../../lib/useNoteActions'
import { NoteActionStatus, NoteCard } from './parts'

/** Everything one student has done in one class: every lesson, quiz results and their notes. */
export function StudentPage() {
  const { classId = '', studentId = '' } = useParams()
  const [data, setData] = useState<Overview | null>(null)
  const [quiz, setQuiz] = useState<Map<string, QuizResult>>(new Map())
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState('')
  const [removeError, setRemoveError] = useState('')
  const navigate = useNavigate()
  const updateNotes = useCallback((fn: (n: OvNote[]) => OvNote[]) => setData((d) => d && { ...d, notes: fn(d.notes) }), [])
  const actions = useNoteActions(updateNotes)
  const cls = data?.classes[0]
  const student = cls?.students[0]
  usePageTitle(student?.name ?? 'Student')

  useEffect(() => {
    let active = true
    ;(async () => {
      const d = await loadOverview({ classId, studentId })
      const lessonIds = [...new Set(d.classes[0]?.assignments.flatMap((a) => a.lessons.map((l) => l.id)) ?? [])]
      const q = await loadStudentQuiz(studentId, lessonIds)
      if (!active) return
      setData(d)
      setQuiz(q)
      setLoadedAt(Date.now())
    })().catch((e) => active && setError(errorMessage(e)))
    return () => {
      active = false
    }
  }, [classId, studentId])

  if (error) return <div className="page"><ErrorNote>{error}</ErrorNote></div>
  if (!data) return <div className="page"><Loading label="Loading student" /></div>
  if (!cls || !student)
    return (
      <div className="page teach">
        <Crumbs items={[{ label: 'Classes', to: '/teach/classes' }, ...(cls ? [{ label: cls.name, to: `/teach/classes/${cls.id}` }] : [])]} />
        <p className="nothing">This student isn’t in this class (they may have been removed).</p>
      </div>
    )

  async function removeStudent() {
    if (!cls || !student) return
    if (!window.confirm(`Remove ${student.name} from ${cls.name}? Their watch history is kept and returns if they rejoin.`)) return
    const { error } = await supabase.from('enrollments').delete().eq('class_id', cls.id).eq('student_id', student.id)
    if (error) setRemoveError(errorMessage(error))
    else navigate(`/teach/classes/${cls.id}`, { replace: true })
  }

  const sum = studentSummary(student, cls, data.progress, data.notes, loadedAt)
  const upcoming = cls.assignments.filter((a) => new Date(a.due_at).getTime() >= loadedAt)
  const past = cls.assignments.filter((a) => new Date(a.due_at).getTime() < loadedAt).reverse()
  const firstName = student.name.split(' ')[0]

  const block = (a: OvAssignment) => (
    <li key={a.id} className="log">
      <h3 className="log__title">
        <Link to={`/teach/assignments/${a.id}`}>{a.title}</Link>
      </h3>
      <p className="log__due muted small">
        {new Date(a.due_at).getTime() < loadedAt ? 'Was due' : 'Due'}{' '}
        <time dateTime={a.due_at}>{dayPhrase(a.due_at, new Date(loadedAt))}</time>
      </p>
      <ol className="log__lessons">
        {a.lessons.map((l) => {
          const p = data.progress.get(progressKey(student.id, l.id))
          const status = lessonStatus(p)
          const late = p?.completed_at && new Date(p.completed_at) > new Date(a.due_at)
          const q = quiz.get(l.id)
          const notes = data.notes.filter((n) => n.lessonId === l.id)
          return (
            <li key={l.id} className="log__lesson">
              <div className="log__row">
                <StatusMark status={status} />
                <span className="log__name">
                  {l.title} <span className="muted small">{formatMinutes(l.duration_seconds)}</span>
                </span>
                <span className="log__status">
                  {status === 'complete' ? (
                    <>
                      <span className="ok">Complete</span>{' '}
                      <span className="muted">{formatShort(p!.completed_at)}</span>
                      {late && <span className="late"> late</span>}
                    </>
                  ) : status === 'in_progress' ? (
                    <>
                      <span className="cell--progress">{pct(Number(p!.percent_watched))} watched</span>{' '}
                      <span className="muted">last {formatShort(p!.last_watched_at ?? p!.first_opened_at)}</span>
                    </>
                  ) : (
                    <span className="muted">Not opened</span>
                  )}
                </span>
                <span className="log__quiz">
                  {q && q.questions > 0 ? (
                    q.answered === 0 ? (
                      <span className="muted">Quiz not tried</span>
                    ) : (
                      <span className={q.firstTryRight / q.answered < 0.6 ? 'danger' : 'ok'}>
                        Quiz {q.firstTryRight}/{q.questions} first try
                      </span>
                    )
                  ) : null}
                </span>
              </div>
              {notes.length > 0 && (
                <ul className="notes-board notes-board--inline" aria-label={`${firstName}’s notes on ${l.title}`}>
                  {notes.map((n) => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      now={loadedAt}
                      classes={data.classes}
                      showLesson={false}
                      showStudent={false}
                      onHandle={actions.toggle}
                    />
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </li>
  )

  return (
    <div className="page teach">
      <Crumbs
        items={[
          { label: 'Classes', to: '/teach/classes' },
          { label: cls.name, to: `/teach/classes/${cls.id}` },
          { label: student.name },
        ]}
      />
      <header className="pagehead">
        <h1>{student.name}</h1>
        <p className="muted">
          {student.email} · joined {cls.name} {formatShort(student.joinedAt)}
        </p>
      </header>

      <NoteActionStatus status={actions.status} error={actions.error} />
      <ul className="stats" aria-label="Summary">
        <li>
          <strong>
            {sum.done}/{sum.assigned}
          </strong>{' '}
          lessons done
        </li>
        <li className={sum.missed ? 'stats--urgent' : ''}>
          <strong>{sum.missed}</strong> not done before class
        </li>
        <li>
          <strong>{sum.notes}</strong> {sum.notes === 1 ? 'note' : 'notes'}
        </li>
        <li>
          Last active{' '}
          <strong className="stats__text">{sum.lastActive ? formatRelative(sum.lastActive, loadedAt) : 'never'}</strong>
        </li>
      </ul>

      {cls.assignments.length === 0 ? (
        <p className="nothing">Nothing has been assigned to this class yet.</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="section" aria-labelledby="up-h">
              <h2 id="up-h" className="rulehead">Coming up</h2>
              <ol className="loglist">{upcoming.map(block)}</ol>
            </section>
          )}
          {past.length > 0 && (
            <section className="section" aria-labelledby="past-h">
              <h2 id="past-h" className="rulehead">Earlier</h2>
              <ol className="loglist">{past.map(block)}</ol>
            </section>
          )}
        </>
      )}
      <p className="legend muted small">
        Complete = 90% of the video’s seconds actually played. “Late” = finished after class started. Quiz scores count
        each question’s first try only.
      </p>

      <section className="section dangerzone" aria-labelledby="rm-h">
        <h2 id="rm-h" className="rulehead">Remove from {cls.name}</h2>
        <p className="muted">
          {firstName} will no longer see this class’s assignments. Their watch history is kept and comes back if they
          rejoin with the code.
        </p>
        <button type="button" className="btn btn--ghost btn--danger btn--small" onClick={() => void removeStudent()}>
          Remove {student.name} from {cls.name}
        </button>
        <ErrorNote>{removeError}</ErrorNote>
      </section>
    </div>
  )
}
