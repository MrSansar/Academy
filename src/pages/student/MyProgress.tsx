import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { ClassMark, StarSticker, TodoRow } from '../../components/Notebook'
import { ErrorNote, Loading } from '../../components/ui'
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

/** Per class: lessons done vs. assigned, as a sticker chart. Deliberately no streaks, points or rankings. */
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
    <div className="page notebook">
      <header className="today">
        <h1 className="today__hello">My progress</h1>
        <p className="today__lede">A star for every lesson you finish. Only you and your teacher can see this page.</p>
      </header>
      {data.c.length === 0 && (
        <p className="nothing">
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
        const allDone = list.length > 0 && done === list.length
        return (
          <section key={cls.id} className="chart" aria-labelledby={`cls-${cls.id}`}>
            <h2 id={`cls-${cls.id}`} className="chart__title">
              <ClassMark id={cls.id} name={cls.name} />
            </h2>
            {list.length === 0 ? (
              <p className="muted">No lessons assigned yet.</p>
            ) : (
              <>
                <div className="chart__stickers">
                  {list.map((r) => (
                    <StarSticker key={r.lessonId} seed={r.lessonId} state={lessonStatus(data.p.get(r.lessonId))} />
                  ))}
                  <p className="chart__count">
                    <strong>{done}</strong> of {list.length} done
                    {allDone && <span className="chart__cheer"> all caught up!</span>}
                  </p>
                </div>
                <ol className="todo">
                  {list.map((r) => {
                    const p = data.p.get(r.lessonId)
                    return (
                      <TodoRow
                        key={r.lessonId}
                        to={`/lesson/${r.lessonId}?a=${r.assignmentId}`}
                        title={r.title}
                        status={lessonStatus(p)}
                        percent={p?.percent_watched}
                        meta={`due ${formatDue(r.dueAt)}`}
                      />
                    )
                  })}
                </ol>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
