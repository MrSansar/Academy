import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Crumbs, ErrorNote, Field, Loading, TextArea } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { formatClock } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import type { Course, Lesson } from '../../lib/types'

export const LONG_LESSON_SECONDS = 10 * 60

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type LessonLite = Pick<Lesson, 'id' | 'title' | 'position' | 'duration_seconds' | 'check_enabled' | 'confusion_enabled'> & {
  questions: { count: number }[]
  assignment_lessons: { count: number }[]
}

export function CourseLessons() {
  const { courseId = '' } = useParams()
  const [course, setCourse] = useState<Course | null>(null)
  const [lessons, setLessons] = useState<LessonLite[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  usePageTitle(course?.title ?? 'Course')

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([
      supabase.from('courses').select('*').eq('id', courseId).single(),
      supabase
        .from('lessons')
        .select('id, title, position, duration_seconds, check_enabled, confusion_enabled, questions(count), assignment_lessons(count)')
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

  if (!course || !lessons) return <div className="t-page t-page--narrow">{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</div>

  const unassigned = lessons.filter((l) => !(l.assignment_lessons[0]?.count ?? 0)).length

  return (
    <div className="t-page t-page--narrow">
      <Crumbs items={[{ label: 'Lessons', to: '/teach/courses' }, { label: course.title }]} />
      {editing ? (
        <CourseForm course={course} onDone={(c) => { if (c) setCourse(c); setEditing(false) }} />
      ) : (
        <header className="t-head">
          <div className="t-head__main">
            <h1>{course.title}</h1>
            <p className="t-head__meta">
              {course.description ? `${course.description} · ` : ''}
              {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
            </p>
          </div>
          <div className="t-head__actions">
            <button className="btn btn--ghost btn--small" onClick={() => setEditing(true)}>
              Rename
            </button>
            <Link className="btn btn--small" to={`/teach/courses/${course.id}/lessons/new`}>
              New lesson
            </Link>
          </div>
        </header>
      )}
      <ErrorNote>{error}</ErrorNote>
      {unassigned > 0 && (
        <p className="t-callout t-callout--warn">
          {unassigned === 1 ? '1 lesson isn’t' : `${unassigned} lessons aren’t`} in any assignment yet, so students can’t
          see {unassigned === 1 ? 'it' : 'them'}. Open the lesson to add it to one, or use the overview.
        </p>
      )}

      {lessons.length === 0 ? (
        <p className="t-callout">No lessons yet. Add one with a YouTube link.</p>
      ) : (
        <div className="t-card">
          <table className="t-table">
            <thead>
              <tr>
                <th scope="col" className="t-ord">#</th>
                <th scope="col">Lesson</th>
                <th scope="col">Length</th>
                <th scope="col">Students see it</th>
                <th scope="col">Extras</th>
                <th scope="col" className="t-table__actions">
                  <span className="visually-hidden">Order</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l, i) => {
                const used = l.assignment_lessons[0]?.count ?? 0
                return (
                  <tr key={l.id}>
                    <td className="t-ord">{i + 1}</td>
                    <td className="t-strong">
                      <Link to={`/teach/lessons/${l.id}`}>{l.title}</Link>
                    </td>
                    <td className="t-nowrap">
                      {formatClock(l.duration_seconds)}
                      {l.duration_seconds > LONG_LESSON_SECONDS && <span className="t-tag t-tag--warn">over 10 min</span>}
                    </td>
                    <td>
                      {used ? (
                        <span>
                          In {used} {used === 1 ? 'assignment' : 'assignments'}
                        </span>
                      ) : (
                        <span className="t-tag t-tag--warn" style={{ marginLeft: 0 }}>
                          Not assigned
                        </span>
                      )}
                    </td>
                    <td className="t-muted t-small">
                      {[l.check_enabled && plural(l.questions[0]?.count ?? 0, 'check question'), l.confusion_enabled && 'confusion box']
                        .filter(Boolean)
                        .join(' · ') || '–'}
                    </td>
                    <td className="t-table__actions">
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
    <form className="t-card t-card--pad" onSubmit={submit}>
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
