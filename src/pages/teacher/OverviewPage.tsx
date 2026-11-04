import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorNote, Field, Loading } from '../../components/ui'
import { dayPhrase, formatDueCompact, formatJoinCode, formatMinutes, formatRelative, formatShort, pctRound } from '../../lib/format'
import { usePageTitle } from '../../lib/pageTitle'
import { errorMessage, supabase } from '../../lib/supabase'
import { exportClassCsv } from '../../lib/teacherData'
import {
  cellDetail,
  cellKind,
  classesForNote,
  classPath,
  loadClassQuiz,
  loadOverview,
  needsAttention,
  prepFor,
  progressKey,
  rowStats,
  unassignedLessons,
  type ClassQuiz,
  type OvAssignment,
  type OvClass,
  type OvLesson,
  type OvNote,
  type OvStudent,
  type Overview,
  type RowStats,
} from '../../lib/teacherOverview'
import { useNoteActions } from '../../lib/useNoteActions'
import { Kpi, NoteActionStatus, NoteItem, NotOpenedList, PrepBar, StatusChip } from './parts'
import { StudentDrawer } from './StudentDrawer'

const LAST_CLASS = 'chalkline:teach:class'
const STALE_MS = 60_000

type Filter = 'all' | 'attention' | 'inactive'
type SortKey = 'name' | 'progress' | 'missed' | 'quiz' | 'active' | 'notes'
type Row = { s: OvStudent; r: RowStats }

function storedClass(): string | null {
  try {
    return localStorage.getItem(LAST_CLASS)
  } catch {
    return null
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/**
 * The teacher's one screen: pick a class, see every student × every assigned lesson, who needs
 * attention, what's due next and what confused them. A student's details open in a side panel.
 */
export function OverviewPage() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<Overview | null>(null)
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([])
  const [loadedAt, setLoadedAt] = useState(0)
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [quiz, setQuiz] = useState<{ key: string; data: ClassQuiz } | null>(null)
  // Notes handled here stay listed (with Reopen) until the next load.
  const [handledHere, setHandledHere] = useState<Set<number>>(new Set())
  const refresh = useCallback(() => setReload((n) => n + 1), [])

  useEffect(() => {
    let active = true
    setRefreshing(true)
    Promise.all([
      loadOverview({ notesLimit: 1000 }),
      supabase
        .from('courses')
        .select('id, title')
        .order('created_at')
        .then(({ data, error }) => {
          if (error) throw error
          return data
        }),
    ])
      .then(([d, c]) => {
        if (!active) return
        setData(d)
        setCourses(c)
        setLoadedAt(Date.now())
        setHandledHere(new Set())
        setError('')
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setRefreshing(false))
    return () => {
      active = false
    }
  }, [reload])

  // Coming back to the tab after a while: fetch fresh numbers.
  const loadedRef = useRef(0)
  useEffect(() => {
    loadedRef.current = loadedAt
  }, [loadedAt])
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible' && loadedRef.current && Date.now() - loadedRef.current > STALE_MS) refresh()
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [refresh])

  const classes = useMemo(() => data?.classes ?? [], [data])
  const wanted = params.get('class') ?? storedClass()
  const cls = classes.find((c) => c.id === wanted) ?? classes.find((c) => !c.archived) ?? classes[0]
  usePageTitle(cls ? `${cls.name} · Overview` : 'Overview')

  useEffect(() => {
    if (!cls) return
    try {
      localStorage.setItem(LAST_CLASS, cls.id)
    } catch {
      // only a convenience
    }
  }, [cls])

  // Quiz results for the open class, loaded after the grid so it shows at once.
  const quizKey = cls ? `${cls.id}:${loadedAt}` : ''
  useEffect(() => {
    if (!cls) return
    let active = true
    const lessonIds = [...new Set(cls.assignments.flatMap((a) => a.lessons.map((l) => l.id)))]
    loadClassQuiz(
      lessonIds,
      cls.students.map((s) => s.id),
    )
      .then((q) => active && setQuiz({ key: `${cls.id}:${loadedRef.current}`, data: q }))
      .catch((e) => active && setError(errorMessage(e)))
    return () => {
      active = false
    }
  }, [cls])
  const classQuiz = quiz?.key === quizKey ? quiz.data : undefined

  const updateNotes = useCallback((fn: (n: OvNote[]) => OvNote[]) => setData((d) => d && { ...d, notes: fn(d.notes) }), [])
  const actions = useNoteActions(updateNotes)
  const onHandle = useCallback(
    (n: OvNote, handled: boolean) => {
      setHandledHere((s) => new Set(s).add(n.id))
      actions.toggle(n, handled)
    },
    [actions],
  )

  if (!data) {
    return <div className="t-page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Loading your classes" />}</div>
  }

  const setParam = (key: string, value: string | null, push = false) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (cls && !next.get('class')) next.set('class', cls.id)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: !push },
    )

  if (!cls) {
    return (
      <div className="t-page">
        <header className="t-head">
          <div>
            <h1>Overview</h1>
            <p className="t-head__meta">Your classes, their progress and their questions, in one place.</p>
          </div>
        </header>
        <ErrorNote>{error}</ErrorNote>
        <GettingStarted courses={courses} onCreated={(id) => { setParams({ class: id }); refresh() }} />
      </div>
    )
  }

  const student = cls.students.find((s) => s.id === params.get('student'))
  const classNotes = data.notes.filter((n) => classesForNote(n, [cls]).length > 0)

  return (
    <div className="t-page">
      <ClassTabs
        classes={classes}
        current={cls}
        progress={data.progress}
        now={loadedAt}
        courses={courses}
        onCreated={(id) => {
          setParams({ class: id })
          refresh()
        }}
      />

      <ClassView
        key={cls.id}
        cls={cls}
        data={data}
        classNotes={classNotes}
        quiz={classQuiz}
        now={loadedAt}
        refreshing={refreshing}
        error={error}
        onRefresh={refresh}
        view={params.get('view') ?? 'all'}
        onView={(v) => setParam('view', v === 'all' ? null : v)}
        selectedId={student?.id}
        handledHere={handledHere}
        onHandle={onHandle}
        noteStatus={<NoteActionStatus status={actions.status} error={actions.error} />}
      />

      {student && (
        <StudentDrawer
          cls={cls}
          student={student}
          progress={data.progress}
          notes={classNotes}
          quiz={classQuiz?.get(student.id)}
          now={loadedAt}
          onClose={() => setParam('student', null)}
          onHandle={onHandle}
          onRemoved={() => {
            setParam('student', null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Class switcher
// ---------------------------------------------------------------------------

function ClassTabs({
  classes,
  current,
  progress,
  now,
  courses,
  onCreated,
}: {
  classes: OvClass[]
  current: OvClass
  progress: Overview['progress']
  now: number
  courses: { id: string; title: string }[]
  onCreated: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const archivedId = useId()
  const active = classes.filter((c) => !c.archived || c.id === current.id)
  const archived = classes.filter((c) => c.archived && c.id !== current.id)
  const [, setParams] = useSearchParams()

  return (
    <div className="t-classbar">
      <nav aria-label="Classes" className="t-classtabs">
        {active.map((c) => {
          const next = c.assignments.find((a) => new Date(a.due_at).getTime() >= now)
          const prep = next ? prepFor(next, c.students, progress) : null
          return (
            <Link
              key={c.id}
              to={classPath(c.id)}
              className="t-classtab"
              aria-current={c.id === current.id ? 'page' : undefined}
            >
              <span className="t-classtab__name">{c.name}</span>
              <span className="t-classtab__meta">
                {c.archived
                  ? 'archived'
                  : prep && c.students.length
                    ? `${prep.ready.length}/${c.students.length} ready`
                    : `${c.students.length} ${c.students.length === 1 ? 'student' : 'students'}`}
              </span>
            </Link>
          )
        })}
      </nav>
      <div className="t-classbar__end">
        {archived.length > 0 && (
          <>
            <label htmlFor={archivedId} className="visually-hidden">
              Open an archived class
            </label>
            <select
              id={archivedId}
              className="t-select"
              value=""
              onChange={(e) => e.target.value && setParams({ class: e.target.value })}
            >
              <option value="">Archived ({archived.length})</option>
              {archived.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="button" className="btn btn--ghost btn--small" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          + New class
        </button>
      </div>
      {adding && <NewClassForm courses={courses} onCancel={() => setAdding(false)} onCreated={(id) => { setAdding(false); onCreated(id) }} />}
    </div>
  )
}

function NewClassForm({
  courses,
  onCreated,
  onCancel,
}: {
  courses: { id: string; title: string }[]
  onCreated: (id: string) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState('')
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const selectId = useId()

  if (courses.length === 0)
    return (
      <p className="t-callout">
        A class takes its lessons from a course. <Link to="/teach/courses">Create a course first</Link>.
      </p>
    )

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    // join_code is generated by the database.
    const { data, error } = await supabase.from('classes').insert({ course_id: courseId, name: name.trim() }).select('id').single()
    setBusy(false)
    if (error) return setError(errorMessage(error))
    onCreated(data.id)
  }

  return (
    <form className="t-inlineform" onSubmit={submit}>
      <Field label="Class name" placeholder="e.g. Period 2, Spring" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="field">
        <label htmlFor={selectId}>Lessons from course</label>
        <select id={selectId} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      <button className="btn btn--small" disabled={busy}>
        Create class
      </button>
      {onCancel && (
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>
          Cancel
        </button>
      )}
      <ErrorNote>{error}</ErrorNote>
    </form>
  )
}

function GettingStarted({ courses, onCreated }: { courses: { id: string; title: string }[]; onCreated: (id: string) => void }) {
  return (
    <section className="t-card t-card--pad" aria-labelledby="gs-h">
      <h2 id="gs-h" className="t-card__title">
        Get started
      </h2>
      <ol className="t-steps">
        <li className={courses.length ? 'is-done' : undefined}>
          <strong>Add lessons.</strong> Create a course and paste YouTube links. <Link to="/teach/courses">Go to Lessons</Link>
        </li>
        <li>
          <strong>Create a class.</strong> Each class gets its own join code for students.
        </li>
        <li>
          <strong>Assign lessons</strong> with a due time (the start of class). Students only see lessons that are in an
          assignment.
        </li>
        <li>
          <strong>Track progress here:</strong> who watched what, quiz results and questions, per student.
        </li>
      </ol>
      <h3 className="t-subhead">Create your first class</h3>
      <NewClassForm courses={courses} onCreated={onCreated} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// One class
// ---------------------------------------------------------------------------

function ClassView({
  cls,
  data,
  classNotes,
  quiz,
  now,
  refreshing,
  error: loadError,
  onRefresh,
  view,
  onView,
  selectedId,
  handledHere,
  onHandle,
  noteStatus,
}: {
  cls: OvClass
  data: Overview
  classNotes: OvNote[]
  quiz: ClassQuiz | undefined
  now: number
  refreshing: boolean
  error: string
  onRefresh: () => void
  view: string
  onView: (v: string) => void
  selectedId?: string
  handledHere: Set<number>
  onHandle: (n: OvNote, handled: boolean) => void
  noteStatus: ReactNode
}) {
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [settings, setSettings] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const ids = { search: useId(), view: useId() }

  const upcoming = cls.assignments.filter((a) => new Date(a.due_at).getTime() >= now)
  const past = cls.assignments.filter((a) => new Date(a.due_at).getTime() < now)
  const shown: OvAssignment[] =
    view === 'upcoming' ? upcoming : view === 'past' ? past : view === 'all' ? cls.assignments : cls.assignments.filter((a) => a.id === view)
  const scope = shown.length || view === 'upcoming' || view === 'past' ? shown : cls.assignments

  const rows: Row[] = cls.students.map((s) => ({ s, r: rowStats(s.id, scope, data.progress, quiz?.get(s.id), classNotes, now) }))
  const attention = rows.filter((x) => needsAttention(x.r))
  const inactive = rows.filter((x) => !x.r.lastActive && x.r.assigned > 0)
  const q = query.trim().toLowerCase()
  const visible = (filter === 'attention' ? attention : filter === 'inactive' ? inactive : rows)
    .filter((x) => !q || x.s.name.toLowerCase().includes(q) || x.s.email.toLowerCase().includes(q))
    .sort((a, b) => sort.dir * compare(sort.key, a, b) || a.s.name.localeCompare(b.s.name))

  const total = rows.reduce((t, x) => t + x.r.assigned, 0)
  const done = rows.reduce((t, x) => t + x.r.done, 0)
  const answered = rows.reduce((t, x) => t + x.r.quiz.answered, 0)
  const right = rows.reduce((t, x) => t + x.r.quiz.right, 0)
  const openNotes = classNotes.filter((n) => !n.handledAt)
  const next = upcoming[0]
  const nextPrep = next ? prepFor(next, cls.students, data.progress) : null
  const missing = unassignedLessons(cls)

  async function update(patch: { name?: string; join_code?: string; archived?: boolean }) {
    const { error } = await supabase.from('classes').update(patch).eq('id', cls.id)
    if (error) setError(errorMessage(error))
    else onRefresh()
  }

  async function exportCsv() {
    setExporting(true)
    try {
      await exportClassCsv(cls.id)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  async function addTo(a: OvAssignment, lessons: OvLesson[]) {
    setError('')
    const { error } = await supabase
      .from('assignment_lessons')
      .insert(lessons.map((l, i) => ({ assignment_id: a.id, lesson_id: l.id, position: a.lessons.length + i })))
    if (error) return setError(errorMessage(error))
    setStatus(`Added ${lessons.length === 1 ? `“${lessons[0].title}”` : `${lessons.length} lessons`} to “${a.title}”. Students in ${cls.name} can see ${lessons.length === 1 ? 'it' : 'them'} now.`)
    onRefresh()
  }

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' || key === 'progress' || key === 'active' || key === 'quiz' ? 1 : -1 }))

  return (
    <>
      <header className="t-head">
        <div className="t-head__main">
          <h1>
            {cls.name}
            {cls.archived && <span className="t-tag">Archived</span>}
          </h1>
          <p className="t-head__meta">
            <Link to={`/teach/courses/${cls.courseId}`}>{cls.courseTitle}</Link>
            <span aria-hidden="true"> · </span>
            {cls.students.length} {cls.students.length === 1 ? 'student' : 'students'}
            <span aria-hidden="true"> · </span>
            Join code <JoinCode code={cls.joinCode} />
          </p>
        </div>
        <div className="t-head__actions">
          <span className="t-updated" aria-live="polite">
            {refreshing ? 'Updating…' : `Updated ${formatShort(new Date(now).toISOString())}`}
          </span>
          <button type="button" className="btn btn--ghost btn--small" onClick={onRefresh} disabled={refreshing}>
            Refresh
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => void exportCsv()} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button type="button" className="btn btn--ghost btn--small" aria-expanded={settings} onClick={() => setSettings((o) => !o)}>
            Class settings
          </button>
          <Link className="btn btn--small" to={`/teach/classes/${cls.id}/assignments/new`}>
            New assignment
          </Link>
        </div>
      </header>

      {settings && <ClassSettings cls={cls} onUpdate={update} onClose={() => setSettings(false)} />}
      <ErrorNote>{error || loadError}</ErrorNote>
      {status && (
        <p className="t-callout t-callout--ok" role="status">
          {status}
        </p>
      )}

      {missing.length > 0 && (
        <div className="t-callout t-callout--warn" role="note">
          <p>
            <strong>
              {missing.length === 1 ? '1 lesson isn’t' : `${missing.length} lessons aren’t`} in any assignment, so students
              in {cls.name} can’t see {missing.length === 1 ? 'it' : 'them'}:
            </strong>{' '}
            {missing.map((l, i) => (
              <span key={l.id}>
                <Link to={`/teach/lessons/${l.id}`}>{l.title}</Link>
                {i < missing.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </p>
          <p className="t-callout__actions">
            {next && (
              <button type="button" className="btn btn--small" onClick={() => void addTo(next, missing)}>
                Add to “{next.title}” (due {formatDueCompact(next.due_at)})
              </button>
            )}
            <Link
              className={next ? 'btn btn--ghost btn--small' : 'btn btn--small'}
              to={`/teach/classes/${cls.id}/assignments/new?lessons=${missing.map((l) => l.id).join(',')}`}
            >
              New assignment with {missing.length === 1 ? 'it' : 'them'}
            </Link>
          </p>
        </div>
      )}

      <dl className="t-kpis">
        <Kpi
          label="Next class"
          value={next ? formatDueCompact(next.due_at) : 'Nothing due'}
          sub={
            next && nextPrep ? (
              <>
                <Link to={`/teach/assignments/${next.id}`}>{next.title}</Link>: {nextPrep.ready.length} of {cls.students.length} ready
              </>
            ) : (
              <Link to={`/teach/classes/${cls.id}/assignments/new`}>Create an assignment</Link>
            )
          }
        />
        <Kpi label="Lessons finished" value={total ? pctRound((done / total) * 100) : '–'} sub={total ? `${done} of ${total} student-lessons` : 'Nothing assigned'} />
        <Kpi
          label="Need attention"
          value={attention.length}
          tone={attention.length ? 'bad' : 'ok'}
          sub={`${rows.filter((x) => x.r.missed).length} missed a lesson · ${rows.filter((x) => !x.r.missed && x.r.dueSoon).length} behind for next class`}
        />
        <Kpi
          label="Quiz, first try"
          value={!quiz ? '…' : answered ? pctRound((right / answered) * 100) : '–'}
          sub={quiz ? (answered ? `${right} of ${answered} answers right` : 'No answers yet') : 'Loading'}
        />
        <Kpi
          label="Open notes"
          value={openNotes.length}
          tone={openNotes.length ? 'warn' : undefined}
          sub={<Link to={`/teach/notes?class=${cls.id}`}>See all notes</Link>}
        />
      </dl>

      <div className="t-split">
        <section className="t-card" aria-labelledby="grid-h">
          <div className="t-card__head">
            <h2 id="grid-h" className="t-card__title">
              Student progress
            </h2>
            <div className="t-toolbar">
              <div className="t-seg" role="group" aria-label="Show students">
                {(
                  [
                    ['all', 'All', rows.length],
                    ['attention', 'Need attention', attention.length],
                    ['inactive', 'Never opened', inactive.length],
                  ] as const
                ).map(([id, label, n]) => (
                  <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                    {label} <span className="t-seg__n">{n}</span>
                  </button>
                ))}
              </div>
              <label htmlFor={ids.view} className="visually-hidden">
                Assignments shown
              </label>
              <select id={ids.view} className="t-select" value={view} onChange={(e) => onView(e.target.value)}>
                <option value="all">All assignments ({cls.assignments.length})</option>
                <option value="upcoming">Upcoming ({upcoming.length})</option>
                <option value="past">Past ({past.length})</option>
                {cls.assignments.length > 1 && (
                  <optgroup label="One assignment">
                    {cls.assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} · {formatDueCompact(a.due_at)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <label htmlFor={ids.search} className="visually-hidden">
                Find a student
              </label>
              <input
                id={ids.search}
                type="search"
                className="t-search"
                placeholder="Find a student"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {cls.students.length === 0 ? (
            <div className="t-empty">
              <p>
                <strong>No students yet.</strong> Share the join code <JoinCode code={cls.joinCode} />. Students enter it when
                they sign up, or under “Join another class” in their menu.
              </p>
            </div>
          ) : cls.assignments.length === 0 ? (
            <div className="t-empty">
              <p>
                <strong>Nothing assigned yet.</strong> Students only see lessons that are in an assignment.
              </p>
              <Link className="btn btn--small" to={`/teach/classes/${cls.id}/assignments/new`}>
                New assignment
              </Link>
            </div>
          ) : (
            <>
              <ProgressGrid
                cls={cls}
                assignments={scope}
                rows={visible}
                allRows={rows}
                data={data}
                now={now}
                quizReady={Boolean(quiz)}
                sort={sort}
                onSort={onSort}
                selectedId={selectedId}
              />
              {visible.length === 0 && (
                <p className="t-empty t-empty--tight">
                  {q ? `No student matches “${query.trim()}”.` : filter === 'attention' ? 'Nobody needs attention right now.' : 'Everyone has opened at least one lesson.'}
                </p>
              )}
              <Legend />
            </>
          )}
        </section>

        <aside className="t-side" aria-label="Next up and notes">
          <section className="t-card" aria-labelledby="up-h">
            <div className="t-card__head">
              <h2 id="up-h" className="t-card__title">
                Coming up
              </h2>
              <Link className="t-small" to={`/teach/classes/${cls.id}/assignments/new`}>
                + New
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="t-empty t-empty--tight">No upcoming assignments.</p>
            ) : (
              <ul className="t-uplist">
                {upcoming.slice(0, 3).map((a) => {
                  const prep = prepFor(a, cls.students, data.progress)
                  const mins = a.lessons.reduce((t, l) => t + l.duration_seconds, 0)
                  return (
                    <li key={a.id} className="t-up">
                      <p className="t-up__title">
                        <Link to={`/teach/assignments/${a.id}`}>{a.title}</Link>
                        <Link className="t-small" to={`/teach/assignments/${a.id}/edit`}>
                          Edit<span className="visually-hidden"> {a.title}</span>
                        </Link>
                      </p>
                      <p className="t-muted t-small">
                        Due {dayPhrase(a.due_at, new Date(now))} · {a.lessons.length} {a.lessons.length === 1 ? 'lesson' : 'lessons'},{' '}
                        {formatMinutes(mins)}
                      </p>
                      {cls.students.length > 0 && (
                        <>
                          <PrepBar prep={prep} compact />
                          <NotOpenedList prep={prep} classId={cls.id} />
                        </>
                      )}
                    </li>
                  )
                })}
                {upcoming.length > 3 && (
                  <li className="t-small">
                    <button type="button" className="t-linkbtn" onClick={() => onView('upcoming')}>
                      Show all {upcoming.length} in the table
                    </button>
                  </li>
                )}
              </ul>
            )}
          </section>

          <section className="t-card" aria-labelledby="notes-h">
            <div className="t-card__head">
              <h2 id="notes-h" className="t-card__title">
                Open notes <span className="t-count">{openNotes.length}</span>
              </h2>
              <Link className="t-small" to={`/teach/notes?class=${cls.id}`}>
                All notes
              </Link>
            </div>
            {noteStatus}
            <NotesList notes={classNotes} handledHere={handledHere} now={now} classId={cls.id} onHandle={onHandle} />
          </section>
        </aside>
      </div>
    </>
  )
}

function compare(key: SortKey, a: Row, b: Row): number {
  const ratio = (x: Row) => (x.r.assigned ? x.r.done / x.r.assigned : 1)
  const quiz = (x: Row) => (x.r.quiz.answered ? x.r.quiz.right / x.r.quiz.answered : -1)
  switch (key) {
    case 'name':
      return a.s.name.localeCompare(b.s.name)
    case 'progress':
      return ratio(a) - ratio(b)
    case 'missed':
      return a.r.missed - b.r.missed
    case 'quiz':
      return quiz(a) - quiz(b)
    case 'active':
      return (a.r.lastActive ?? '').localeCompare(b.r.lastActive ?? '')
    case 'notes':
      return a.r.openNotes - b.r.openNotes
  }
}

function JoinCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <span className="t-code">
      <code>{formatJoinCode(code)}</code>
      <button
        type="button"
        className="t-linkbtn"
        onClick={() => void navigator.clipboard?.writeText(formatJoinCode(code)).then(() => setCopied(true))}
      >
        {copied ? 'Copied' : 'Copy'}
        <span className="visually-hidden"> join code</span>
      </button>
    </span>
  )
}

function ClassSettings({
  cls,
  onUpdate,
  onClose,
}: {
  cls: OvClass
  onUpdate: (patch: { name?: string; join_code?: string; archived?: boolean }) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(cls.name)
  return (
    <section className="t-card t-card--pad t-settings" aria-label="Class settings">
      <form
        className="t-inlineform"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && name.trim() !== cls.name) void onUpdate({ name: name.trim() })
        }}
      >
        <Field label="Class name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn--small" disabled={!name.trim() || name.trim() === cls.name}>
          Rename
        </button>
      </form>
      <div className="t-settings__row">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => {
            if (window.confirm('Make a new join code? The current code stops working for new students. Students already in the class stay.'))
              void onUpdate({ join_code: newJoinCode() })
          }}
        >
          New join code
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => void onUpdate({ archived: !cls.archived })}>
          {cls.archived ? 'Unarchive class' : 'Archive class'}
        </button>
        <span className="t-muted t-small">
          {cls.archived ? 'Archived: the join code doesn’t accept new students.' : 'Archiving hides the class and stops its join code.'}
        </span>
        <button type="button" className="t-linkbtn t-settings__close" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

function SortHead({
  k,
  label,
  sort,
  onSort,
  className,
  rowSpan,
  title,
}: {
  k: SortKey
  label: string
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (k: SortKey) => void
  className?: string
  rowSpan?: number
  title?: string
}) {
  const on = sort.key === k
  return (
    <th scope="col" rowSpan={rowSpan} className={className} aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined} title={title}>
      <button type="button" className="t-sort" onClick={() => onSort(k)}>
        {label}
        <span className="t-sort__arrow" aria-hidden="true">
          {on ? (sort.dir === 1 ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  )
}

function ProgressGrid({
  cls,
  assignments,
  rows,
  allRows,
  data,
  now,
  quizReady,
  sort,
  onSort,
  selectedId,
}: {
  cls: OvClass
  assignments: OvAssignment[]
  rows: Row[]
  allRows: Row[]
  data: Overview
  now: number
  quizReady: boolean
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (k: SortKey) => void
  selectedId?: string
}) {
  const [params] = useSearchParams()
  const open = (studentId: string) => {
    const next = new URLSearchParams(params)
    next.set('class', cls.id)
    next.set('student', studentId)
    return `/teach?${next}`
  }
  const students = allRows.length
  const finishedBy = (a: OvAssignment, lessonId: string) =>
    allRows.filter((x) => {
      const k = cellKind(data.progress.get(progressKey(x.s.id, lessonId)), a.due_at, now)
      return k === 'done' || k === 'late'
    }).length

  return (
    <div className="t-tablewrap" tabIndex={0} role="region" aria-label={`Progress in ${cls.name}. Scrolls sideways.`}>
      <table className="t-grid">
        <thead>
          <tr className="t-grid__groups">
            <SortHead k="name" label="Student" sort={sort} onSort={onSort} rowSpan={2} className="t-grid__corner" />
            <SortHead k="progress" label="Done" sort={sort} onSort={onSort} rowSpan={2} title="Lessons finished, of those shown" />
            <SortHead k="missed" label="Missed" sort={sort} onSort={onSort} rowSpan={2} title="Not finished before class started" />
            <SortHead k="quiz" label="Quiz" sort={sort} onSort={onSort} rowSpan={2} title="Right on the first try" />
            <SortHead k="active" label="Last active" sort={sort} onSort={onSort} rowSpan={2} />
            <SortHead k="notes" label="Notes" sort={sort} onSort={onSort} rowSpan={2} className="t-grid__last" title="Open notes" />
            {assignments.map((a) => (
              <th key={a.id} scope="colgroup" colSpan={Math.max(1, a.lessons.length)} className="t-grid__group">
                <Link to={`/teach/assignments/${a.id}`} title={a.title}>
                  {a.title}
                </Link>
                <span className={new Date(a.due_at).getTime() < now ? 't-grid__due' : 't-grid__due t-grid__due--ahead'}>
                  {formatDueCompact(a.due_at)}
                </span>
              </th>
            ))}
          </tr>
          <tr className="t-grid__lessons">
            {assignments.flatMap((a) =>
              a.lessons.length === 0
                ? [
                    <th key={a.id} scope="col" className="t-grid__lesson t-gstart t-muted">
                      No lessons
                    </th>,
                  ]
                : a.lessons.map((l, i) => (
                    <th key={`${a.id}:${l.id}`} scope="col" className={i === 0 ? 't-grid__lesson t-gstart' : 't-grid__lesson'} title={l.title}>
                      <Link to={`/teach/lessons/${l.id}`}>{l.title}</Link>
                    </th>
                  )),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, r }) => (
            <tr key={s.id} className={selectedId === s.id ? 'is-selected' : undefined}>
              <th scope="row" className="t-grid__name">
                <Link to={open(s.id)} title={s.email}>
                  {s.name}
                </Link>
              </th>
              <td className="t-num t-nowrap">
                <span className="t-meter" aria-hidden="true">
                  <span style={{ width: `${r.assigned ? (r.done / r.assigned) * 100 : 0}%` }} />
                </span>
                {r.done}/{r.assigned}
              </td>
              <td className={r.missed ? 't-num t-bad' : 't-num t-muted'}>{r.missed}</td>
              <td className="t-num">
                {!quizReady ? (
                  <span className="t-muted">…</span>
                ) : r.quiz.answered ? (
                  <span
                    className={r.quiz.right / r.quiz.answered < 0.6 ? 't-bad' : undefined}
                    title={`${r.quiz.right} of ${r.quiz.answered} right on the first try`}
                  >
                    {pctRound((r.quiz.right / r.quiz.answered) * 100)}
                  </span>
                ) : (
                  <span className="t-muted">–</span>
                )}
              </td>
              <td className="t-nowrap">
                {r.lastActive ? (
                  <time dateTime={r.lastActive} title={formatShort(r.lastActive)}>
                    {formatRelative(r.lastActive, now)}
                  </time>
                ) : (
                  <span className="t-muted">never</span>
                )}
              </td>
              <td className="t-num t-grid__last">{r.openNotes ? <strong>{r.openNotes}</strong> : <span className="t-muted">0</span>}</td>
              {assignments.flatMap((a) =>
                a.lessons.length === 0
                  ? [<td key={a.id} className="t-cell t-gstart" />]
                  : a.lessons.map((l, i) => {
                      const p = data.progress.get(progressKey(s.id, l.id))
                      return (
                        <td key={`${a.id}:${l.id}`} className={i === 0 ? 't-cell t-gstart' : 't-cell'} title={cellDetail(p)}>
                          <StatusChip kind={cellKind(p, a.due_at, now)} p={p} />
                        </td>
                      )
                    }),
              )}
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <th scope="row" className="t-grid__name">
                Finished
              </th>
              <td colSpan={5} className="t-muted t-small t-grid__last">
                of {students} {students === 1 ? 'student' : 'students'}
              </td>
              {assignments.flatMap((a) =>
                a.lessons.length === 0
                  ? [<td key={a.id} className="t-cell t-gstart" />]
                  : a.lessons.map((l, i) => {
                      const n = finishedBy(a, l.id)
                      return (
                        <td key={`${a.id}:${l.id}`} className={i === 0 ? 't-cell t-gstart t-num' : 't-cell t-num'}>
                          {n}/{students}
                        </td>
                      )
                    }),
              )}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function Legend() {
  return (
    <p className="t-legend">
      <span>
        <StatusChip kind="done" /> finished before class
      </span>
      <span>
        <StatusChip kind="late" /> finished after class started
      </span>
      <span>
        <span className="t-chip t-chip--progress" aria-hidden="true">
          40%
        </span>{' '}
        watched so far
      </span>
      <span>
        <StatusChip kind="missed" /> not finished by class
      </span>
      <span>
        <StatusChip kind="soon" /> not opened, class within 3 days
      </span>
      <span>
        <StatusChip kind="todo" /> not opened
      </span>
      <span className="t-legend__note">Complete = 90% of the video’s seconds actually played. Hover a cell for times.</span>
    </p>
  )
}

function NotesList({
  notes,
  handledHere,
  now,
  classId,
  onHandle,
}: {
  notes: OvNote[]
  handledHere: Set<number>
  now: number
  classId: string
  onHandle: (n: OvNote, handled: boolean) => void
}) {
  const list = notes.filter((n) => !n.handledAt || handledHere.has(n.id))
  if (notes.length === 0) return <p className="t-empty t-empty--tight">No notes yet. Turn on the “What was confusing?” box in a lesson to get them.</p>
  if (list.length === 0) return <p className="t-empty t-empty--tight">Nothing open. Every note has been handled.</p>
  const shown = list.slice(0, 8)
  return (
    <>
      <ul className="t-notes">
        {shown.map((n) => (
          <NoteItem key={n.id} note={n} now={now} classId={classId} onHandle={onHandle} />
        ))}
      </ul>
      {list.length > shown.length && (
        <p className="t-small t-card__foot">
          <Link to={`/teach/notes?class=${classId}`}>{list.length - shown.length} more open notes</Link>
        </p>
      )}
    </>
  )
}
