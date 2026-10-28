import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ErrorNote, Field, Loading } from '../../components/ui'
import { formatDue, formatJoinCode, formatRelative, formatShort } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import { exportClassCsv } from '../../lib/teacherData'

interface ClassData {
  id: string
  name: string
  join_code: string
  archived: boolean
  course_id: string
  courses: { title: string } | null
  enrollments: { student_id: string; joined_at: string; profiles: { full_name: string; email: string } | null }[]
  assignments: { id: string; title: string; due_at: string; assignment_lessons: { count: number }[] }[]
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export function ClassPage() {
  const { classId = '' } = useParams()
  const navigate = useNavigate()
  const [cls, setCls] = useState<ClassData | null>(null)
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('classes')
      .select(
        'id, name, join_code, archived, course_id, courses(title), enrollments(student_id, joined_at, profiles(full_name, email)), assignments(id, title, due_at, assignment_lessons(count))',
      )
      .eq('id', classId)
      .single()
    if (error) return setError(errorMessage(error))
    setCls(data as ClassData)
    setName(data.name)
  }, [classId])

  useEffect(() => {
    void load()
  }, [load])

  async function update(patch: { name?: string; join_code?: string; archived?: boolean }) {
    const { error } = await supabase.from('classes').update(patch).eq('id', classId)
    if (error) setError(errorMessage(error))
    else await load()
  }

  async function rename(e: FormEvent) {
    e.preventDefault()
    await update({ name: name.trim() })
    setRenaming(false)
  }

  async function removeStudent(id: string, who: string) {
    if (!window.confirm(`Remove ${who} from this class? Their watch history is kept and returns if they rejoin.`)) return
    const { error } = await supabase.from('enrollments').delete().eq('class_id', classId).eq('student_id', id)
    if (error) setError(errorMessage(error))
    else await load()
  }

  async function exportCsv() {
    setExporting(true)
    try {
      await exportClassCsv(classId)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  if (!cls) return <div className="page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</div>

  const students = [...cls.enrollments].sort((a, b) =>
    (a.profiles?.full_name ?? '').localeCompare(b.profiles?.full_name ?? ''),
  )
  const assignments = [...cls.assignments].sort((a, b) => a.due_at.localeCompare(b.due_at))
  const now = Date.now()

  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to="/teach">← Classes &amp; courses</Link>
      </nav>
      {renaming ? (
        <form className="inline-form" onSubmit={rename}>
          <Field label="Class name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn--small">Save</button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setRenaming(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="lede lede--row">
          <div>
            <p className="eyebrow">{cls.courses?.title}</p>
            <h1>{cls.name}</h1>
          </div>
          <div className="row">
            <button className="btn btn--ghost btn--small" onClick={() => setRenaming(true)}>
              Rename
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => void exportCsv()} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export class progress (CSV)'}
            </button>
          </div>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>

      <section className="card joincard" aria-labelledby="code-h">
        <h2 id="code-h" className="subhead">Join code</h2>
        {cls.archived ? (
          <p>This class is archived, so the code doesn’t accept new students.</p>
        ) : (
          <p className="muted">Students enter this when they sign up, or under “Join a class”.</p>
        )}
        <p className="joincode" aria-label={`Join code ${cls.join_code.split('').join(' ')}`}>
          {formatJoinCode(cls.join_code)}
        </p>
        <div className="row">
          <button
            className="btn btn--small"
            onClick={() => {
              void navigator.clipboard.writeText(formatJoinCode(cls.join_code)).then(() => setCopied(true))
            }}
          >
            Copy code
          </button>
          <button
            className="btn btn--ghost btn--small"
            onClick={() => {
              if (window.confirm('Make a new code? The current code will stop working for new students.'))
                void update({ join_code: newJoinCode() })
            }}
          >
            New code
          </button>
          <button className="btn btn--ghost btn--small" onClick={() => void update({ archived: !cls.archived })}>
            {cls.archived ? 'Unarchive class' : 'Archive class'}
          </button>
          <span role="status" className="ok">{copied && 'Copied'}</span>
        </div>
      </section>

      <section className="section" aria-labelledby="as-h">
        <div className="lede lede--row">
          <h2 id="as-h" className="subhead">Assignments</h2>
          <button className="btn btn--small" onClick={() => navigate(`/teach/classes/${cls.id}/assignments/new`)}>
            New assignment
          </button>
        </div>
        {assignments.length === 0 ? (
          <p className="empty">No assignments yet.</p>
        ) : (
          <ul className="card lessons">
            {assignments.map((a) => (
              <li key={a.id} className="lessonrow lessonrow--static">
                <span className="lessonrow__title">
                  <Link to={`/teach/assignments/${a.id}`}>{a.title}</Link>
                </span>
                <span className="lessonrow__meta">
                  {formatDue(a.due_at)} · {new Date(a.due_at).getTime() < now ? 'past' : formatRelative(a.due_at)} ·{' '}
                  {a.assignment_lessons[0]?.count ?? 0} lessons
                </span>
                <Link className="btn btn--ghost btn--small" to={`/teach/assignments/${a.id}/edit`}>
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="st-h">
        <h2 id="st-h" className="subhead">Students ({students.length})</h2>
        {students.length === 0 ? (
          <p className="empty">Nobody has joined yet.</p>
        ) : (
          <div className="tablewrap" tabIndex={0} role="region" aria-label="Students">
            <table className="roster">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Joined</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {students.map((e) => (
                  <tr key={e.student_id}>
                    <th scope="row">{e.profiles?.full_name || '(no name)'}</th>
                    <td>{e.profiles?.email}</td>
                    <td>{formatShort(e.joined_at)}</td>
                    <td>
                      <button
                        className="linkish danger"
                        onClick={() => void removeStudent(e.student_id, e.profiles?.full_name || 'this student')}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
