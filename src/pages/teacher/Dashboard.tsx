import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { ClassMark, DateTab } from '../../components/Notebook'
import { ErrorNote, Loading } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { greeting } from '../../lib/fun'
import { dayPhrase, formatJoinCode } from '../../lib/format'
import { errorMessage } from '../../lib/supabase'
import { loadOverview, prepFor, upcomingAssignments, urgency, type OvNote, type Overview } from '../../lib/teacherOverview'
import { useNoteActions } from '../../lib/useNoteActions'
import { NoteActionStatus, NoteCard, NotOpenedList, PrepBar } from './parts'

const WEEK = 7 * 86_400_000

export function Dashboard() {
  const { profile } = useAuth()
  usePageTitle('Dashboard')
  const [data, setData] = useState<Overview | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  // The notes that were open when the page loaded: they stay listed after being handled, so Reopen is right there.
  const [shownNotes, setShownNotes] = useState<number[]>([])
  const updateNotes = useCallback((fn: (n: OvNote[]) => OvNote[]) => setData((d) => d && { ...d, notes: fn(d.notes) }), [])
  const actions = useNoteActions(updateNotes)

  useEffect(() => {
    let active = true
    loadOverview({ notesLimit: 300 })
      .then((d) => {
        if (!active) return
        setData(d)
        setShownNotes(d.notes.filter((n) => !n.handledAt).slice(0, 5).map((n) => n.id))
        setLoadedAt(Date.now())
      })
      .catch((e) => active && setError(errorMessage(e)))
    return () => {
      active = false
    }
  }, [reload])

  if (error) return <div className="page"><ErrorNote>{error}</ErrorNote></div>
  if (!data) return <div className="page"><Loading label="Loading your dashboard" /></div>

  const now = new Date(loadedAt)
  const firstName = (profile?.full_name || '').split(' ')[0]
  const active = data.classes.filter((c) => !c.archived)
  const upcoming = upcomingAssignments(data.classes, loadedAt)
  const thisWeek = upcoming.filter((x) => new Date(x.a.due_at).getTime() - loadedAt <= WEEK)
  const shown = (thisWeek.length ? thisWeek : upcoming).slice(0, 6)
  const openNotes = data.notes.filter((n) => !n.handledAt)
  const next = upcoming[0]
  const nextPrep = next ? prepFor(next.a, next.cls.students, data.progress) : null

  return (
    <div className="page notebook teach">
      <header className="today">
        <p className="today__date">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now)}</p>
        <h1 className="today__hello">
          {greeting(now.getHours())}
          {firstName ? `, ${firstName}.` : '.'}
        </h1>
        {active.length === 0 ? (
          <p className="today__lede">Let’s set up your first class.</p>
        ) : (
          <p className="today__lede">
            {next && nextPrep ? (
              <>
                Next up is <strong>{next.a.title}</strong> for <ClassMark id={next.cls.id} name={next.cls.name} />{' '}
                {dayPhrase(next.a.due_at, now)}:{' '}
                <strong>
                  {nextPrep.ready.length} of {next.cls.students.length}
                </strong>{' '}
                {next.cls.students.length === 1 ? 'student is' : 'students are'} ready.{' '}
              </>
            ) : (
              <>No assignments coming up. </>
            )}
            {openNotes.length > 0 ? (
              <>
                You have{' '}
                <Link to="/teach/notes">
                  {openNotes.length} open {openNotes.length === 1 ? 'note' : 'notes'}
                </Link>{' '}
                from students.
              </>
            ) : (
              <>No open notes from students.</>
            )}
          </p>
        )}
      </header>

      {active.length === 0 ? (
        <GettingStarted />
      ) : (
        <div className="dash">
          <section className="dash__main" aria-labelledby="up-h">
            <h2 id="up-h" className="rulehead">
              Coming up
              <span className="rulehead__aside">{thisWeek.length ? 'this week' : 'next'}</span>
              <button type="button" className="linkish rulehead__end" onClick={() => setReload((n) => n + 1)}>
                Refresh
              </button>
            </h2>
            {shown.length === 0 ? (
              <p className="nothing">
                Nothing due. <Link to="/teach/classes">Make an assignment</Link> from a class page.
              </p>
            ) : (
              <ol className="agenda">
                {shown.map(({ a, cls }) => {
                  const prep = prepFor(a, cls.students, data.progress)
                  return (
                    <li key={a.id} className="agenda__item">
                      <DateTab iso={a.due_at} urgent={urgency(a.due_at, loadedAt) === 'urgent'} />
                      <div className="agenda__body">
                        <p className="agenda__class">
                          <ClassMark id={cls.id} name={cls.name} />
                        </p>
                        <h3 className="agenda__title">
                          <Link to={`/teach/assignments/${a.id}`}>{a.title}</Link>
                        </h3>
                        <p className="agenda__due">
                          Due <time dateTime={a.due_at}>{dayPhrase(a.due_at, now)}</time>
                          <span className="muted">
                            {' '}
                            · {a.lessons.length} {a.lessons.length === 1 ? 'lesson' : 'lessons'}
                          </span>
                        </p>
                        {cls.students.length === 0 ? (
                          <p className="muted small">No students in this class yet.</p>
                        ) : (
                          <>
                            <PrepBar prep={prep} />
                            <NotOpenedList prep={prep} classId={cls.id} level={urgency(a.due_at, loadedAt)} />
                          </>
                        )}
                        <p className="agenda__foot">
                          <Link to={`/teach/assignments/${a.id}`}>Full report →</Link>
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <aside className="dash__side">
            <section aria-labelledby="notes-h">
              <h2 id="notes-h" className="rulehead">
                What confused them
                <Link className="rulehead__end" to="/teach/notes">
                  All notes →
                </Link>
              </h2>
              <NoteActionStatus status={actions.status} error={actions.error} />
              {shownNotes.length === 0 ? (
                <p className="muted dash__empty">
                  {data.notes.length === 0
                    ? 'No notes yet. Students can leave one under any lesson that has the “What was confusing?” box on.'
                    : 'Nothing open. Every note has been handled.'}
                </p>
              ) : (
                <ul className="notes-board notes-board--stack">
                  {data.notes
                    .filter((n) => shownNotes.includes(n.id))
                    .map((n) => (
                      <NoteCard key={n.id} note={n} now={loadedAt} classes={data.classes} onHandle={actions.toggle} />
                    ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="cls-h" className="dash__classes">
              <h2 id="cls-h" className="rulehead">
                Your classes
                <Link className="rulehead__end" to="/teach/classes">
                  All →
                </Link>
              </h2>
              <ul className="classlist">
                {active.map((c) => (
                  <li key={c.id}>
                    <Link to={`/teach/classes/${c.id}`} className="classlist__row">
                      <ClassMark id={c.id} name={c.name} />
                      <span className="classlist__meta">
                        {c.students.length} {c.students.length === 1 ? 'student' : 'students'} · code{' '}
                        <code>{formatJoinCode(c.joinCode)}</code>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  )
}

/** First-run checklist: the four steps from nothing to students watching. */
function GettingStarted() {
  return (
    <section aria-labelledby="start-h" className="setup">
      <h2 id="start-h" className="rulehead">Getting started</h2>
      <ol className="setup__steps">
        <li>
          <strong>Add your lessons.</strong> Make a course and paste YouTube links.{' '}
          <Link to="/teach/courses">Go to Courses</Link>
        </li>
        <li>
          <strong>Make a class.</strong> Each class gets its own join code.{' '}
          <Link to="/teach/classes">Go to Classes</Link>
        </li>
        <li>
          <strong>Share the join code</strong> with your students.
        </li>
        <li>
          <strong>Assign lessons</strong> before each class, then check back here to see who’s ready and what
          confused them.
        </li>
      </ol>
    </section>
  )
}
