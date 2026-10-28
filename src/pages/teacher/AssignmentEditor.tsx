import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ErrorNote, Field, Loading, TextArea } from '../../components/ui'
import { formatClock, formatMinutes, fromLocalInput, toLocalInput } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import { LONG_LESSON_SECONDS } from './CourseLessons'

interface LessonOption {
  id: string
  title: string
  duration_seconds: number
}

export function AssignmentEditor() {
  const params = useParams()
  const navigate = useNavigate()
  const isNew = !params.assignmentId
  const pickId = useId()

  const [classId, setClassId] = useState(params.classId ?? '')
  const [className, setClassName] = useState('')
  const [options, setOptions] = useState<LessonOption[] | null>(null)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [due, setDue] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [pick, setPick] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      let cid = params.classId ?? ''
      if (params.assignmentId) {
        const { data, error } = await supabase
          .from('assignments')
          .select('*, assignment_lessons(lesson_id, position)')
          .eq('id', params.assignmentId)
          .single()
        if (error) throw error
        cid = data.class_id
        setTitle(data.title)
        setInstructions(data.instructions)
        setDue(toLocalInput(data.due_at))
        setSelected([...data.assignment_lessons].sort((a, b) => a.position - b.position).map((x) => x.lesson_id))
      }
      const { data: cls, error } = await supabase.from('classes').select('id, name, course_id').eq('id', cid).single()
      if (error) throw error
      setClassId(cls.id)
      setClassName(cls.name)
      const { data: lessons, error: lErr } = await supabase
        .from('lessons')
        .select('id, title, duration_seconds')
        .eq('course_id', cls.course_id)
        .order('position')
      if (lErr) throw lErr
      setOptions(lessons)
    })().catch((e) => setError(errorMessage(e)))
  }, [params.assignmentId, params.classId])

  function move(i: number, delta: -1 | 1) {
    setSelected((s) => {
      const next = [...s]
      const [x] = next.splice(i, 1)
      next.splice(i + delta, 0, x)
      return next
    })
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!due) return setError('Set when the class starts.')
    if (selected.length === 0) return setError('Add at least one lesson.')
    setBusy(true)
    setError('')
    try {
      const row = { class_id: classId, title: title.trim(), instructions: instructions.trim(), due_at: fromLocalInput(due) }
      let id = params.assignmentId
      if (id) {
        const { error } = await supabase.from('assignments').update(row).eq('id', id)
        if (error) throw error
        const { error: dErr } = await supabase.from('assignment_lessons').delete().eq('assignment_id', id)
        if (dErr) throw dErr
      } else {
        const { data, error } = await supabase.from('assignments').insert(row).select('id').single()
        if (error) throw error
        id = data.id
      }
      const { error: iErr } = await supabase
        .from('assignment_lessons')
        .insert(selected.map((lesson_id, position) => ({ assignment_id: id!, lesson_id, position })))
      if (iErr) throw iErr
      navigate(`/teach/assignments/${id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!params.assignmentId) return
    if (!window.confirm('Delete this assignment? Students’ watch progress on the lessons is kept.')) return
    const { error } = await supabase.from('assignments').delete().eq('id', params.assignmentId)
    if (error) return setError(errorMessage(error))
    navigate(`/teach/classes/${classId}`)
  }

  if (!options) return <div className="page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</div>

  const byId = new Map(options.map((o) => [o.id, o]))
  const chosen = selected.map((id) => byId.get(id)).filter((x): x is LessonOption => Boolean(x))
  const remaining = options.filter((o) => !selected.includes(o.id))
  const total = chosen.reduce((t, l) => t + l.duration_seconds, 0)

  return (
    <div className="page narrow">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to={`/teach/classes/${classId}`}>← {className}</Link>
      </nav>
      <h1>{isNew ? 'New assignment' : 'Edit assignment'}</h1>
      <form onSubmit={save} className="card">
        <Field label="Title" required maxLength={200} placeholder="e.g. Before Thursday: vectors" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Field
          label="Class starts (students should finish before this)"
          type="datetime-local"
          required
          value={due}
          onChange={(e) => setDue(e.target.value)}
          hint="In your time zone. Students see it in theirs."
        />
        <TextArea label="Note to students (optional)" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />

        <fieldset className="picker">
          <legend>Lessons, in order</legend>
          {chosen.length === 0 ? (
            <p className="muted">No lessons yet.</p>
          ) : (
            <ol className="editlist">
              {chosen.map((l, i) => (
                <li key={l.id} className="editlist__row">
                  <span className="lessonrow__num" aria-hidden="true">{i + 1}</span>
                  <div className="editlist__main">
                    {l.title}
                    <span className="muted small"> · {formatClock(l.duration_seconds)}</span>
                    {l.duration_seconds > LONG_LESSON_SECONDS && <span className="tag tag--warn">over 10 min</span>}
                  </div>
                  <div className="reorder">
                    <button type="button" className="iconbtn" disabled={i === 0} aria-label={`Move “${l.title}” up`} onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      disabled={i === chosen.length - 1}
                      aria-label={`Move “${l.title}” down`}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`Remove “${l.title}”`}
                      onClick={() => setSelected((s) => s.filter((x) => x !== l.id))}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {remaining.length > 0 ? (
            <div className="inline-form">
              <div className="field">
                <label htmlFor={pickId}>Add a lesson</label>
                <select id={pickId} value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Choose…</option>
                  {remaining.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title} ({formatClock(o.duration_seconds)})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={!pick}
                onClick={() => {
                  setSelected((s) => [...s, pick])
                  setPick('')
                }}
              >
                Add
              </button>
            </div>
          ) : (
            options.length === 0 && <p className="muted">This course has no lessons yet. Create lessons first.</p>
          )}
          {chosen.length > 0 && <p className="muted small">Total: about {formatMinutes(total)}</p>}
        </fieldset>

        <ErrorNote>{error}</ErrorNote>
        <div className="row">
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save assignment'}
          </button>
          {!isNew && (
            <button type="button" className="btn btn--ghost danger" onClick={() => void remove()}>
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
