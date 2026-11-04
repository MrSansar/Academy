import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ClassMark } from '../../components/Notebook'
import { Crumbs, ErrorNote, Field, Loading, TextArea } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { errorMessage, supabase } from '../../lib/supabase'

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

  if (!courses) return <div className="page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Loading courses" />}</div>

  return (
    <div className="page teach">
      <Crumbs items={[{ label: 'Dashboard', to: '/teach' }, { label: 'Courses' }]} />
      <header className="pagehead">
        <h1>Courses</h1>
        <p className="muted">Each course holds a set of lessons (your videos). A class takes its lessons from one course.</p>
      </header>
      <ErrorNote>{error}</ErrorNote>

      {adding ? (
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
      ) : (
        <p className="pagehead__actions">
          <button className="btn" onClick={() => setAdding(true)}>
            New course
          </button>
        </p>
      )}

      {courses.length === 0 && !adding && <p className="nothing">No courses yet. Make one, then add lessons with YouTube links.</p>}

      <ul className="rowlist">
        {courses.map((c) => {
          const n = c.lessons[0]?.count ?? 0
          const used = c.classes.filter((k) => !k.archived)
          return (
            <li key={c.id}>
              <Link to={`/teach/courses/${c.id}`} className="rowlist__row">
                <span className="rowlist__main">
                  <span className="rowlist__title">{c.title}</span>
                  <span className="rowlist__sub">
                    {n} {n === 1 ? 'lesson' : 'lessons'}
                    {c.description && ` · ${c.description}`}
                  </span>
                </span>
                <span className="rowlist__side">
                  {used.length === 0 ? (
                    <span className="muted">Not used by a class yet</span>
                  ) : (
                    <>
                      Used by{' '}
                      {used.map((k) => (
                        <ClassMark key={k.id} id={k.id} name={k.name} />
                      ))}
                    </>
                  )}
                </span>
                <span className="rowlist__go" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
