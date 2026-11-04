import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Crumbs, ErrorNote, Loading } from '../../components/ui'
import { dayPhrase, formatShort, pct, pctRound } from '../../lib/format'
import { usePageTitle } from '../../lib/pageTitle'
import { errorMessage } from '../../lib/supabase'
import {
  exportAssignmentCsv,
  loadAssignmentReport,
  progressKey,
  questionStats,
  type AssignmentReport,
} from '../../lib/teacherData'
import { prepFor, studentPath, urgency, type OvClass, type OvNote } from '../../lib/teacherOverview'
import { choicesOf, lessonStatus, type LessonProgress } from '../../lib/types'
import { useNoteActions } from '../../lib/useNoteActions'
import { NoteActionStatus, NoteCard, NotOpenedList, PrepBar } from './parts'

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

  if (!report) return <div className="page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Loading report" />}</div>

  const { assignment, lessons, students, progress, questions, attempts } = report
  const level = urgency(assignment.due_at, loadedAt)
  const now = new Date(loadedAt)
  const isPast = new Date(assignment.due_at).getTime() < loadedAt
  const prep = prepFor({ lessons }, students, progress)
  // Just enough of the class for note cards to link names and show the class label.
  const cls: OvClass = {
    id: assignment.class_id,
    name: report.className,
    archived: false,
    joinCode: '',
    courseId: '',
    courseTitle: '',
    students: students.map((s) => ({ ...s, joinedAt: '' })),
    assignments: [{ id: assignment.id, title: assignment.title, due_at: assignment.due_at, classId: assignment.class_id, lessons }],
  }

  return (
    <div className="page page--wide teach">
      <Crumbs
        items={[
          { label: 'Classes', to: '/teach/classes' },
          { label: report.className, to: `/teach/classes/${assignment.class_id}` },
          { label: assignment.title },
        ]}
      />
      <header className="pagehead pagehead--row">
        <div>
          <h1>{assignment.title}</h1>
          <p className="muted">
            {isPast ? 'Was due' : 'Due'} <time dateTime={assignment.due_at}>{dayPhrase(assignment.due_at, now)}</time>
            {' · '}
            {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} · {students.length}{' '}
            {students.length === 1 ? 'student' : 'students'}
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
      </header>

      {students.length > 0 && lessons.length > 0 && (
        <div className="reportprep">
          <PrepBar prep={prep} />
          <NotOpenedList prep={prep} classId={assignment.class_id} level={level} max={12} />
        </div>
      )}

      {students.length === 0 ? (
        <p className="nothing">No students in this class yet. Share the join code from the class page.</p>
      ) : lessons.length === 0 ? (
        <p className="nothing">This assignment has no lessons. Add some with Edit.</p>
      ) : (
        <section className="section" aria-labelledby="grid-h">
          <h2 id="grid-h" className="rulehead">
            Who prepared
          </h2>
          <div className="tablewrap tablewrap--flat" tabIndex={0} role="region" aria-label="Progress table, scrolls sideways">
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
                {students.map((s) => {
                  const done = lessons.filter((l) => lessonStatus(progress.get(progressKey(s.id, l.id))) === 'complete').length
                  return (
                    <tr key={s.id}>
                      <th scope="row">
                        <Link to={studentPath(assignment.class_id, s.id)}>{s.name}</Link>
                        <span className="email">{s.email}</span>
                      </th>
                      {lessons.map((l) => (
                        <Cell key={l.id} p={progress.get(progressKey(s.id, l.id))} dueAt={assignment.due_at} level={level} />
                      ))}
                      <td className={done === lessons.length ? 'cell cell--done' : 'cell'}>
                        {done}/{lessons.length} done
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="legend muted small">
            “Not opened” turns <span className="key key--soon">amber</span> within 3 days of class and{' '}
            <span className="key key--urgent">red</span> within 24 hours. Complete = 90% of the video’s seconds actually
            played (skipping ahead doesn’t count). “Late” = finished after class started.
          </p>
        </section>
      )}

      {lessons.some((l) => l.check_enabled) && (
        <section aria-labelledby="q-h" className="section">
          <h2 id="q-h" className="rulehead">
            Check questions <span className="rulehead__aside">first try only</span>
          </h2>
          <p className="muted small">Low numbers are ideas to go over in class. Retries don’t count.</p>
          {lessons
            .filter((l) => l.check_enabled)
            .map((l) => {
              const qs = questions.filter((q) => q.lesson_id === l.id)
              return (
                <div key={l.id} className="qlesson">
                  <h3 className="qlesson__title">{l.title}</h3>
                  {qs.length === 0 && <p className="muted">No questions written for this lesson yet.</p>}
                  {qs.map((q, i) => {
                    const choices = choicesOf(q)
                    const st = questionStats(q, attempts, choices.length)
                    const enough = st.answered >= MIN_ANSWERS
                    const rate = st.answered ? (st.firstTryCorrect / st.answered) * 100 : 0
                    return (
                      <div key={q.id} className="qstat">
                        <p className="qstat__prompt">
                          <strong>{i + 1}.</strong> {q.prompt}
                        </p>
                        <p className={enough ? (rate < 60 ? 'qstat__rate qstat__rate--low' : 'qstat__rate') : 'qstat__rate qstat__rate--few'}>
                          {st.answered === 0
                            ? 'No answers yet'
                            : enough
                              ? `${pctRound(rate)} right on the first try`
                              : `${st.answered} ${st.answered === 1 ? 'answer' : 'answers'} so far, too few to tell`}
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
          <h2 id="c-h" className="rulehead">
            What confused them
            <Link className="rulehead__end" to="/teach/notes">
              All notes →
            </Link>
          </h2>
          <NoteActionStatus status={actions.status} error={actions.error} />
          {lessons
            .filter((l) => l.confusion_enabled)
            .map((l) => {
              const list = notes.filter((n) => n.lessonId === l.id)
              const open = list.filter((n) => !n.handledAt)
              return (
                <div key={l.id} className="notegroup">
                  <div className="notegroup__head">
                    <h3>{l.title}</h3>
                    <span className="notegroup__count">
                      {open.length} open{list.length - open.length ? ` · ${list.length - open.length} handled` : ''}
                    </span>
                    {open.length > 0 && (
                      <span className="notegroup__actions">
                        <button
                          type="button"
                          className="btn btn--done btn--small"
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
                    <p className="muted">No notes yet.</p>
                  ) : (
                    <ul className="notes-board">
                      {list.map((n) => (
                        <NoteCard key={n.id} note={n} now={loadedAt} classes={[cls]} showLesson={false} onHandle={actions.toggle} />
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
