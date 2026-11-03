import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { Crumbs, ErrorNote, Loading } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { markNotesSeen, notesSeenAt, isNewNote } from '../../lib/notesSeen'
import { errorMessage } from '../../lib/supabase'
import { classesForNote, loadOverview, type OvNote, type Overview } from '../../lib/teacherOverview'
import { NoteCard } from './parts'

/** Every "What was confusing?" note, newest first, with filters. Opening this page marks them read. */
export function NotesPage() {
  usePageTitle('Notes')
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  // What counted as "read" when the page opened, so new notes stay marked while you look at them.
  const [seenBefore] = useState(notesSeenAt)
  const [classId, setClassId] = useState('')
  const [lessonId, setLessonId] = useState('')
  const [onlyNew, setOnlyNew] = useState(false)
  const [grouped, setGrouped] = useState(false)
  const ids = { cls: useId(), lesson: useId(), onlyNew: useId(), grouped: useId() }

  useEffect(() => {
    let active = true
    loadOverview({ notesLimit: 1000 })
      .then((d) => {
        if (!active) return
        setData(d)
        if (d.notes[0]) markNotesSeen(d.notes[0].created_at)
      })
      .catch((e) => active && setError(errorMessage(e)))
    return () => {
      active = false
    }
  }, [])

  if (error) return <div className="page"><ErrorNote>{error}</ErrorNote></div>
  if (!data) return <div className="page"><Loading label="Loading notes" /></div>

  const inClass = (n: OvNote) => !classId || classesForNote(n, data.classes).some((c) => c.id === classId)
  const lessonsInView = new Map<string, string>()
  for (const n of data.notes) if (inClass(n)) lessonsInView.set(n.lessonId, n.lessonTitle)
  const list = data.notes.filter(
    (n) => inClass(n) && (!lessonId || n.lessonId === lessonId) && (!onlyNew || isNewNote(n.created_at, seenBefore)),
  )
  const newCount = data.notes.filter((n) => isNewNote(n.created_at, seenBefore)).length

  const groups = new Map<string, OvNote[]>()
  for (const n of list) groups.set(n.lessonId, [...(groups.get(n.lessonId) ?? []), n])

  return (
    <div className="page teach">
      <Crumbs items={[{ label: 'Dashboard', to: '/teach' }, { label: 'Notes' }]} />
      <header className="pagehead">
        <h1>What confused them</h1>
        <p className="muted">
          Notes students left under lessons, newest first.{' '}
          {newCount > 0 ? `${newCount} new since you last looked.` : 'Nothing new since you last looked.'}
        </p>
      </header>

      <div className="filters" role="group" aria-label="Filter notes">
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
          <input id={ids.onlyNew} type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
          <label htmlFor={ids.onlyNew}>Only new</label>
        </div>
        <div className="filters__check">
          <input id={ids.grouped} type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          <label htmlFor={ids.grouped}>Group by lesson</label>
        </div>
      </div>

      <p className="muted small" role="status">
        Showing {list.length} {list.length === 1 ? 'note' : 'notes'}
      </p>

      {list.length === 0 ? (
        <p className="nothing">
          {data.notes.length === 0 ? (
            <>No notes yet. They appear here when students use the “What was confusing?” box on a lesson.</>
          ) : (
            <>No notes match these filters.</>
          )}
        </p>
      ) : grouped ? (
        [...groups].map(([lid, notes]) => (
          <section key={lid} className="notegroup" aria-labelledby={`g-${lid}`}>
            <h2 id={`g-${lid}`} className="rulehead">
              {notes[0].lessonTitle}
              <span className="rulehead__aside">
                {notes.length} {notes.length === 1 ? 'note' : 'notes'}
              </span>
              <Link className="rulehead__end" to={`/teach/lessons/${lid}`}>
                Edit lesson
              </Link>
            </h2>
            <ul className="notes-board">
              {notes.map((n) => (
                <NoteCard key={n.id} note={n} classes={data.classes} isNew={isNewNote(n.created_at, seenBefore)} showLesson={false} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <ul className="notes-board">
          {list.map((n) => (
            <NoteCard key={n.id} note={n} classes={data.classes} isNew={isNewNote(n.created_at, seenBefore)} />
          ))}
        </ul>
      )}
    </div>
  )
}
