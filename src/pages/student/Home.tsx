import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { AssignmentBadge, ErrorNote, LessonBadge, Loading } from '../../components/ui'
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
      <div className="lede">
        <h1>{firstName ? `Hi ${firstName}` : 'Your assignments'}</h1>
        <p className="muted">Watch these before class. Soonest first.</p>
      </div>

      {classes.length === 0 ? (
        <section className="card narrow" aria-labelledby="join-h">
          <h2 id="join-h">Join your class</h2>
          <p className="muted">Enter the join code your teacher gave you.</p>
          <JoinForm onJoined={() => setReload((n) => n + 1)} />
        </section>
      ) : upcoming.length === 0 ? (
        <p className="empty">Nothing due right now. New assignments from your teacher will show up here.</p>
      ) : (
        <ul className="stack" aria-label="Upcoming assignments">
          {upcoming.map((a) => (
            <AssignmentCard key={a.id} a={a} progress={progress} showClass={classes.length > 1} />
          ))}
        </ul>
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

  return (
    <li className="card assignment">
      <div className="assignment__head">
        <div>
          {showClass && <p className="eyebrow">{a.className}</p>}
          <h2 className="assignment__title">{a.title}</h2>
          <p className="due">
            Due before class on <time dateTime={a.due_at}>{formatDue(a.due_at)}</time>
            <span className="muted"> · {isPast ? 'class has started' : formatRelative(a.due_at)}</span>
          </p>
        </div>
        <AssignmentBadge status={status} />
      </div>
      {a.instructions && <p className="assignment__note">{a.instructions}</p>}
      <ol className="lessons">
        {a.lessons.map((l, i) => {
          const p = progress.get(l.id)
          return (
            <li key={l.id}>
              <Link to={`/lesson/${l.id}?a=${a.id}`} className="lessonrow">
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
