import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { CheckQuestions } from '../../components/CheckQuestions'
import { ConfusionBox } from '../../components/ConfusionBox'
import { LessonPlayer, type PlayerControls } from '../../components/LessonPlayer'
import { TranscriptPanel } from '../../components/TranscriptPanel'
import { Stamp } from '../../components/Notebook'
import { Crumbs, ErrorNote, Loading } from '../../components/ui'
import { usePageTitle } from '../../lib/pageTitle'
import { burst } from '../../lib/confetti'
import { completeLineFor } from '../../lib/fun'
import { formatDue, formatMinutes } from '../../lib/format'
import { errorMessage, supabase } from '../../lib/supabase'
import type { Lesson, LessonProgress, Question } from '../../lib/types'

interface AssignmentContext {
  id: string
  title: string
  due_at: string
  lessons: { id: string; title: string }[]
}

interface Loaded {
  lesson: Lesson
  questions: Question[]
  progress: LessonProgress | null
  assignment: AssignmentContext | null
}

export function LessonPage() {
  const { lessonId = '' } = useParams()
  const [params] = useSearchParams()
  const assignmentId = params.get('a')
  const { session, isTeacher } = useAuth()
  const userId = session!.user.id
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [time, setTime] = useState(0)
  const [celebrating, setCelebrating] = useState(false)
  const controls = useRef<PlayerControls | null>(null)
  usePageTitle(data?.lesson.title ?? 'Lesson')

  useEffect(() => {
    let active = true
    setData(null)
    setError('')
    setCelebrating(false)
    ;(async () => {
      const { data: lesson, error: lErr } = await supabase.from('lessons').select('*').eq('id', lessonId).maybeSingle()
      if (lErr) throw lErr
      if (!lesson) throw new Error('This lesson isn’t assigned to any of your classes.')

      const [progress, questions, assignment] = await Promise.all([
        // Teachers preview without creating progress rows.
        isTeacher
          ? Promise.resolve(null)
          : supabase.rpc('open_lesson', { p_lesson_id: lessonId }).then(({ data, error }) => {
              if (error) throw error
              return data
            }),
        lesson.check_enabled
          ? supabase
              .from('questions')
              .select('*')
              .eq('lesson_id', lessonId)
              .order('position')
              .then(({ data }) => data ?? [])
          : Promise.resolve([]),
        assignmentId
          ? supabase
              .from('assignments')
              .select('id, title, due_at, assignment_lessons(position, lessons(id, title))')
              .eq('id', assignmentId)
              .maybeSingle()
              .then(({ data }) =>
                data
                  ? {
                      id: data.id,
                      title: data.title,
                      due_at: data.due_at,
                      lessons: [...data.assignment_lessons]
                        .sort((a, b) => a.position - b.position)
                        .flatMap((al) => (al.lessons ? [al.lessons] : [])),
                    }
                  : null,
              )
          : Promise.resolve(null),
      ])
      if (active) setData({ lesson, questions, progress, assignment })
    })().catch((e) => active && setError(errorMessage(e)))
    return () => {
      active = false
    }
  }, [lessonId, assignmentId, isTeacher])

  if (error)
    return (
      <div className="page narrow">
        <ErrorNote>{error}</ErrorNote>
        <Link to="/">Back to assignments</Link>
      </div>
    )
  if (!data) return <div className="page"><Loading label="Loading lesson" /></div>

  const { lesson, questions, progress, assignment } = data
  const idx = assignment?.lessons.findIndex((l) => l.id === lesson.id) ?? -1
  const next = assignment && idx >= 0 ? assignment.lessons[idx + 1] : undefined
  const prev = assignment && idx > 0 ? assignment.lessons[idx - 1] : undefined
  const hasTranscript = Boolean(lesson.transcript?.trim())

  return (
    <div className="page">
      <Crumbs
        items={
          isTeacher
            ? [
                { label: 'Lessons', to: '/teach/courses' },
                { label: lesson.title, to: `/teach/lessons/${lesson.id}` },
                { label: 'Student preview' },
              ]
            : [{ label: 'Assignments', to: '/' }, { label: lesson.title }]
        }
      />
      <header className="lesson__head">
        {assignment && (
          <div className="lesson__where">
            <p className="eyebrow">
              {assignment.title}
              {idx >= 0 && (
                <span className="lesson__count">
                  {' '}
                  · Lesson {idx + 1} of {assignment.lessons.length}
                </span>
              )}
            </p>
            {idx >= 0 && assignment.lessons.length > 1 && (
              <ol className="steps" aria-label="Lessons in this assignment">
                {assignment.lessons.map((l, i) => (
                  <li key={l.id}>
                    {i === idx ? (
                      <span className="steps__n steps__n--here" aria-current="step" title={l.title}>
                        {i + 1}
                        <span className="visually-hidden">: {l.title} (this lesson)</span>
                      </span>
                    ) : (
                      <Link className="steps__n" to={`/lesson/${l.id}?a=${assignment.id}`} title={l.title}>
                        {i + 1}
                        <span className="visually-hidden">: {l.title}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
        <h1 className="lesson__title">
          {lesson.title}
          {progress?.completed_at && !celebrating && (
            <>
              {' '}
              <Stamp seed={lesson.id}>Done</Stamp>
            </>
          )}
        </h1>
        <p className="muted">
          {formatMinutes(lesson.duration_seconds)}
          {assignment && (
            <>
              {' · '}Due before class on <time dateTime={assignment.due_at}>{formatDue(assignment.due_at)}</time>
            </>
          )}
        </p>
      </header>

      <div className={hasTranscript ? 'lesson lesson--with-side' : 'lesson'}>
        <div className="lesson__main">
          <LessonPlayer
            key={lesson.id}
            lessonId={lesson.id}
            youtubeId={lesson.youtube_id}
            title={lesson.title}
            durationSeconds={lesson.duration_seconds}
            tracking={progress ? { userId, initial: progress } : undefined}
            onReady={(c) => (controls.current = c)}
            onComplete={() => {
              setCelebrating(true)
              burst()
            }}
            onTime={hasTranscript ? (t) => setTime(Math.floor(t)) : undefined}
          />

          {celebrating && (
            <div className="wrapup" role="status">
              <Stamp seed={lesson.id} big>
                Done
              </Stamp>
              <div className="wrapup__text">
                <p className="wrapup__line">{completeLineFor(lesson.id)}</p>
                <p className="wrapup__sub">
                  {next
                    ? 'One step closer to being ready for class.'
                    : assignment
                      ? `That was the last lesson in “${assignment.title}”.`
                      : 'This lesson counts as done.'}
                </p>
              </div>
              {next ? (
                <Link className="btn" to={`/lesson/${next.id}?a=${assignment!.id}`}>
                  Next lesson →
                </Link>
              ) : (
                <Link className="btn btn--ghost" to="/">
                  Back to assignments
                </Link>
              )}
            </div>
          )}

          {lesson.summary && (
            <section className="summary" aria-labelledby="summary-h">
              <h2 id="summary-h">Summary</h2>
              {lesson.summary.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </section>
          )}

          {lesson.check_enabled && <CheckQuestions questions={questions} />}
          {lesson.confusion_enabled && <ConfusionBox lessonId={lesson.id} userId={userId} disabled={isTeacher} />}

          {(next || prev) && !isTeacher && (
            <nav className="pager" aria-label="Other lessons in this assignment">
              {prev ? (
                <Link className="nextlink nextlink--prev" to={`/lesson/${prev.id}?a=${assignment!.id}`}>
                  <span className="nextlink__label">previous</span>
                  <span className="nextlink__title">
                    <span className="nextlink__arrow" aria-hidden="true">←</span> {prev.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link className="nextlink" to={`/lesson/${next.id}?a=${assignment!.id}`}>
                  <span className="nextlink__label">next up</span>
                  <span className="nextlink__title">
                    {next.title} <span className="nextlink__arrow" aria-hidden="true">→</span>
                  </span>
                </Link>
              ) : (
                <Link className="nextlink" to="/">
                  <span className="nextlink__label">that’s the last one</span>
                  <span className="nextlink__title">
                    Back to assignments <span className="nextlink__arrow" aria-hidden="true">→</span>
                  </span>
                </Link>
              )}
            </nav>
          )}
        </div>

        {hasTranscript && (
          <aside className="lesson__side">
            <TranscriptPanel raw={lesson.transcript!} currentTime={time} onSeek={(s) => controls.current?.seekTo(s)} />
          </aside>
        )}
      </div>
    </div>
  )
}
