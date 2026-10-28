import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { ErrorNote, LessonBadge, Loading, ProgressBar } from '../../components/ui'
import { formatDue } from '../../lib/format'
import { loadMyAssignments, loadMyClasses, loadMyProgress, type MyClass, type StudentAssignment } from '../../lib/studentData'
import { errorMessage } from '../../lib/supabase'
import { lessonStatus, type LessonProgress } from '../../lib/types'

interface Row {
  lessonId: string
  title: string
  assignmentId: string
  dueAt: string
}

/** Per class: lessons done vs. assigned. Deliberately no streaks, points or rankings. */
export function MyProgress() {
  const { session } = useAuth()
  const userId = session!.user.id
  const [data, setData] = useState<{ a: StudentAssignment[]; c: MyClass[]; p: Map<string, LessonProgress> } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([loadMyAssignments(), loadMyClasses(userId), loadMyProgress(userId)])
      .then(([a, c, p]) => setData({ a, c, p }))
      .catch((e) => setError(errorMessage(e)))
  }, [userId])

  if (error) return <div className="page"><ErrorNote>{error}</ErrorNote></div>
  if (!data) return <div className="page"><Loading label="Loading your progress" /></div>

  return (
    <div className="page">
      <div className="lede">
        <h1>My progress</h1>
        <p className="muted">Only you and your teacher can see this.</p>
      </div>
      {data.c.length === 0 && (
        <p className="empty">
          You’re not in a class yet. <Link to="/join">Join a class</Link>
        </p>
      )}
      {data.c.map((cls) => {
        // A lesson assigned twice in one class is listed once, under its earliest due date.
        const rows = new Map<string, Row>()
        for (const a of data.a.filter((x) => x.classId === cls.id)) {
          for (const l of a.lessons) {
            if (!rows.has(l.id)) rows.set(l.id, { lessonId: l.id, title: l.title, assignmentId: a.id, dueAt: a.due_at })
          }
        }
        const list = [...rows.values()]
        const done = list.filter((r) => data.p.get(r.lessonId)?.completed_at).length
        return (
          <section key={cls.id} className="card" aria-labelledby={`cls-${cls.id}`}>
            <div className="assignment__head">
              <h2 id={`cls-${cls.id}`} className="assignment__title">{cls.name}</h2>
              <p className="count">
                <strong>{done}</strong> of {list.length} lessons done
              </p>
            </div>
            <ProgressBar value={list.length ? (done / list.length) * 100 : 0} label={`${cls.name}: lessons done`} />
            {list.length === 0 ? (
              <p className="muted">No lessons assigned yet.</p>
            ) : (
              <ul className="lessons">
                {list.map((r) => {
                  const p = data.p.get(r.lessonId)
                  return (
                    <li key={r.lessonId}>
                      <Link to={`/lesson/${r.lessonId}?a=${r.assignmentId}`} className="lessonrow">
                        <span className="lessonrow__title">{r.title}</span>
                        <span className="lessonrow__meta">due {formatDue(r.dueAt)}</span>
                        <LessonBadge status={lessonStatus(p)} percent={p?.percent_watched} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
