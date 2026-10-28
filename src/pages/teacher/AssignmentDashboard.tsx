import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorNote, Loading } from '../../components/ui'
import { formatDue, formatRelative, formatShort, pct } from '../../lib/format'
import { errorMessage } from '../../lib/supabase'
import {
  exportAssignmentCsv,
  loadAssignmentReport,
  progressKey,
  questionStats,
  type AssignmentReport,
} from '../../lib/teacherData'
import { choicesOf, lessonStatus, type LessonProgress } from '../../lib/types'

const HOUR = 3_600_000

/** How loudly to flag "not opened yet": amber within 3 days of class, red within 24 h or after. */
function urgency(dueAt: string): 'none' | 'soon' | 'urgent' {
  const left = new Date(dueAt).getTime() - Date.now()
  if (left <= 24 * HOUR) return 'urgent'
  if (left <= 72 * HOUR) return 'soon'
  return 'none'
}

export function AssignmentDashboard() {
  const { assignmentId = '' } = useParams()
  const [report, setReport] = useState<AssignmentReport | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    loadAssignmentReport(assignmentId)
      .then(setReport)
      .catch((e) => setError(errorMessage(e)))
  }, [assignmentId, reload])

  if (!report) return <div className="page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Loading dashboard" />}</div>

  const { assignment, lessons, students, progress, questions, attempts, notes } = report
  const level = urgency(assignment.due_at)
  const isPast = new Date(assignment.due_at).getTime() < Date.now()

  const perStudent = students.map((s) => {
    const statuses = lessons.map((l) => lessonStatus(progress.get(progressKey(s.id, l.id))))
    return {
      s,
      done: statuses.filter((x) => x === 'complete').length,
      opened: statuses.filter((x) => x !== 'not_opened').length,
    }
  })
  const allDone = perStudent.filter((r) => lessons.length > 0 && r.done === lessons.length).length
  const notOpened = perStudent.filter((r) => r.opened === 0).length

  return (
    <div className="page page--wide">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to={`/teach/classes/${assignment.class_id}`}>← {report.className}</Link>
      </nav>
      <div className="lede lede--row">
        <div>
          <h1>{assignment.title}</h1>
          <p className="muted">
            Due before class on <time dateTime={assignment.due_at}>{formatDue(assignment.due_at)}</time> ·{' '}
            {isPast ? 'class has started' : formatRelative(assignment.due_at)}
          </p>
        </div>
        <div className="row">
          <button className="btn btn--ghost btn--small" onClick={() => setReload((n) => n + 1)}>
            Refresh
          </button>
          <Link className="btn btn--ghost btn--small" to={`/teach/assignments/${assignment.id}/edit`}>
            Edit
          </Link>
          <button className="btn btn--small" onClick={() => exportAssignmentCsv(report)}>
            Export CSV
          </button>
        </div>
      </div>

      <ul className="stats" aria-label="Summary">
        <li><strong>{students.length}</strong> students</li>
        <li><strong>{allDone}</strong> finished everything</li>
        <li className={notOpened && level !== 'none' ? `stats--${level}` : ''}>
          <strong>{notOpened}</strong> haven’t opened anything
        </li>
      </ul>

      {students.length === 0 ? (
        <p className="empty">No students in this class yet. Share the join code from the class page.</p>
      ) : lessons.length === 0 ? (
        <p className="empty">This assignment has no lessons. Add some with Edit.</p>
      ) : (
        <section aria-labelledby="grid-h">
          <h2 id="grid-h" className="subhead">Who prepared</h2>
          <div className="tablewrap" tabIndex={0} role="region" aria-label="Progress table, scrolls sideways">
            <table className="grid">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  {lessons.map((l, i) => (
                    <th scope="col" key={l.id}>
                      <span className="muted">{i + 1}.</span> {l.title}
                    </th>
                  ))}
                  <th scope="col">Overall</th>
                </tr>
              </thead>
              <tbody>
                {perStudent.map(({ s, done }) => (
                  <tr key={s.id}>
                    <th scope="row">
                      {s.name}
                      <span className="email">{s.email}</span>
                    </th>
                    {lessons.map((l) => (
                      <Cell key={l.id} p={progress.get(progressKey(s.id, l.id))} dueAt={assignment.due_at} level={level} />
                    ))}
                    <td className={done === lessons.length ? 'cell cell--done' : 'cell'}>
                      {done}/{lessons.length} done
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="legend muted small">
            “Not opened” turns <span className="key key--soon">amber</span> within 3 days of class and{' '}
            <span className="key key--urgent">red</span> within 24 hours. Complete = 90% of the video’s seconds actually
            played (skipping ahead doesn’t count). “Late” = finished after the due time.
          </p>
        </section>
      )}

      {lessons.some((l) => l.check_enabled) && (
        <section aria-labelledby="q-h" className="section">
          <h2 id="q-h" className="subhead">Check questions</h2>
          <p className="muted small">Percent correct on each student’s first try. Low numbers are ideas to cover in class.</p>
          {lessons
            .filter((l) => l.check_enabled)
            .map((l) => {
              const qs = questions.filter((q) => q.lesson_id === l.id)
              return (
                <div key={l.id} className="card">
                  <h3>{l.title}</h3>
                  {qs.length === 0 && <p className="muted">No questions written for this lesson yet.</p>}
                  {qs.map((q, i) => {
                    const choices = choicesOf(q)
                    const st = questionStats(q, attempts, choices.length)
                    const rate = st.answered ? (st.firstTryCorrect / st.answered) * 100 : null
                    return (
                      <div key={q.id} className="qstat">
                        <p className="qstat__prompt">
                          <strong>{i + 1}.</strong> {q.prompt}
                        </p>
                        <p className={rate !== null && rate < 60 ? 'qstat__rate qstat__rate--low' : 'qstat__rate'}>
                          {rate === null ? 'No answers yet' : `${pct(rate)} correct on first try`}
                          <span className="muted"> · {st.answered} of {students.length} answered</span>
                        </p>
                        <ul className="dist">
                          {choices.map((c, ci) => {
                            const share = st.answered ? (st.firstChoices[ci] / st.answered) * 100 : 0
                            return (
                              <li key={ci} className={ci === q.correct_index ? 'dist--correct' : ''}>
                                <span className="dist__label">
                                  {ci === q.correct_index && <span className="visually-hidden">Correct answer: </span>}
                                  {ci === q.correct_index ? '✓ ' : ''}
                                  {c}
                                </span>
                                <span className="dist__bar" aria-hidden="true">
                                  <span style={{ width: `${share}%` }} />
                                </span>
                                <span className="dist__n">{st.firstChoices[ci]}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )
            })}
        </section>
      )}

      {lessons.some((l) => l.confusion_enabled) && (
        <section aria-labelledby="c-h" className="section">
          <h2 id="c-h" className="subhead">What was confusing</h2>
          {lessons
            .filter((l) => l.confusion_enabled)
            .map((l) => {
              const list = notes.filter((n) => n.lesson_id === l.id)
              return (
                <div key={l.id} className="card">
                  <h3>
                    {l.title} <span className="muted">({list.length})</span>
                  </h3>
                  {list.length === 0 ? (
                    <p className="muted">No notes yet.</p>
                  ) : (
                    <ul className="notes">
                      {list.map((n) => (
                        <li key={n.id}>
                          <p>{n.body}</p>
                          <p className="muted small">
                            {students.find((s) => s.id === n.student_id)?.name ?? 'Student'} ·{' '}
                            <time dateTime={n.created_at}>{formatShort(n.created_at)}</time>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
        </section>
      )}
    </div>
  )
}

function Cell({ p, dueAt, level }: { p: LessonProgress | undefined; dueAt: string; level: 'none' | 'soon' | 'urgent' }) {
  const status = lessonStatus(p)
  if (status === 'not_opened') {
    return (
      <td className={`cell cell--none cell--${level}`}>
        {level !== 'none' && <span aria-hidden="true">! </span>}Not opened
      </td>
    )
  }
  const detail = `First opened ${formatShort(p!.first_opened_at)} · last watched ${formatShort(p!.last_watched_at)}${
    p!.completed_at ? ` · completed ${formatShort(p!.completed_at)}` : ''
  }`
  if (status === 'complete') {
    const late = new Date(p!.completed_at!) > new Date(dueAt)
    return (
      <td className="cell cell--done" title={detail}>
        ✓ Complete{late && <span className="late"> late</span>}
      </td>
    )
  }
  return (
    <td className="cell cell--progress" title={detail}>
      {pct(Number(p!.percent_watched))}
    </td>
  )
}
