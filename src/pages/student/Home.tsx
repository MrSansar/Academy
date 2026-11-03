import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { DoodleField, Lightbulb, Sleepy, Star } from '../../components/Doodles'
import { AssignmentBadge, ErrorNote, LessonBadge, Loading, ProgressRing } from '../../components/ui'
import { classTint, greeting, tipOfTheDay } from '../../lib/fun'
import { formatDue, formatMinutes, formatRelative } from '../../lib/format'
import { loadMyAssignments, loadMyClasses, loadMyProgress, type MyClass, type StudentAssignment } from '../../lib/studentData'
import { errorMessage } from '../../lib/supabase'
import { assignmentStatus, lessonStatus, type LessonProgress } from '../../lib/types'
import { JoinForm } from './Join'

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

  const now = Date.now()
  const upcoming = assignments.filter((a) => new Date(a.due_at).getTime() >= now)
  const past = assignments.filter((a) => new Date(a.due_at).getTime() < now).reverse()
  const firstName = (profile?.full_name || '').split(' ')[0]

  return (
    <div className="page">
      <Hero now={now} firstName={firstName} upcoming={upcoming} progress={progress} hasClasses={classes.length > 0} />

      {classes.length === 0 ? (
        <section className="card narrow" aria-labelledby="join-h">
          <h2 id="join-h">Join your class</h2>
          <p className="muted">Enter the join code your teacher gave you.</p>
          <JoinForm onJoined={() => setReload((n) => n + 1)} />
        </section>
      ) : upcoming.length === 0 ? (
        <div className="empty empty--fun">
          <Sleepy className="empty__doodle" />
          <p>
            <strong>Nothing due right now.</strong> Enjoy the break! New assignments from your teacher will show up
            here.
          </p>
        </div>
      ) : (
        <>
          <h2 className="section-title">Coming up</h2>
          <ul className="stack" aria-label="Upcoming assignments">
            {upcoming.map((a) => (
              <AssignmentCard key={a.id} a={a} progress={progress} showClass={classes.length > 1} />
            ))}
          </ul>
        </>
      )}

      {past.length > 0 && (
        <details className="past">
          <summary>Earlier assignments ({past.length})</summary>
          <ul className="stack">
            {past.map((a) => (
              <AssignmentCard key={a.id} a={a} progress={progress} showClass={classes.length > 1} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** Greeting, tip of the day, and how ready the student is for their next class. */
function Hero({
  now: nowMs,
  firstName,
  upcoming,
  progress,
  hasClasses,
}: {
  now: number
  firstName: string
  upcoming: StudentAssignment[]
  progress: Map<string, LessonProgress>
  hasClasses: boolean
}) {
  const now = new Date(nowMs)
  const hello = greeting(now.getHours())
  const nextA = upcoming[0]
  const nextLessons = nextA?.lessons ?? []
  const doneCount = nextLessons.filter((l) => lessonStatus(progress.get(l.id)) === 'complete').length
  const resume = nextLessons.find((l) => lessonStatus(progress.get(l.id)) !== 'complete')
  const allUpcomingDone =
    upcoming.length > 0 &&
    upcoming.every((a) => a.lessons.every((l) => lessonStatus(progress.get(l.id)) === 'complete'))

  return (
    <section className="hero" aria-labelledby="hero-h">
      <DoodleField />
      <div className="hero__main">
        <p className="hero__kicker">
          {hello.text} <span aria-hidden="true">{hello.emoji}</span>
        </p>
        <h1 id="hero-h" className="hero__title">
          {firstName ? `Hi ${firstName}!` : 'Your assignments'}
        </h1>
        <p className="hero__tip">
          <Lightbulb className="hero__tip-icon" />
          <span>
            <span className="visually-hidden">Tip: </span>
            {tipOfTheDay(now)}
          </span>
        </p>
      </div>

      {hasClasses && nextA && (
        <div className="hero__next">
          {allUpcomingDone ? (
            <div className="hero__ready">
              <Star className="hero__star" />
              <p className="hero__ready-title">You’re ready for class!</p>
              <p className="hero__ready-text">Every upcoming lesson is done. Nice work.</p>
            </div>
          ) : (
            <>
              <ProgressRing done={doneCount} total={nextLessons.length} size={76} label={`${nextA.title}`} />
              <div className="hero__next-text">
                <p className="hero__next-label">Next up · {formatRelative(nextA.due_at)}</p>
                <p className="hero__next-title">{nextA.title}</p>
                {resume && (
                  <Link className="btn btn--chalk btn--small" to={`/lesson/${resume.id}?a=${nextA.id}`}>
                    {progress.get(resume.id) ? 'Continue' : 'Start'}: {resume.title} →
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function AssignmentCard({
  a,
  progress,
  showClass,
}: {
  a: StudentAssignment
  progress: Map<string, LessonProgress>
  showClass: boolean
}) {
  const statuses = a.lessons.map((l) => lessonStatus(progress.get(l.id)))
  const status = assignmentStatus(statuses)
  const minutes = a.lessons.reduce((t, l) => t + l.duration_seconds, 0)
  const isPast = new Date(a.due_at).getTime() < Date.now()

  const done = statuses.filter((x) => x === 'complete').length

  return (
    <li className={`card assignment tint--${classTint(a.classId)}${status === 'done' ? ' assignment--done' : ''}`}>
      <div className="assignment__head">
        <div>
          {showClass && <p className="eyebrow">{a.className}</p>}
          <h2 className="assignment__title">{a.title}</h2>
          <p className="due">
            Due before class on <time dateTime={a.due_at}>{formatDue(a.due_at)}</time>
            <span className="muted"> · {isPast ? 'class has started' : formatRelative(a.due_at)}</span>
          </p>
        </div>
        <div className="assignment__status">
          <ProgressRing done={done} total={a.lessons.length} size={48} label={a.title} />
          <AssignmentBadge status={status} />
        </div>
      </div>
      {a.instructions && <p className="assignment__note">{a.instructions}</p>}
      <ol className="lessons lessons--trail">
        {a.lessons.map((l, i) => {
          const p = progress.get(l.id)
          return (
            <li key={l.id}>
              <Link to={`/lesson/${l.id}?a=${a.id}`} className={`lessonrow lessonrow--${statuses[i]}`}>
                <span className="lessonrow__num" aria-hidden="true">
                  {statuses[i] === 'complete' ? '✓' : i + 1}
                </span>
                <span className="lessonrow__title">{l.title}</span>
                <span className="lessonrow__meta">{formatMinutes(l.duration_seconds)}</span>
                <LessonBadge status={statuses[i]} percent={p?.percent_watched} />
              </Link>
            </li>
          )
        })}
      </ol>
      <p className="assignment__foot muted">
        {a.lessons.length} {a.lessons.length === 1 ? 'lesson' : 'lessons'} · about {formatMinutes(minutes)}
      </p>
    </li>
  )
}
