import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { DateTab } from '../../components/Notebook'
import { Crumbs, ErrorNote, Field, Loading } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { dayPhrase, formatDue, formatJoinCode, formatRelative, formatShort } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import { exportClassCsv } from '../../lib/teacherData'
import { studentPath, loadOverview, prepFor, studentSummary, urgency, type Overview } from '../../lib/teacherOverview'
import { NotOpenedList, PrepBar } from './parts'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export function ClassPage() {
  const { classId = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<Overview | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const cls = data?.classes[0]
  usePageTitle(cls?.name ?? 'Class')

  const load = useCallback(async () => {
    try {
      const d = await loadOverview({ classId })
      if (!d.classes[0]) throw new Error('Class not found.')
      setData(d)
      setLoadedAt(Date.now())
      setName(d.classes[0].name)
    } catch (e) {
      setError(errorMessage(e))
    }
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

  if (!data || !cls) return <div className="page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Loading class" />}</div>

  const upcoming = cls.assignments.filter((a) => new Date(a.due_at).getTime() >= loadedAt)
  const past = cls.assignments.filter((a) => new Date(a.due_at).getTime() < loadedAt).reverse()
  const rows = cls.students.map((s) => ({ s, sum: studentSummary(s, cls, data.progress, data.notes, loadedAt) }))

  return (
    <div className="page teach">
      <Crumbs items={[{ label: 'Classes', to: '/teach/classes' }, { label: cls.name }]} />
      <header className="pagehead pagehead--row">
        <div>
          <p className="eyebrow">
            <Link to={`/teach/courses/${cls.courseId}`}>{cls.courseTitle}</Link>
            {cls.archived && ' · archived'}
          </p>
          <h1>{cls.name}</h1>
          <p className="muted">
            {cls.students.length} {cls.students.length === 1 ? 'student' : 'students'} · join code{' '}
            <code className="joincode--inline">{formatJoinCode(cls.joinCode)}</code>
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigate(`/teach/classes/${cls.id}/assignments/new`)}>
            New assignment
          </button>
        </div>
      </header>
      <ErrorNote>{error}</ErrorNote>

      <section className="section" aria-labelledby="as-h">
        <h2 id="as-h" className="rulehead">
          Assignments
        </h2>
        {cls.assignments.length === 0 ? (
          <p className="nothing">No assignments yet. Pick a few lessons with “New assignment”.</p>
        ) : (
          <>
            {upcoming.length === 0 && <p className="muted">Nothing coming up.</p>}
            <ol className="agenda">
              {upcoming.map((a) => {
                const prep = prepFor(a, cls.students, data.progress)
                return (
                  <li key={a.id} className="agenda__item">
                    <DateTab iso={a.due_at} urgent={urgency(a.due_at, loadedAt) === 'urgent'} />
                    <div className="agenda__body">
                      <h3 className="agenda__title">
                        <Link to={`/teach/assignments/${a.id}`}>{a.title}</Link>
                      </h3>
                      <p className="agenda__due">
                        Due <time dateTime={a.due_at}>{dayPhrase(a.due_at, new Date(loadedAt))}</time>
                        <span className="muted">
                          {' '}
                          · {a.lessons.length}{' '}
                          {a.lessons.length === 1 ? 'lesson' : 'lessons'} ·{' '}
                          <Link to={`/teach/assignments/${a.id}/edit`}>Edit</Link>
                        </span>
                      </p>
                      {cls.students.length > 0 && (
                        <>
                          <PrepBar prep={prep} />
                          <NotOpenedList prep={prep} classId={cls.id} level={urgency(a.due_at, loadedAt)} />
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
            {past.length > 0 && (
              <details className="earlier">
                <summary>Earlier assignments ({past.length})</summary>
                <ul className="rowlist rowlist--tight">
                  {past.map((a) => {
                    const prep = prepFor(a, cls.students, data.progress)
                    return (
                      <li key={a.id}>
                        <Link className="rowlist__row" to={`/teach/assignments/${a.id}`}>
                          <span className="rowlist__main">
                            <span className="rowlist__title">{a.title}</span>
                            <span className="rowlist__sub">{formatDue(a.due_at)}</span>
                          </span>
                          <span className="rowlist__side">
                            <span className="rowlist__strong">
                              {prep.ready.length}/{cls.students.length} finished
                            </span>
                          </span>
                          <span className="rowlist__go" aria-hidden="true">
                            →
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      <section className="section" aria-labelledby="st-h">
        <h2 id="st-h" className="rulehead">
          Students
          <button className="linkish rulehead__end" onClick={() => void exportCsv()} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </h2>
        {rows.length === 0 ? (
          <p className="nothing">
            Nobody has joined yet. Share the join code <code>{formatJoinCode(cls.joinCode)}</code>.
          </p>
        ) : (
          <div className="tablewrap tablewrap--flat" tabIndex={0} role="region" aria-label="Students, scrolls sideways">
            <table className="roster roster--progress">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Lessons done</th>
                  <th scope="col">Not done before class</th>
                  <th scope="col">Last active</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, sum }) => (
                  <tr key={s.id}>
                    <th scope="row">
                      <Link to={studentPath(cls.id, s.id)}>{s.name}</Link>
                      <span className="email">{s.email}</span>
                    </th>
                    <td>
                      <span className="minibar" aria-hidden="true">
                        <span style={{ width: `${sum.assigned ? (sum.done / sum.assigned) * 100 : 0}%` }} />
                      </span>
                      {sum.done} of {sum.assigned}
                    </td>
                    <td className={sum.missed ? 'cell cell--missed' : 'cell muted'}>{sum.missed}</td>
                    <td className="cell">
                      {sum.lastActive ? (
                        <time dateTime={sum.lastActive} title={formatShort(sum.lastActive)}>
                          {formatRelative(sum.lastActive, loadedAt)}
                        </time>
                      ) : (
                        <span className="muted">never</span>
                      )}
                    </td>
                    <td className="cell">{sum.notes || <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <p className="legend muted small">
            <strong>Not done before class</strong> counts lessons that weren’t finished by the time class started,
            including ones finished late. Select a name to see every lesson, quiz score and note, or to remove the student
            from this class.
          </p>
        )}
      </section>

      <section className="section settings" aria-labelledby="set-h">
        <h2 id="set-h" className="rulehead">
          Join code &amp; settings
        </h2>
        {cls.archived ? (
          <p>This class is archived, so the code doesn’t accept new students.</p>
        ) : (
          <p className="muted">Students enter this when they sign up, or under “Join another class” in their menu.</p>
        )}
        <p className="joincode" aria-label={`Join code ${cls.joinCode.split('').join(' ')}`}>
          {formatJoinCode(cls.joinCode)}
        </p>
        {renaming && (
          <form className="inline-form" onSubmit={rename}>
            <Field label="Class name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn btn--small">Save</button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setRenaming(false)}>
              Cancel
            </button>
          </form>
        )}
        <div className="row">
          <button
            className="btn btn--small"
            onClick={() => {
              void navigator.clipboard.writeText(formatJoinCode(cls.joinCode)).then(() => setCopied(true))
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
          <button className="btn btn--ghost btn--small" onClick={() => setRenaming(true)}>
            Rename class
          </button>
          <button className="btn btn--ghost btn--small" onClick={() => void update({ archived: !cls.archived })}>
            {cls.archived ? 'Unarchive class' : 'Archive class'}
          </button>
          <span role="status" className="ok">
            {copied && 'Copied'}
          </span>
        </div>
      </section>
    </div>
  )
}
