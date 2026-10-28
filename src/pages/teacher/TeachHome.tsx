import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ErrorNote, Field, Loading, TextArea } from '../../components/ui'
import { formatJoinCode } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'

interface CourseRow {
  id: string
  title: string
  description: string
  lessons: { count: number }[]
  classes: { id: string; name: string; join_code: string; archived: boolean; enrollments: { count: number }[] }[]
}

export function TeachHome() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CourseRow[] | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    supabase
      .from('courses')
      .select('id, title, description, lessons(count), classes(id, name, join_code, archived, enrollments(count))')
      .order('created_at')
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error))
        else setCourses(data as CourseRow[])
      })
  }, [reload])

  async function addCourse(e: FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase
      .from('courses')
      .insert({ title: title.trim(), description: description.trim() })
      .select('id')
      .single()
    if (error) return setError(errorMessage(error))
    navigate(`/teach/courses/${data.id}`)
  }

  if (!courses) return <div className="page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</div>

  return (
    <div className="page">
      <div className="lede lede--row">
        <div>
          <h1>Classes &amp; courses</h1>
          <p className="muted">A course holds your lessons. Each class is a group of students that gets assignments.</p>
        </div>
        {!adding && (
          <button className="btn" onClick={() => setAdding(true)}>
            New course
          </button>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>

      {adding && (
        <form className="card narrow" onSubmit={addCourse}>
          <h2>New course</h2>
          <Field label="Course title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextArea label="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="row">
            <button className="btn">Create course</button>
            <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {courses.length === 0 && !adding && (
        <p className="empty">Start by creating a course, then add lessons and a class.</p>
      )}

      <ul className="stack">
        {courses.map((c) => (
          <li key={c.id} className="card">
            <div className="assignment__head">
              <div>
                <h2 className="assignment__title">{c.title}</h2>
                {c.description && <p className="muted">{c.description}</p>}
              </div>
              <Link className="btn btn--ghost btn--small" to={`/teach/courses/${c.id}`}>
                Lessons ({c.lessons[0]?.count ?? 0})
              </Link>
            </div>
            <h3 className="subhead">Classes</h3>
            {c.classes.length === 0 ? (
              <p className="muted">No classes yet.</p>
            ) : (
              <ul className="lessons">
                {c.classes.map((k) => (
                  <li key={k.id}>
                    <Link className="lessonrow" to={`/teach/classes/${k.id}`}>
                      <span className="lessonrow__title">
                        {k.name}
                        {k.archived && <span className="badge badge--not_started">Archived</span>}
                      </span>
                      <span className="lessonrow__meta">
                        {k.enrollments[0]?.count ?? 0} students · code <code>{formatJoinCode(k.join_code)}</code>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <NewClass courseId={c.id} onCreated={(id) => navigate(`/teach/classes/${id}`)} onError={setError} />
          </li>
        ))}
      </ul>
      {courses.length > 0 && (
        <p className="muted small">
          <button className="linkish" onClick={() => setReload((n) => n + 1)}>
            Refresh
          </button>
        </p>
      )}
    </div>
  )
}

function NewClass({ courseId, onCreated, onError }: { courseId: string; onCreated: (id: string) => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    // join_code is generated by the database.
    const { data, error } = await supabase
      .from('classes')
      .insert({ course_id: courseId, name: name.trim() })
      .select('id')
      .single()
    if (error) return onError(errorMessage(error))
    onCreated(data.id)
  }

  if (!open)
    return (
      <button className="linkish add" onClick={() => setOpen(true)}>
        + New class
      </button>
    )
  return (
    <form className="inline-form" onSubmit={submit}>
      <Field label="Class name" placeholder="e.g. Period 2, Spring" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn btn--small">Create class</button>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  )
}
