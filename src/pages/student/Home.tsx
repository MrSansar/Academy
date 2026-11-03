import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { ClassMark, DateTab, PenArrow, Stamp, TodoRow } from '../../components/Notebook'
import { ErrorNote, Loading } from '../../components/ui'
import { greeting, tipOfTheDay } from '../../lib/fun'
import { dayPhrase, formatDue, formatMinutes, formatRelative } from '../../lib/format'
import { loadMyAssignments, loadMyClasses, loadMyProgress, type MyClass, type StudentAssignment } from '../../lib/studentData'
import { errorMessage } from '../../lib/supabase'
import { lessonStatus, type LessonProgress } from '../../lib/types'
import { JoinForm } from './Join'

const todayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

export function Home() {
  const { session, profile } = useAuth()
  const userId = session!.user.id
  const [assignments, setAssignments] = useState<StudentAssignment[] | null>(null)
  const [classes, setClasses] = useState<MyClass[]>([])
  const [progress, setProgress] = useState<Map<string, LessonProgress>>(new Map())
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([loadMyAssignments(), loadMyClasses(userId), loadMyProgress(userId)])
      .then(([a, c, p]) => {
        if (!active) return
        setAssignments(a)
        setClasses(c)
        setProgress(p)
      })
      .catch((e) => active && setError(errorMessage(e)))
    return () => {
      active = false
    }
  }, [userId, reload])

  if (error) return <div className="page"><ErrorNote>{error}</ErrorNote></div>
  if (!assignments) return <div className="page"><Loading label="Loading your assignments" /></div>

  const now = new Date(Date.now())
  const upcoming = assignments.filter((a) => new Date(a.due_at) >= now)
  const past = assignments.filter((a) => new Date(a.due_at) < now).reverse()
  const firstName = (profile?.full_name || '').split(' ')[0]

  return (
    <div className="page notebook">
      <header className="today">
        <p className="today__date">{todayFormat.format(now)}</p>
        <h1 className="today__hello">
          {greeting(now.getHours())}
          {firstName ? `, ${firstName}.` : '.'}
        </h1>
        {classes.length > 0 && <Lede upcoming={upcoming} progress={progress} now={now} />}
      </header>

      {classes.length === 0 ? (
        <section className="joinpage" aria-labelledby="join-h">
          <h2 id="join-h" className="rulehead">Join your class</h2>
          <p className="muted">Enter the join code your teacher gave you.</p>
          <JoinForm onJoined={() => setReload((n) => n + 1)} />
        </section>
      ) : (
        upcoming.length > 0 && (
          <section aria-labelledby="due-h">
            <h2 id="due-h" className="rulehead">Due before class</h2>
            <ol className="agenda">
              {upcoming.map((a) => (
                <AgendaItem key={a.id} a={a} progress={progress} now={now} />
              ))}
            </ol>
          </section>
        )
      )}

      {past.length > 0 && (
        <details className="earlier">
          <summary>Earlier assignments ({past.length})</summary>
          <ol className="agenda">
            {past.map((a) => (
              <AgendaItem key={a.id} a={a} progress={progress} now={now} />
            ))}
          </ol>
        </details>
      )}

      {classes.length > 0 && (
        <p className="tip">
          <span className="tip__label">Tip</span> {tipOfTheDay(now)}
        </p>
      )}
    </div>
  )
}

/** One sentence that says what's left before the next class, and a button to get going. */
function Lede({ upcoming, progress, now }: { upcoming: StudentAssignment[]; progress: Map<string, LessonProgress>; now: Date }) {
  const isDone = (id: string) => lessonStatus(progress.get(id)) === 'complete'

  if (upcoming.length === 0)
    return (
      <p className="today__lede">
        Nothing to watch right now. New assignments from your teacher will show up here.
      </p>
    )

  const target = upcoming.find((a) => a.lessons.some((l) => !isDone(l.id)))
  if (!target)
    return (
      <div className="today__ready">
        <Stamp seed="ready" big>
          Ready
        </Stamp>
        <p className="today__lede">You’ve watched everything for your upcoming classes. See you there.</p>
      </div>
    )

  const left = target.lessons.filter((l) => !isDone(l.id))
  const secondsLeft = left.reduce(
    (t, l) => t + l.duration_seconds * (1 - Math.min(100, Number(progress.get(l.id)?.percent_watched ?? 0)) / 100),
    0,
  )
  const next = left[0]
  const started = progress.get(next.id)
  const pctIn = Math.floor(Number(started?.percent_watched ?? 0))

  return (
    <>
      <p className="today__lede">
        Before {target.className ? <ClassMark id={target.classId} name={target.className} /> : 'class'}{' '}
        {dayPhrase(target.due_at, now)}, you have{' '}
        <strong>
          {left.length} short {left.length === 1 ? 'video' : 'videos'}
        </strong>{' '}
        left to watch, about {formatMinutes(Math.max(30, secondsLeft))}.
      </p>
      <p className="today__cta">
        <Link className="btn" to={`/lesson/${next.id}?a=${target.id}`}>
          {started ? 'Keep going' : 'Start'}: {next.title}
        </Link>
        <span className="aside" aria-hidden="true">
          <PenArrow />
          {started && pctIn > 0 ? `you’re ${pctIn}% in` : `only ${formatMinutes(next.duration_seconds)}!`}
        </span>
      </p>
    </>
  )
}

function AgendaItem({ a, progress, now }: { a: StudentAssignment; progress: Map<string, LessonProgress>; now: Date }) {
  const statuses = a.lessons.map((l) => lessonStatus(progress.get(l.id)))
  const done = statuses.filter((s) => s === 'complete').length
  const allDone = a.lessons.length > 0 && done === a.lessons.length
  const total = a.lessons.reduce((t, l) => t + l.duration_seconds, 0)
  const isPast = new Date(a.due_at) < now

  return (
    <li className={allDone ? 'agenda__item agenda__item--done' : 'agenda__item'}>
      <DateTab iso={a.due_at} />
      <div className="agenda__body">
        {a.className && (
          <p className="agenda__class">
            <ClassMark id={a.classId} name={a.className} />
          </p>
        )}
        <h3 className="agenda__title">{a.title}</h3>
        <p className="agenda__due">
          Due before class on <time dateTime={a.due_at}>{formatDue(a.due_at)}</time>
          <span className="muted"> · {isPast ? 'class has started' : formatRelative(a.due_at, now.getTime())}</span>
        </p>
        {a.instructions && (
          <p className="teacher-note">
            <span className="visually-hidden">Note from your teacher: </span>
            {a.instructions}
          </p>
        )}
        <ol className="todo">
          {a.lessons.map((l, i) => (
            <TodoRow
              key={l.id}
              to={`/lesson/${l.id}?a=${a.id}`}
              title={l.title}
              status={statuses[i]}
              percent={progress.get(l.id)?.percent_watched}
              meta={formatMinutes(l.duration_seconds)}
            />
          ))}
        </ol>
        <p className="agenda__foot">
          {done} of {a.lessons.length} done · about {formatMinutes(total)} in all
        </p>
      </div>
      {allDone && (
        <span className="agenda__stamp">
          <Stamp seed={a.id}>Done</Stamp>
        </span>
      )}
    </li>
  )
}
