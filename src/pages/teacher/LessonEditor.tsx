import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { LessonPlayer } from '../../components/LessonPlayer'
import { Crumbs, ErrorNote, Field, Loading, TextArea, Toggle } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { formatClock, formatDueCompact } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import { parseTranscript } from '../../lib/transcript'
import { choicesOf } from '../../lib/types'
import { useUnsavedChangesWarning } from '../../lib/useUnsavedChanges'
import { parseYouTubeId } from '../../lib/youtube'
import { LONG_LESSON_SECONDS } from './CourseLessons'

interface QuestionDraft {
  key: string
  id?: string
  prompt: string
  choices: string[]
  correct: number
  explanation: string
}

const MAX_QUESTIONS = 3

/** Everything the teacher can edit, so "unsaved changes" is a plain comparison. */
interface Values {
  title: string
  video: string
  duration: string
  summary: string
  transcript: string
  checkOn: boolean
  confusionOn: boolean
  questions: QuestionDraft[]
}

const EMPTY: Values = {
  title: '',
  video: '',
  duration: '',
  summary: '',
  transcript: '',
  checkOn: false,
  confusionOn: false,
  questions: [],
}

function snapshot(v: Values, removedIds: string[]): string {
  const questions = v.questions.map((q) => ({ id: q.id, prompt: q.prompt, choices: q.choices, correct: q.correct, explanation: q.explanation }))
  return JSON.stringify({ ...v, questions, removedIds })
}

const SECTIONS = [
  { id: 'video', label: 'Video' },
  { id: 'text', label: 'Summary & transcript' },
  { id: 'questions', label: 'Check questions' },
  { id: 'confusion', label: 'Confusion box' },
] as const

function blankQuestion(): QuestionDraft {
  return { key: crypto.randomUUID(), prompt: '', choices: ['', '', ''], correct: 0, explanation: '' }
}

/** "6:12" -> 372, "1:02:03" -> 3723, "6" -> 360 (plain numbers are minutes). */
function parseDuration(value: string): number | null {
  const v = value.trim()
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(parseFloat(v) * 60)
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  return (m[1] ? parseInt(m[1], 10) * 3600 : 0) + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
}

export function LessonEditor() {
  const params = useParams()
  const navigate = useNavigate()
  const isNew = !params.lessonId
  const formId = useId()

  const [courseId, setCourseId] = useState(params.courseId ?? '')
  const [loaded, setLoaded] = useState(isNew)
  const [title, setTitle] = useState('')
  const [video, setVideo] = useState('')
  const [duration, setDuration] = useState('')
  const [durationTouched, setDurationTouched] = useState(false)
  const [summary, setSummary] = useState('')
  const [transcript, setTranscript] = useState('')
  const [checkOn, setCheckOn] = useState(false)
  const [confusionOn, setConfusionOn] = useState(false)
  const [questions, setQuestions] = useState<QuestionDraft[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [courseTitle, setCourseTitle] = useState('')
  const [savedValues, setSavedValues] = useState<Values>(EMPTY)
  usePageTitle(isNew ? 'New lesson' : title || 'Edit lesson')

  function applyValues(v: Values) {
    setTitle(v.title)
    setVideo(v.video)
    setDuration(v.duration)
    setSummary(v.summary)
    setTranscript(v.transcript)
    setCheckOn(v.checkOn)
    setConfusionOn(v.confusionOn)
    setQuestions(v.questions)
  }

  useEffect(() => {
    if (!courseId) return
    void supabase
      .from('courses')
      .select('title')
      .eq('id', courseId)
      .maybeSingle()
      .then(({ data }) => setCourseTitle(data?.title ?? ''))
  }, [courseId])

  useEffect(() => {
    if (!params.lessonId) return
    ;(async () => {
      const { data: l, error } = await supabase.from('lessons').select('*').eq('id', params.lessonId!).single()
      if (error) throw error
      const { data: qs, error: qErr } = await supabase
        .from('questions')
        .select('*, question_keys(correct_index, explanation)')
        .eq('lesson_id', l.id)
        .order('position')
      if (qErr) throw qErr
      const v: Values = {
        title: l.title,
        video: l.youtube_id,
        duration: formatClock(l.duration_seconds),
        summary: l.summary,
        transcript: l.transcript ?? '',
        checkOn: l.check_enabled,
        confusionOn: l.confusion_enabled,
        questions: qs.map((q) => ({
          key: q.id,
          id: q.id,
          prompt: q.prompt,
          choices: choicesOf(q),
          correct: q.question_keys?.correct_index ?? 0,
          explanation: q.question_keys?.explanation ?? '',
        })),
      }
      setCourseId(l.course_id)
      setDurationTouched(true)
      applyValues(v)
      setSavedValues(v)
      setLoaded(true)
    })().catch((e) => setError(errorMessage(e)))
  }, [params.lessonId])

  const current: Values = { title, video, duration, summary, transcript, checkOn, confusionOn, questions }
  const dirty = loaded && snapshot(current, removedIds) !== snapshot(savedValues, [])
  useUnsavedChangesWarning(dirty && !busy)

  function discard() {
    applyValues(savedValues)
    setRemovedIds([])
    setError('')
  }

  function jumpTo(section: string) {
    const h = document.getElementById(`${formId}-${section}`)
    h?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    h?.focus({ preventScroll: true })
  }

  const youtubeId = parseYouTubeId(video)
  const seconds = parseDuration(duration)
  const cues = useMemo(() => parseTranscript(transcript), [transcript])

  function updateQuestion(key: string, patch: Partial<QuestionDraft>) {
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)))
  }

  function removeQuestion(q: QuestionDraft) {
    setQuestions((qs) => qs.filter((x) => x.key !== q.key))
    if (q.id) setRemovedIds((ids) => [...ids, q.id!])
  }

  function validate(): string | null {
    if (!title.trim()) return 'Give the lesson a title.'
    if (!youtubeId) return 'Paste a YouTube link or the 11-character video ID.'
    if (!seconds || seconds <= 0) return 'Enter the video length as m:ss.'
    for (const [i, q] of questions.entries()) {
      const filled = q.choices.filter((c) => c.trim())
      if (!q.prompt.trim()) return `Question ${i + 1} needs a prompt.`
      if (filled.length < 2) return `Question ${i + 1} needs at least two answer choices.`
      if (!q.choices[q.correct]?.trim()) return `Question ${i + 1}: mark which choice is correct.`
    }
    return null
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const problem = validate()
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    setSaved('')
    try {
      const row = {
        course_id: courseId,
        title: title.trim(),
        youtube_id: youtubeId!,
        duration_seconds: seconds!,
        summary: summary.trim(),
        transcript: transcript.trim() || null,
        check_enabled: checkOn,
        confusion_enabled: confusionOn,
      }
      let lessonId = params.lessonId
      if (lessonId) {
        const { error } = await supabase.from('lessons').update(row).eq('id', lessonId)
        if (error) throw error
      } else {
        const { count } = await supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('course_id', courseId)
        const { data, error } = await supabase
          .from('lessons')
          .insert({ ...row, position: count ?? 0 })
          .select('id')
          .single()
        if (error) throw error
        lessonId = data.id
      }

      // Questions: delete removed ones first (the database allows at most 3 per lesson).
      if (removedIds.length) {
        const { error } = await supabase.from('questions').delete().in('id', removedIds)
        if (error) throw error
      }
      const next: QuestionDraft[] = []
      for (const [position, q] of questions.entries()) {
        // Drop blank choices and keep the correct-answer index pointing at the same text.
        const kept = q.choices.map((c, i) => ({ c: c.trim(), i })).filter((x) => x.c)
        const choices = kept.map((x) => x.c)
        const correct = kept.findIndex((x) => x.i === q.correct)
        const fields = { lesson_id: lessonId!, position, prompt: q.prompt.trim(), choices }
        let id = q.id
        if (id) {
          const { error } = await supabase.from('questions').update(fields).eq('id', id)
          if (error) throw error
        } else {
          const { data, error } = await supabase.from('questions').insert(fields).select('id').single()
          if (error) throw error
          id = data.id
        }
        const { error: kErr } = await supabase
          .from('question_keys')
          .upsert({ question_id: id, correct_index: correct, explanation: q.explanation.trim() })
        if (kErr) throw kErr
        next.push({ ...q, id, key: id, choices, correct })
      }
      setQuestions(next)
      setRemovedIds([])
      setSavedValues({ ...current, questions: next })
      setSaved('All changes saved.')
      if (isNew) navigate(`/teach/lessons/${lessonId}`, { replace: true, state: { created: true } })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!params.lessonId) return
    const ok = window.confirm(
      'Delete this lesson? It is removed from every assignment, and students’ watch progress and answers for it are deleted too.',
    )
    if (!ok) return
    const { error } = await supabase.from('lessons').delete().eq('id', params.lessonId)
    if (error) return setError(errorMessage(error))
    navigate(`/teach/courses/${courseId}`)
  }

  if (!loaded) return <div className="page">{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</div>

  const status = busy ? 'Saving…' : dirty ? 'Unsaved changes' : isNew ? 'Nothing to save yet' : saved || 'No changes'
  const sectionHead = (id: (typeof SECTIONS)[number]['id'], label: string) => (
    <h2 id={`${formId}-${id}`} className="rulehead" tabIndex={-1}>
      {label}
    </h2>
  )

  return (
    <div className="page teach">
      <Crumbs
        items={[
          { label: 'Lessons', to: '/teach/courses' },
          { label: courseTitle || 'Course', to: `/teach/courses/${courseId}` },
          { label: isNew ? 'New lesson' : title || 'Lesson' },
        ]}
      />
      <header className="pagehead pagehead--row">
        <div>
          <p className="eyebrow">{isNew ? 'New lesson' : 'Edit lesson'}</p>
          <h1>{title.trim() || (isNew ? 'Untitled lesson' : 'Lesson')}</h1>
        </div>
        {!isNew && (
          <Link className="btn btn--ghost btn--small" to={`/lesson/${params.lessonId}`}>
            Preview as student
          </Link>
        )}
      </header>

      <form id={formId} onSubmit={save} className="editor">
        <div className="editor__main">
          <section aria-labelledby={`${formId}-video`} className="editor__section">
            {sectionHead('video', 'Video')}
            <Field label="Title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            <Field
              label="YouTube link or video ID"
              required
              placeholder="https://youtu.be/…"
              value={video}
              onChange={(e) => {
                setVideo(e.target.value)
                // A different video: read its length again once the preview loads.
                setDurationTouched(false)
                setDuration('')
              }}
              hint={
                video && !youtubeId
                  ? 'That doesn’t look like a YouTube link.'
                  : 'Unlisted videos work. Make sure “Allow embedding” is on in YouTube Studio.'
              }
            />
            <Field
              label="Length (m:ss)"
              required
              inputMode="numeric"
              placeholder="6:00"
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value)
                setDurationTouched(true)
              }}
              hint="Filled in automatically from the video."
            />
            {seconds !== null && seconds > LONG_LESSON_SECONDS && (
              <p className="softwarn" role="status">
                This video is {formatClock(seconds)} long. Short videos of about 6 minutes get watched more; consider
                splitting.
              </p>
            )}
          </section>

          <section aria-labelledby={`${formId}-text`} className="editor__section">
            {sectionHead('text', 'Summary & transcript')}
            <TextArea
              label="Short summary (shown under the video)"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <TextArea
              label="Transcript (optional)"
              rows={6}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              hint={
                <>
                  One line per cue starting with a time, e.g. <code>1:05 Adding vectors</code>. You can also paste
                  YouTube’s “Show transcript” text or a .vtt file.{' '}
                  {transcript.trim() && <strong>{cues.length} timed lines found.</strong>}
                </>
              }
            />
          </section>

          <section aria-labelledby={`${formId}-questions`} className="editor__section">
            {sectionHead('questions', 'Check questions')}
            <Toggle
              label="End-of-lesson check questions"
              hint="0–3 multiple-choice practice questions with instant feedback. Not graded."
              checked={checkOn}
              onChange={setCheckOn}
            />
            {checkOn && (
              <div className="qedit">
                {questions.map((q, i) => (
                  <QuestionEditor
                    key={q.key}
                    n={i + 1}
                    q={q}
                    onChange={(patch) => updateQuestion(q.key, patch)}
                    onRemove={() => removeQuestion(q)}
                  />
                ))}
                {questions.length < MAX_QUESTIONS && (
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => setQuestions((qs) => [...qs, blankQuestion()])}>
                    + Add question ({questions.length}/{MAX_QUESTIONS})
                  </button>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby={`${formId}-confusion`} className="editor__section">
            {sectionHead('confusion', 'Confusion box')}
            <Toggle
              label="“What was confusing?” sticky note under this lesson"
              hint="Students can leave you a note. You’ll find them under Notes."
              checked={confusionOn}
              onChange={setConfusionOn}
            />
          </section>

          {!isNew && (
            <section className="editor__section dangerzone" aria-label="Delete lesson">
              <button type="button" className="linkish danger" onClick={() => void remove()}>
                Delete this lesson…
              </button>
            </section>
          )}
        </div>

        <aside className="editor__side">
          {isNew ? (
            <section className="t-visible">
              <h2>Who can see this lesson</h2>
              <p>Students only see lessons that are in an assignment. Save the lesson, then add it to one here.</p>
            </section>
          ) : (
            <LessonVisibility lessonId={params.lessonId!} courseId={courseId} courseTitle={courseTitle} />
          )}
          <nav className="editor__index" aria-label="Sections of this form">
            <p className="editor__index-h">On this page</p>
            <ul>
              {SECTIONS.map((sec) => (
                <li key={sec.id}>
                  <button type="button" onClick={() => jumpTo(sec.id)}>
                    {sec.label}
                    {sec.id === 'questions' && checkOn && <span className="muted"> {questions.length}</span>}
                    {sec.id === 'confusion' && <span className="muted"> {confusionOn ? 'on' : 'off'}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {youtubeId ? (
            <LessonPlayer
              key={youtubeId}
              lessonId="preview"
              youtubeId={youtubeId}
              title={title || 'Preview'}
              durationSeconds={seconds || 60}
              onReady={(_, d) => {
                if (!durationTouched && d > 0) setDuration(formatClock(d))
              }}
            />
          ) : (
            <div className="stage stage--empty">
              <p>Paste a YouTube link to preview the video.</p>
            </div>
          )}
        </aside>

        {/* Always on screen: what's unsaved, and the buttons to keep or drop it. */}
        <div className="savebar">
          <p className={dirty ? 'savebar__status savebar__status--dirty' : 'savebar__status'} role="status">
            <span className="savebar__dot" aria-hidden="true" />
            {status}
          </p>
          {error && (
            <p className="savebar__error" role="alert">
              {error}
            </p>
          )}
          <span className="savebar__actions">
            {dirty && (
              <button type="button" className="btn btn--ghost btn--small" onClick={discard} disabled={busy}>
                Discard changes
              </button>
            )}
            {!isNew && (
              <Link className="btn btn--ghost btn--small" to={`/lesson/${params.lessonId}`}>
                Preview
              </Link>
            )}
            <button className="btn btn--small" disabled={busy}>
              {busy ? 'Saving…' : 'Save lesson'}
            </button>
          </span>
        </div>
      </form>
    </div>
  )
}

function QuestionEditor({
  n,
  q,
  onChange,
  onRemove,
}: {
  n: number
  q: QuestionDraft
  onChange: (patch: Partial<QuestionDraft>) => void
  onRemove: () => void
}) {
  const group = useId()
  return (
    <fieldset className="qcard">
      <legend>Question {n}</legend>
      <TextArea label="Question" rows={2} value={q.prompt} onChange={(e) => onChange({ prompt: e.target.value })} />
      <p className="hint">Choices: select the correct one.</p>
      <ol className="choices-edit">
        {q.choices.map((c, i) => (
          <li key={i}>
            <input
              type="radio"
              name={group}
              checked={q.correct === i}
              onChange={() => onChange({ correct: i })}
              aria-label={`Choice ${i + 1} is correct`}
            />
            <input
              type="text"
              value={c}
              aria-label={`Choice ${i + 1}`}
              onChange={(e) => onChange({ choices: q.choices.map((x, j) => (j === i ? e.target.value : x)) })}
            />
            {q.choices.length > 2 && (
              <button
                type="button"
                className="iconbtn"
                aria-label={`Remove choice ${i + 1}`}
                onClick={() =>
                  onChange({
                    choices: q.choices.filter((_, j) => j !== i),
                    correct: q.correct === i ? 0 : q.correct > i ? q.correct - 1 : q.correct,
                  })
                }
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ol>
      {q.choices.length < 6 && (
        <button type="button" className="linkish" onClick={() => onChange({ choices: [...q.choices, ''] })}>
          + Add choice
        </button>
      )}
      <Field
        label="One-line explanation (shown after answering)"
        value={q.explanation}
        onChange={(e) => onChange({ explanation: e.target.value })}
      />
      <button type="button" className="linkish danger" onClick={onRemove}>
        Remove question {n}
      </button>
    </fieldset>
  )
}

interface VisClass {
  id: string
  name: string
  archived: boolean
  assignments: { id: string; title: string; due_at: string; assignment_lessons: { lesson_id: string }[] }[]
}

/**
 * Which assignments include this lesson (so which students can see it), and a quick way to add it
 * to one: a lesson that isn't in any assignment is invisible to students.
 */
function LessonVisibility({ lessonId, courseId, courseTitle }: { lessonId: string; courseId: string; courseTitle: string }) {
  const location = useLocation()
  const created = Boolean((location.state as { created?: boolean } | null)?.created)
  const [classes, setClasses] = useState<VisClass[] | null>(null)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const pickId = useId()

  useEffect(() => {
    if (!courseId) return
    let active = true
    supabase
      .from('classes')
      .select('id, name, archived, assignments(id, title, due_at, assignment_lessons(lesson_id))')
      .eq('course_id', courseId)
      .order('name')
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(errorMessage(error))
        else setClasses(data)
      })
    return () => {
      active = false
    }
  }, [courseId, reload])

  if (!classes) return <section className="t-visible">{error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Checking assignments" />}</section>

  const now = Date.now()
  const includes = (a: VisClass['assignments'][number]) => a.assignment_lessons.some((x) => x.lesson_id === lessonId)
  const assigned = classes.flatMap((c) => c.assignments.filter(includes).map((a) => ({ c, a })))
  const open = classes.filter((c) => !c.archived)
  const candidates = open
    .flatMap((c) => c.assignments.filter((a) => !includes(a)).map((a) => ({ c, a })))
    .sort((x, y) => x.a.due_at.localeCompare(y.a.due_at))
  const ahead = candidates.filter((x) => new Date(x.a.due_at).getTime() >= now)
  const past = candidates.filter((x) => new Date(x.a.due_at).getTime() < now).reverse()

  async function add() {
    const target = candidates.find((x) => x.a.id === pick)
    if (!target) return
    setBusy(true)
    setError('')
    const { error } = await supabase
      .from('assignment_lessons')
      .insert({ assignment_id: target.a.id, lesson_id: lessonId, position: target.a.assignment_lessons.length })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setMessage(`Added to “${target.a.title}”. Students in ${target.c.name} can see it now.`)
    setPick('')
    setReload((n) => n + 1)
  }

  return (
    <section className={assigned.length ? 't-visible' : 't-visible t-visible--warn'} aria-labelledby={`${pickId}-h`}>
      <h2 id={`${pickId}-h`}>Who can see this lesson</h2>
      {assigned.length > 0 ? (
        <>
          <p>Students see it in:</p>
          <ul>
            {assigned.map(({ c, a }) => (
              <li key={a.id}>
                <strong>{c.name}</strong> · <Link to={`/teach/assignments/${a.id}`}>{a.title}</Link>{' '}
                <span className="t-muted">(due {formatDueCompact(a.due_at)})</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>
          <strong>{created ? 'Saved. No student can see it yet.' : 'No student can see this lesson yet.'}</strong> It isn’t in
          any assignment. Add it to one below.
        </p>
      )}

      {open.length === 0 ? (
        <p className="t-small">
          No class uses the “{courseTitle || 'this'}” course yet. <Link to="/teach">Create a class</Link> on the overview.
        </p>
      ) : (
        <>
          {candidates.length > 0 && (
            // Not a <form>: this sits inside the lesson's own form.
            <div className="t-inlineform">
              <div className="field">
                <label htmlFor={pickId}>Add to an assignment</label>
                <select id={pickId} value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Choose…</option>
                  {ahead.length > 0 && (
                    <optgroup label="Coming up">
                      {ahead.map(({ c, a }) => (
                        <option key={a.id} value={a.id}>
                          {c.name}: {a.title} ({formatDueCompact(a.due_at)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {past.length > 0 && (
                    <optgroup label="Already due">
                      {past.map(({ c, a }) => (
                        <option key={a.id} value={a.id}>
                          {c.name}: {a.title} ({formatDueCompact(a.due_at)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <button type="button" className="btn btn--small" disabled={!pick || busy} onClick={() => void add()}>
                {busy ? 'Adding…' : 'Add'}
              </button>
            </div>
          )}
          <p className="t-small">
            Or a new assignment with it in{' '}
            {open.map((c, i) => (
              <span key={c.id}>
                <Link to={`/teach/classes/${c.id}/assignments/new?lessons=${lessonId}`}>{c.name}</Link>
                {i < open.length - 1 ? ', ' : ''}
              </span>
            ))}
            .
          </p>
        </>
      )}
      {message && (
        <p className="t-small" role="status">
          {message}
        </p>
      )}
      <ErrorNote>{error}</ErrorNote>
    </section>
  )
}
