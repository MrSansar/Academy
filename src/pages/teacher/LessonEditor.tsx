import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { LessonPlayer } from '../../components/LessonPlayer'
import { ErrorNote, Field, Loading, TextArea, Toggle } from '../../components/ui'
import { formatClock } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import { parseTranscript } from '../../lib/transcript'
import { choicesOf } from '../../lib/types'
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
      setCourseId(l.course_id)
      setTitle(l.title)
      setVideo(l.youtube_id)
      setDuration(formatClock(l.duration_seconds))
      setDurationTouched(true)
      setSummary(l.summary)
      setTranscript(l.transcript ?? '')
      setCheckOn(l.check_enabled)
      setConfusionOn(l.confusion_enabled)
      setQuestions(
        qs.map((q) => ({
          key: q.id,
          id: q.id,
          prompt: q.prompt,
          choices: choicesOf(q),
          correct: q.question_keys?.correct_index ?? 0,
          explanation: q.question_keys?.explanation ?? '',
        })),
      )
      setLoaded(true)
    })().catch((e) => setError(errorMessage(e)))
  }, [params.lessonId])

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
      setSaved('Saved.')
      if (isNew) navigate(`/teach/lessons/${lessonId}`, { replace: true })
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

  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to={`/teach/courses/${courseId}`}>← Course lessons</Link>
      </nav>
      <div className="lede lede--row">
        <h1>{isNew ? 'New lesson' : 'Edit lesson'}</h1>
        {!isNew && (
          <Link className="btn btn--ghost btn--small" to={`/lesson/${params.lessonId}`}>
            Preview as student
          </Link>
        )}
      </div>

      <form id={formId} onSubmit={save} className="editor">
        <div className="editor__main card">
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
                One line per cue starting with a time, e.g. <code>1:05 Adding vectors</code>. You can also paste YouTube’s
                “Show transcript” text or a .vtt file.{' '}
                {transcript.trim() && <strong>{cues.length} timed lines found.</strong>}
              </>
            }
          />

          <h2 className="subhead">After the video</h2>
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
          <Toggle
            label="“What was confusing?” box"
            hint="Students can send you a short note. You’ll see them on the assignment dashboard."
            checked={confusionOn}
            onChange={setConfusionOn}
          />

          <ErrorNote>{error}</ErrorNote>
          <div className="row">
            <button className="btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save lesson'}
            </button>
            <span role="status" className="ok">{saved}</span>
            {!isNew && (
              <button type="button" className="btn btn--ghost danger push" onClick={() => void remove()}>
                Delete lesson
              </button>
            )}
          </div>
        </div>

        <aside className="editor__side">
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
