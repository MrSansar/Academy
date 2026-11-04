import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Crumbs, ErrorNote, Loading } from '../../components/ui'
import { dayPhrase, pctRound } from '../../lib/format'
import { usePageTitle } from '../../lib/pageTitle'
import { errorMessage } from '../../lib/supabase'
import {
  exportAssignmentCsv,
  loadAssignmentReport,
  progressKey,
  questionStats,
  type AssignmentReport,
} from '../../lib/teacherData'
import { cellDetail, cellKind, classPath, prepFor, studentPath, type OvNote } from '../../lib/teacherOverview'
import { choicesOf } from '../../lib/types'
import { useNoteActions } from '../../lib/useNoteActions'
import { NoteActionStatus, NoteItem, PrepBar, StatusChip } from './parts'

/** Below this many first tries, a percentage says more about one student than about the class. */
const MIN_ANSWERS = 3

export function AssignmentDashboard() {
  const { assignmentId = '' } = useParams()
  const [report, setReport] = useState<AssignmentReport | null>(null)
  const [notes, setNotes] = useState<OvNote[]>([])
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  usePageTitle(report?.assignment.title ?? 'Assignment')
  const updateNotes = useCallback((fn: (n: OvNote[]) => OvNote[]) => setNotes(fn), [])
  const actions = useNoteActions(updateNotes)

  useEffect(() => {
    let active = true
    loadAssignmentReport(assignmentId)
      .then((r) => {
        if (!active) return
        const names = new Map(r.students.map((s) => [s.id, s.name]))
        const titles = new Map(r.lessons.map((l) => [l.id, l.title]))
        setReport(r)
        setNotes(
          r.notes.map((n) => ({
            id: n.id,
            body: n.body,
            created_at: n.created_at,
            handledAt: n.handled_at,
            lessonId: n.lesson_id,
            lessonTitle: titles.get(n.lesson_id) ?? 'Lesson',
            studentId: n.student_id,
            studentName: names.get(n.student_id) ?? 'Student',
          })),
        )
        setLoadedAt(Date.now())
      })
      .catch((e) => active && setError(errorMessage(e)))
    return () => {
      active = false
    }
  }, [assignmentId, reload])

  if (!report) return <div className="t-page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Loading report" />}</div>

  const { assignment, lessons, students, progress, questions, attempts } = report
  const now = new Date(loadedAt)
  const isPast = new Date(assignment.due_at).getTime() < loadedAt
  const prep = prepFor({ lessons }, students, progress)

  return (
    <div className="t-page">
      <Crumbs
        items={[
          { label: 'Overview', to: '/teach' },
          { label: report.className, to: classPath(assignment.class_id) },
          { label: assignment.title },
        ]}
      />
      <header className="t-head">
        <div className="t-head__main">
          <h1>{assignment.title}</h1>
          <p className="t-head__meta">
            {isPast ? 'Was due' : 'Due'} <time dateTime={assignment.due_at}>{dayPhrase(assignment.due_at, now)}</time>
            {' · '}
            {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} · {students.length}{' '}
            {students.length === 1 ? 'student' : 'students'}
          </p>
        </div>
        <div className="t-head__actions">
          <button className="btn btn--ghost btn--small" onClick={() => setReload((n) => n + 1)}>
            Refresh
          </button>
          <button className="btn btn--ghost btn--small" onClick={() => exportAssignmentCsv(report)}>
            Export CSV
          </button>
          <Link className="btn btn--small" to={`/teach/assignments/${assignment.id}/edit`}>
            Edit assignment
          </Link>
        </div>
      </header>

      {students.length === 0 ? (
        <p className="t-callout">No students in this class yet. Share the join code from the overview.</p>
      ) : lessons.length === 0 ? (
        <p className="t-callout t-callout--warn">This assignment has no lessons, so students see nothing. Add some with Edit assignment.</p>
      ) : (
        <div className="t-stack">
          <section className="t-card" aria-labelledby="grid-h">
            <div className="t-card__head">
              <h2 id="grid-h" className="t-card__title">
                Who prepared
              </h2>
              <div style={{ minWidth: 'min(100%, 22rem)' }}>
                <PrepBar prep={prep} compact />
              </div>
            </div>
            <div className="t-tablewrap" tabIndex={0} role="region" aria-label="Progress table, scrolls sideways">
              <table className="t-grid">
                <thead>
                  <tr>
                    <th scope="col" className="t-grid__corner">
                      Student
                    </th>
                    <th scope="col" className="t-grid__last">
                      Done
                    </th>
                    {lessons.map((l, i) => (
                      <th scope="col" key={l.id} className={i === 0 ? 't-grid__lesson t-gstart' : 't-grid__lesson'} title={l.title}>
                        <Link to={`/teach/lessons/${l.id}`}>
                          {i + 1}. {l.title}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const done = lessons.filter((l) => progress.get(progressKey(s.id, l.id))?.completed_at).length
                    return (
                      <tr key={s.id}>
                        <th scope="row" className="t-grid__name">
                          <Link to={studentPath(assignment.class_id, s.id)} title={s.email}>
                            {s.name}
                          </Link>
                        </th>
                        <td className="t-num t-grid__last">
                          {done}/{lessons.length}
                        </td>
                        {lessons.map((l, i) => {
                          const p = progress.get(progressKey(s.id, l.id))
                          return (
                            <td key={l.id} className={i === 0 ? 't-cell t-gstart' : 't-cell'} title={cellDetail(p)}>
                              <StatusChip kind={cellKind(p, assignment.due_at, loadedAt)} p={p} />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="t-legend">
              <span>
                <StatusChip kind="done" /> finished before class
              </span>
              <span>
                <StatusChip kind="late" /> finished after class started
              </span>
              <span>
                <StatusChip kind="missed" /> not finished by class
              </span>
              <span>
                <StatusChip kind="soon" /> not opened, class within 3 days
              </span>
              <span className="t-legend__note">Complete = 90% of the video’s seconds actually played (skipping ahead doesn’t count).</span>
            </p>
          </section>

          {lessons.some((l) => l.check_enabled) && (
            <section aria-labelledby="q-h" className="t-card">
              <div className="t-card__head">
                <h2 id="q-h" className="t-card__title">
                  Check questions
                </h2>
                <span className="t-muted t-small">First try only. Low numbers are ideas to go over in class.</span>
              </div>
              {lessons
                .filter((l) => l.check_enabled)
                .map((l) => {
                  const qs = questions.filter((q) => q.lesson_id === l.id)
                  return (
                    <div key={l.id} className="t-group">
                      <div className="t-group__head">
                        <h3>{l.title}</h3>
                      </div>
                      {qs.length === 0 ? (
                        <p className="t-empty t-empty--tight">No questions written for this lesson yet.</p>
                      ) : (
                        <ol className="t-qlist">
                          {qs.map((q, i) => {
                            const choices = choicesOf(q)
                            const st = questionStats(q, attempts, choices.length)
                            const enough = st.answered >= MIN_ANSWERS
                            const rate = st.answered ? (st.firstTryCorrect / st.answered) * 100 : 0
                            return (
                              <li key={q.id} className="t-q">
                                <p className="t-q__prompt">
                                  {i + 1}. {q.prompt}
                                </p>
                                <p className={enough && rate < 60 ? 't-q__rate t-q__rate--low' : 't-q__rate'}>
                                  {st.answered === 0 ? (
                                    'No answers yet'
                                  ) : enough ? (
                                    <>
                                      <strong>{pctRound(rate)}</strong> right on the first try
                                    </>
                                  ) : (
                                    `${st.answered} ${st.answered === 1 ? 'answer' : 'answers'} so far, too few to tell`
                                  )}
                                  {' · '}
                                  {st.answered} of {students.length} answered
                                </p>
                                <ul className="t-dist">
                                  {choices.map((c, ci) => {
                                    const share = st.answered ? (st.firstChoices[ci] / st.answered) * 100 : 0
                                    return (
                                      <li key={ci} className={ci === q.correct_index ? 't-dist--correct' : ''}>
                                        <span className="t-dist__label">
                                          {ci === q.correct_index && <span className="visually-hidden">Correct answer: </span>}
                                          {ci === q.correct_index ? '✓ ' : ''}
                                          {c}
                                        </span>
                                        <span className="t-dist__bar" aria-hidden="true">
                                          <span style={{ width: `${share}%` }} />
                                        </span>
                                        <span className="t-dist__n">{st.firstChoices[ci]}</span>
                                      </li>
                                    )
                                  })}
                                </ul>
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </div>
                  )
                })}
            </section>
          )}

          {lessons.some((l) => l.confusion_enabled) && (
            <section aria-labelledby="c-h" className="t-card">
              <div className="t-card__head">
                <h2 id="c-h" className="t-card__title">
                  What confused them
                </h2>
                <Link className="t-small" to={`/teach/notes?class=${assignment.class_id}`}>
                  All notes
                </Link>
              </div>
              <NoteActionStatus status={actions.status} error={actions.error} />
              {lessons
                .filter((l) => l.confusion_enabled)
                .map((l) => {
                  const list = notes.filter((n) => n.lessonId === l.id)
                  const open = list.filter((n) => !n.handledAt)
                  return (
                    <div key={l.id} className="t-group">
                      <div className="t-group__head">
                        <h3>{l.title}</h3>
                        <span className="t-muted t-small">
                          {open.length} open{list.length - open.length ? ` · ${list.length - open.length} handled` : ''}
                        </span>
                        {open.length > 0 && (
                          <span className="t-group__actions">
                            <button
                              type="button"
                              className="btn btn--ghost btn--small"
                              onClick={() =>
                                void actions.run(
                                  open.map((n) => n.id),
                                  true,
                                  `Marked ${open.length} ${open.length === 1 ? 'note' : 'notes'} on “${l.title}” handled.`,
                                )
                              }
                            >
                              Covered in class
                              <span className="visually-hidden">: mark all {open.length} open notes on {l.title} handled</span>
                            </button>
                          </span>
                        )}
                      </div>
                      {list.length === 0 ? (
                        <p className="t-empty t-empty--tight">No notes yet.</p>
                      ) : (
                        <ul className="t-notes">
                          {list.map((n) => (
                            <NoteItem key={n.id} note={n} now={loadedAt} classId={assignment.class_id} showLesson={false} onHandle={actions.toggle} />
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
