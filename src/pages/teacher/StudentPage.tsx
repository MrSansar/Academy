import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Checkbox } from '../../components/Notebook'
import { Crumbs, ErrorNote, Loading } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { formatDue, formatMinutes, formatRelative, formatShort, pct } from '../../lib/format'
import { isNewNote, useNotesSeenAt } from '../../lib/notesSeen'
import { errorMessage } from '../../lib/supabase'
import {
  loadOverview,
  loadStudentQuiz,
  progressKey,
  studentSummary,
  type OvAssignment,
  type Overview,
  type QuizResult,
} from '../../lib/teacherOverview'
import { lessonStatus } from '../../lib/types'
import { NoteCard } from './parts'

/** Everything one student has done in one class: every lesson, quiz results and their notes. */
export function StudentPage() {
  const { classId = '', studentId = '' } = useParams()
  const [data, setData] = useState<Overview | null>(null)
  const [quiz, setQuiz] = useState<Map<string, QuizResult>>(new Map())
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState('')
  const seenAt = useNotesSeenAt()
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
        Before class on <time dateTime={a.due_at}>{formatDue(a.due_at)}</time>
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
                <Checkbox status={status} />
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
                      classes={data.classes}
                      isNew={isNewNote(n.created_at, seenAt)}
                      showLesson={false}
                      showStudent={false}
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
    </div>
  )
}
