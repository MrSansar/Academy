import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorNote, Field, Loading, TextArea } from '../../components/ui'
import { formatClock } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import type { Course, Lesson } from '../../lib/types'

export const LONG_LESSON_SECONDS = 10 * 60

type LessonLite = Pick<Lesson, 'id' | 'title' | 'position' | 'duration_seconds' | 'check_enabled' | 'confusion_enabled'> & {
  questions: { count: number }[]
}

export function CourseLessons() {
  const { courseId = '' } = useParams()
  const [course, setCourse] = useState<Course | null>(null)
  const [lessons, setLessons] = useState<LessonLite[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([
      supabase.from('courses').select('*').eq('id', courseId).single(),
      supabase
        .from('lessons')
        .select('id, title, position, duration_seconds, check_enabled, confusion_enabled, questions(count)')
        .eq('course_id', courseId)
        .order('position')
        .order('created_at'),
    ])
    if (c.error || l.error) return setError(errorMessage(c.error ?? l.error))
    setCourse(c.data)
    setLessons(l.data as LessonLite[])
  }, [courseId])

  useEffect(() => {
    void load()
  }, [load])

  async function move(index: number, delta: -1 | 1) {
    if (!lessons) return
    const next = [...lessons]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    setLessons(next)
    const results = await Promise.all(
      next.map((l, i) => supabase.from('lessons').update({ position: i }).eq('id', l.id)),
    )
    const failed = results.find((r) => r.error)
    if (failed) setError(errorMessage(failed.error))
  }

  if (!course || !lessons) return <div className="page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</div>

  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to="/teach">← Classes &amp; courses</Link>
      </nav>
      {editing ? (
        <CourseForm course={course} onDone={(c) => { if (c) setCourse(c); setEditing(false) }} />
      ) : (
        <div className="lede lede--row">
          <div>
            <h1>{course.title}</h1>
            {course.description && <p className="muted">{course.description}</p>}
          </div>
          <div className="row">
            <button className="btn btn--ghost btn--small" onClick={() => setEditing(true)}>
              Rename
            </button>
            <Link className="btn" to={`/teach/courses/${course.id}/lessons/new`}>
              New lesson
            </Link>
          </div>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>

      {lessons.length === 0 ? (
        <p className="empty">No lessons yet. Add one with a YouTube link.</p>
      ) : (
        <ol className="card editlist" aria-label="Lessons in this course">
          {lessons.map((l, i) => (
            <li key={l.id} className="editlist__row">
              <span className="lessonrow__num" aria-hidden="true">{i + 1}</span>
              <div className="editlist__main">
                <Link to={`/teach/lessons/${l.id}`} className="editlist__title">{l.title}</Link>
                <p className="muted small">
                  {formatClock(l.duration_seconds)}
                  {l.duration_seconds > LONG_LESSON_SECONDS && <span className="tag tag--warn">over 10 min</span>}
                  {l.check_enabled && <span className="tag">check: {l.questions[0]?.count ?? 0} questions</span>}
                  {l.confusion_enabled && <span className="tag">confusion box on</span>}
                </p>
              </div>
              <div className="reorder">
                <button className="iconbtn" disabled={i === 0} aria-label={`Move “${l.title}” up`} onClick={() => void move(i, -1)}>
                  ↑
                </button>
                <button
                  className="iconbtn"
                  disabled={i === lessons.length - 1}
                  aria-label={`Move “${l.title}” down`}
                  onClick={() => void move(i, 1)}
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function CourseForm({ course, onDone }: { course: Course; onDone: (c: Course | null) => void }) {
  const [title, setTitle] = useState(course.title)
  const [description, setDescription] = useState(course.description)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase
      .from('courses')
      .update({ title: title.trim(), description: description.trim() })
      .eq('id', course.id)
      .select()
      .single()
    if (error) return setError(errorMessage(error))
    onDone(data)
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <Field label="Course title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextArea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      <ErrorNote>{error}</ErrorNote>
      <div className="row">
        <button className="btn">Save</button>
        <button type="button" className="btn btn--ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
