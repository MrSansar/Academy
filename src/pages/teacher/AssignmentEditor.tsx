import { useEffect, useId, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Crumbs, ErrorNote, Field, Loading, TextArea } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { formatClock, formatMinutes, fromLocalInput, toLocalInput } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import { classPath } from '../../lib/teacherOverview'
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
  const [search] = useSearchParams()
  // "New assignment with these lessons" links pass ?lessons=a,b
  const preset = search.get('lessons')

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
  usePageTitle(isNew ? 'New assignment' : 'Edit assignment')

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
      if (!params.assignmentId && preset) {
        const known = new Set(lessons.map((l) => l.id))
        setSelected(preset.split(',').filter((id) => known.has(id)))
      }
    })().catch((e) => setError(errorMessage(e)))
  }, [params.assignmentId, params.classId, preset])

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
      navigate(classPath(classId))
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
    navigate(classPath(classId))
  }

  if (!options) return <div className="t-page t-page--narrow">{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</div>

  const byId = new Map(options.map((o) => [o.id, o]))
  const chosen = selected.map((id) => byId.get(id)).filter((x): x is LessonOption => Boolean(x))
  const remaining = options.filter((o) => !selected.includes(o.id))
  const total = chosen.reduce((t, l) => t + l.duration_seconds, 0)

  return (
    <div className="t-page t-page--narrow">
      <Crumbs
        items={[
          { label: 'Overview', to: '/teach' },
          { label: className || 'Class', to: classPath(classId) },
          ...(isNew
            ? [{ label: 'New assignment' }]
            : [{ label: title || 'Assignment', to: `/teach/assignments/${params.assignmentId}` }, { label: 'Edit' }]),
        ]}
      />
      <header className="t-head">
        <div className="t-head__main">
          <h1>{isNew ? 'New assignment' : 'Edit assignment'}</h1>
          <p className="t-head__meta">
            For {className}. Students in this class see these lessons as soon as you save.
          </p>
        </div>
      </header>
      <form onSubmit={save} className="t-card t-card--pad">
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

        <fieldset className="t-fieldset">
          <legend>Lessons, in order</legend>
          {chosen.length === 0 ? (
            <p className="t-muted t-small">No lessons yet. Add at least one.</p>
          ) : (
            <table className="t-table t-table--boxed">
              <tbody>
                {chosen.map((l, i) => (
                  <tr key={l.id}>
                    <td className="t-ord">{i + 1}</td>
                    <td className="t-strong">
                      {l.title}
                      {l.duration_seconds > LONG_LESSON_SECONDS && <span className="t-tag t-tag--warn">over 10 min</span>}
                    </td>
                    <td className="t-num t-muted">{formatClock(l.duration_seconds)}</td>
                    <td className="t-table__actions">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {remaining.length > 0 ? (
            <div className="t-inlineform">
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
              <button
                type="button"
                className="t-linkbtn t-small"
                onClick={() => setSelected((s) => [...s, ...remaining.map((o) => o.id)])}
              >
                Add all {remaining.length}
              </button>
            </div>
          ) : (
            options.length === 0 && <p className="t-muted">This course has no lessons yet. Create lessons first.</p>
          )}
          {chosen.length > 0 && <p className="t-muted t-small">Total: about {formatMinutes(total)}</p>}
        </fieldset>

        <ErrorNote>{error}</ErrorNote>
        <div className="row">
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save assignment'}
          </button>
          {!isNew && (
            <button type="button" className="btn btn--ghost t-btn-danger" onClick={() => void remove()}>
              Delete assignment
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
