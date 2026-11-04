import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ErrorNote, Field, Loading, TextArea } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { errorMessage, supabase } from '../../lib/supabase'
import { classPath } from '../../lib/teacherOverview'

interface CourseRow {
  id: string
  title: string
  description: string
  lessons: { count: number }[]
  classes: { id: string; name: string; archived: boolean }[]
}

/** The lesson library: courses hold lessons, and classes take their lessons from a course. */
export function CoursesPage() {
  usePageTitle('Courses')
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CourseRow[] | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    supabase
      .from('courses')
      .select('id, title, description, lessons(count), classes(id, name, archived)')
      .order('created_at')
      .then(({ data, error }) => {
        if (error) setError(errorMessage(error))
        else setCourses(data as CourseRow[])
      })
  }, [])

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

  if (!courses) return <div className="t-page t-page--narrow">{error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Loading courses" />}</div>

  return (
    <div className="t-page t-page--narrow">
      <header className="t-head">
        <div className="t-head__main">
          <h1>Lessons</h1>
          <p className="t-head__meta">
            Lessons (your videos) live in courses. A class takes its lessons from one course; students see a lesson once
            it’s in an assignment.
          </p>
        </div>
        {!adding && (
          <div className="t-head__actions">
            <button className="btn btn--small" onClick={() => setAdding(true)}>
              New course
            </button>
          </div>
        )}
      </header>
      <ErrorNote>{error}</ErrorNote>

      {adding && (
        <form className="t-card t-card--pad" onSubmit={addCourse}>
          <h2 className="t-card__title" style={{ marginBottom: '0.6rem' }}>
            New course
          </h2>
          <Field label="Course title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <TextArea label="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="row">
            <button className="btn btn--small">Create course</button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {courses.length === 0 && !adding ? (
        <p className="t-callout">No courses yet. Make one, then add lessons with YouTube links.</p>
      ) : (
        courses.length > 0 && (
          <div className="t-card">
            <table className="t-table">
              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col">Lessons</th>
                  <th scope="col">Used by</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const n = c.lessons[0]?.count ?? 0
                  const used = c.classes.filter((k) => !k.archived)
                  return (
                    <tr key={c.id}>
                      <td className="t-strong">
                        <Link to={`/teach/courses/${c.id}`}>{c.title}</Link>
                        {c.description && <div className="t-muted t-small">{c.description}</div>}
                      </td>
                      <td className="t-num" style={{ textAlign: 'left' }}>
                        {n}
                      </td>
                      <td>
                        {used.length === 0 ? (
                          <span className="t-muted">No class yet</span>
                        ) : (
                          used.map((k, i) => (
                            <span key={k.id}>
                              <Link to={classPath(k.id)}>{k.name}</Link>
                              {i < used.length - 1 ? ', ' : ''}
                            </span>
                          ))
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
