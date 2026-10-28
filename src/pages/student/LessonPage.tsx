import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { CheckQuestions } from '../../components/CheckQuestions'
import { ConfusionBox } from '../../components/ConfusionBox'
import { LessonPlayer, type PlayerControls } from '../../components/LessonPlayer'
import { TranscriptPanel } from '../../components/TranscriptPanel'
import { ErrorNote, Loading } from '../../components/ui'
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
  const controls = useRef<PlayerControls | null>(null)

  useEffect(() => {
    let active = true
    setData(null)
    setError('')
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
  const hasTranscript = Boolean(lesson.transcript?.trim())

  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="crumbs">
        {isTeacher ? <Link to={`/teach/lessons/${lesson.id}`}>← Edit lesson</Link> : <Link to="/">← Assignments</Link>}
      </nav>
      <header className="lesson__head">
        {assignment && (
          <p className="eyebrow">
            {assignment.title}
            {idx >= 0 && ` · Lesson ${idx + 1} of ${assignment.lessons.length}`}
          </p>
        )}
        <h1>{lesson.title}</h1>
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
            onTime={hasTranscript ? (t) => setTime(Math.floor(t)) : undefined}
          />

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

          {next && (
            <p className="next">
              <Link className="btn btn--ghost" to={`/lesson/${next.id}?a=${assignment!.id}`}>
                Next: {next.title} →
              </Link>
            </p>
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
