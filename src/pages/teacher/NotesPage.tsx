import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { Crumbs, ErrorNote, Loading } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { errorMessage } from '../../lib/supabase'
import { classesForNote, loadOverview, type OvNote, type Overview } from '../../lib/teacherOverview'
import { useNoteActions } from '../../lib/useNoteActions'
import { NoteActionStatus, NoteCard } from './parts'

type View = 'open' | 'handled' | 'all'
const VIEWS: { id: View; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'handled', label: 'Handled' },
  { id: 'all', label: 'All' },
]

/**
 * Every "What was confusing?" note. Open ones are still to answer; mark one handled once it's
 * answered, or a whole lesson's notes once it's been covered in class.
 */
export function NotesPage() {
  usePageTitle('Notes')
  const [data, setData] = useState<Overview | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('open')
  const [classId, setClassId] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [grouped, setGrouped] = useState(true)
  const ids = { cls: useId(), lesson: useId(), grouped: useId() }

  useEffect(() => {
    let active = true
    loadOverview({ notesLimit: 1000 })
      .then((d) => {
        if (!active) return
        setData(d)
        setLoadedAt(Date.now())
      })
      .catch((e) => active && setError(errorMessage(e)))
    return () => {
      active = false
    }
  }, [])

  const updateNotes = useCallback((fn: (n: OvNote[]) => OvNote[]) => setData((d) => d && { ...d, notes: fn(d.notes) }), [])
  const actions = useNoteActions(updateNotes)

  if (error) return <div className="page"><ErrorNote>{error}</ErrorNote></div>
  if (!data) return <div className="page"><Loading label="Loading notes" /></div>

  const inClass = (n: OvNote) => !classId || classesForNote(n, data.classes).some((c) => c.id === classId)
  const lessonsInView = new Map<string, string>()
  for (const n of data.notes) if (inClass(n)) lessonsInView.set(n.lessonId, n.lessonTitle)
  const scoped = data.notes.filter((n) => inClass(n) && (!lessonId || n.lessonId === lessonId))
  const counts = {
    open: scoped.filter((n) => !n.handledAt).length,
    handled: scoped.filter((n) => n.handledAt).length,
    all: scoped.length,
  }
  const list = scoped.filter((n) => view === 'all' || (view === 'open') === !n.handledAt)
  const openLessons = new Set(scoped.filter((n) => !n.handledAt).map((n) => n.lessonId)).size

  const groups = new Map<string, OvNote[]>()
  for (const n of list) groups.set(n.lessonId, [...(groups.get(n.lessonId) ?? []), n])
  // Open notes in each lesson, counted over the whole scope (not just this tab).
  const openIn = (lid: string) => scoped.filter((n) => n.lessonId === lid && !n.handledAt)
  const handledIn = (lid: string) => scoped.filter((n) => n.lessonId === lid && n.handledAt).length

  const card = (n: OvNote, showLesson: boolean) => (
    <NoteCard key={n.id} note={n} now={loadedAt} classes={data.classes} showLesson={showLesson} onHandle={actions.toggle} />
  )

  return (
    <div className="page teach">
      <Crumbs items={[{ label: 'Dashboard', to: '/teach' }, { label: 'Notes' }]} />
      <header className="pagehead">
        <h1>What confused them</h1>
        <p className="muted">
          {counts.open === 0
            ? 'Nothing open: every note has been handled.'
            : `${counts.open} open ${counts.open === 1 ? 'note' : 'notes'} across ${openLessons} ${openLessons === 1 ? 'lesson' : 'lessons'}.`}{' '}
          Mark a note handled once you’ve answered it, or a whole lesson once you’ve covered it in class.
        </p>
      </header>

      <div className="filters">
        <div className="segmented" role="group" aria-label="Show">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              {v.label} <span className="segmented__n">{counts[v.id]}</span>
            </button>
          ))}
        </div>
        <div className="filters__field">
          <label htmlFor={ids.cls}>Class</label>
          <select
            id={ids.cls}
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value)
              setLessonId('')
            }}
          >
            <option value="">All classes</option>
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="filters__field">
          <label htmlFor={ids.lesson}>Lesson</label>
          <select id={ids.lesson} value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            <option value="">All lessons</option>
            {[...lessonsInView].map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </div>
        <div className="filters__check">
          <input id={ids.grouped} type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          <label htmlFor={ids.grouped}>Group by lesson</label>
        </div>
      </div>

      <NoteActionStatus status={actions.status} error={actions.error} />

      {list.length === 0 ? (
        <p className="nothing">
          {data.notes.length === 0
            ? 'No notes yet. They appear here when students use the “What was confusing?” box on a lesson.'
            : view === 'open'
              ? 'Nothing open here. Every note has been handled.'
              : view === 'handled'
                ? 'No handled notes here yet.'
                : 'No notes match these filters.'}
        </p>
      ) : grouped ? (
        [...groups].map(([lid, notes]) => {
          const open = openIn(lid)
          const done = handledIn(lid)
          return (
            <section key={lid} className="notegroup" aria-labelledby={`g-${lid}`}>
              <div className="notegroup__head">
                <h2 id={`g-${lid}`}>{notes[0].lessonTitle}</h2>
                <span className="notegroup__count">
                  {open.length} open{done ? ` · ${done} handled` : ''}
                </span>
                <span className="notegroup__actions">
                  {open.length > 0 && (
                    <button
                      type="button"
                      className="btn btn--done btn--small"
                      onClick={() =>
                        void actions.run(
                          open.map((n) => n.id),
                          true,
                          `Marked ${open.length} ${open.length === 1 ? 'note' : 'notes'} on “${notes[0].lessonTitle}” handled.`,
                        )
                      }
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M4.5 12.5l4.5 4.5L19.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Covered in class
                      <span className="visually-hidden">: mark all {open.length} open notes on {notes[0].lessonTitle} handled</span>
                    </button>
                  )}
                  <Link to={`/teach/lessons/${lid}`}>Edit lesson</Link>
                </span>
              </div>
              <ul className="notes-board">{notes.map((n) => card(n, false))}</ul>
            </section>
          )
        })
      ) : (
        <ul className="notes-board">{list.map((n) => card(n, true))}</ul>
      )}

      <p className="legend muted small">
        Handled is saved with each note, so the count next to Notes is the same on every device. Students don’t see it.
      </p>
    </div>
  )
}
