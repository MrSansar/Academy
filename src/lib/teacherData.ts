import { downloadCsv } from './csv'
import { supabase } from './supabase'
import { lessonStatus, type ConfusionNote, type LessonProgress, type Question, type QuestionAttempt } from './types'

export interface Student {
  id: string
  name: string
  email: string
}

export interface ReportLesson {
  id: string
  title: string
  duration_seconds: number
  check_enabled: boolean
  confusion_enabled: boolean
}

export interface ReportQuestion extends Question {
  correct_index: number | null
  explanation: string
}

export interface AssignmentReport {
  assignment: { id: string; title: string; due_at: string; class_id: string }
  className: string
  lessons: ReportLesson[]
  students: Student[]
  progress: Map<string, LessonProgress>
  questions: ReportQuestion[]
  attempts: QuestionAttempt[]
  notes: ConfusionNote[]
}

export const progressKey = (studentId: string, lessonId: string) => `${studentId}:${lessonId}`

async function loadStudents(classId: string): Promise<Student[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('student_id, profiles(full_name, email)')
    .eq('class_id', classId)
  if (error) throw error
  return data
    .map((e) => ({ id: e.student_id, name: e.profiles?.full_name || '(no name)', email: e.profiles?.email ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function loadProgress(lessonIds: string[], studentIds: Set<string>): Promise<Map<string, LessonProgress>> {
  if (lessonIds.length === 0) return new Map()
  const { data, error } = await supabase.from('lesson_progress').select('*').in('lesson_id', lessonIds)
  if (error) throw error
  return new Map(data.filter((p) => studentIds.has(p.student_id)).map((p) => [progressKey(p.student_id, p.lesson_id), p]))
}

export async function loadAssignmentReport(assignmentId: string): Promise<AssignmentReport> {
  const { data: a, error } = await supabase
    .from('assignments')
    .select(
      'id, title, due_at, class_id, classes(name), assignment_lessons(position, lessons(id, title, duration_seconds, check_enabled, confusion_enabled))',
    )
    .eq('id', assignmentId)
    .single()
  if (error) throw error

  const lessons = [...a.assignment_lessons]
    .sort((x, y) => x.position - y.position)
    .flatMap((al) => (al.lessons ? [al.lessons] : []))
  const lessonIds = lessons.map((l) => l.id)
  const students = await loadStudents(a.class_id)
  const studentIds = new Set(students.map((s) => s.id))

  const [progress, questions, notes] = await Promise.all([
    loadProgress(lessonIds, studentIds),
    lessonIds.length
      ? supabase
          .from('questions')
          .select('*, question_keys(correct_index, explanation)')
          .in('lesson_id', lessonIds)
          .order('position')
          .then(({ data, error }) => {
            if (error) throw error
            return data.map(({ question_keys, ...q }) => ({
              ...q,
              correct_index: question_keys?.correct_index ?? null,
              explanation: question_keys?.explanation ?? '',
            }))
          })
      : Promise.resolve([]),
    lessonIds.length
      ? supabase
          .from('confusion_notes')
          .select('*')
          .in('lesson_id', lessonIds)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error
            return data.filter((n) => studentIds.has(n.student_id))
          })
      : Promise.resolve([]),
  ])

  let attempts: QuestionAttempt[] = []
  if (questions.length) {
    const { data, error } = await supabase
      .from('question_attempts')
      .select('*')
      .in('question_id', questions.map((q) => q.id))
      .order('created_at')
    if (error) throw error
    attempts = data.filter((t) => studentIds.has(t.student_id))
  }

  return {
    assignment: { id: a.id, title: a.title, due_at: a.due_at, class_id: a.class_id },
    className: a.classes?.name ?? '',
    lessons,
    students,
    progress,
    questions,
    attempts,
    notes,
  }
}

export interface QuestionStats {
  answered: number
  firstTryCorrect: number
  /** How many students picked each choice on their first try. */
  firstChoices: number[]
}

/** First attempt per student is what shows which ideas need class time (later tries are retries). */
export function questionStats(q: ReportQuestion, attempts: QuestionAttempt[], choiceCount: number): QuestionStats {
  const first = new Map<string, QuestionAttempt>()
  for (const t of attempts) if (t.question_id === q.id && !first.has(t.student_id)) first.set(t.student_id, t)
  const firstChoices = Array.from({ length: choiceCount }, () => 0)
  let correct = 0
  for (const t of first.values()) {
    if (t.is_correct) correct++
    if (t.chosen_index < choiceCount) firstChoices[t.chosen_index]++
  }
  return { answered: first.size, firstTryCorrect: correct, firstChoices }
}

const CSV_HEADER = [
  'class',
  'assignment',
  'due_before_class',
  'lesson',
  'student_name',
  'student_email',
  'status',
  'percent_watched',
  'first_opened',
  'last_watched',
  'completed_at',
  'finished_before_due',
]

function csvRow(
  className: string,
  a: { title: string; due_at: string },
  lesson: { title: string },
  s: Student,
  p: LessonProgress | undefined,
) {
  const status = lessonStatus(p)
  return [
    className,
    a.title,
    a.due_at,
    lesson.title,
    s.name,
    s.email,
    status === 'not_opened' ? 'not opened' : status === 'complete' ? 'complete' : 'in progress',
    p ? Number(p.percent_watched).toFixed(1) : '0',
    p?.first_opened_at ?? '',
    p?.last_watched_at ?? '',
    p?.completed_at ?? '',
    p?.completed_at ? (new Date(p.completed_at) <= new Date(a.due_at) ? 'yes' : 'no') : '',
  ]
}

function fileSafe(s: string): string {
  return s.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'export'
}

export function exportAssignmentCsv(r: AssignmentReport): void {
  const rows = r.lessons.flatMap((l) =>
    r.students.map((s) => csvRow(r.className, r.assignment, l, s, r.progress.get(progressKey(s.id, l.id)))),
  )
  downloadCsv(`${fileSafe(r.className)}-${fileSafe(r.assignment.title)}.csv`, [CSV_HEADER, ...rows])
}

/** Every assignment × lesson × student in a class, one row each. */
export async function exportClassCsv(classId: string): Promise<void> {
  const { data: cls, error } = await supabase
    .from('classes')
    .select('name, assignments(id, title, due_at, assignment_lessons(position, lessons(id, title)))')
    .eq('id', classId)
    .single()
  if (error) throw error
  const students = await loadStudents(classId)
  const assignments = [...cls.assignments].sort((a, b) => a.due_at.localeCompare(b.due_at))
  const lessonIds = [...new Set(assignments.flatMap((a) => a.assignment_lessons.map((al) => al.lessons?.id ?? '')))].filter(Boolean)
  const progress = await loadProgress(lessonIds, new Set(students.map((s) => s.id)))

  const rows = assignments.flatMap((a) =>
    [...a.assignment_lessons]
      .sort((x, y) => x.position - y.position)
      .flatMap((al) => (al.lessons ? [al.lessons] : []))
      .flatMap((l) => students.map((s) => csvRow(cls.name, a, l, s, progress.get(progressKey(s.id, l.id))))),
  )
  const stamp = new Date().toISOString().slice(0, 10)
  downloadCsv(`${fileSafe(cls.name)}-progress-${stamp}.csv`, [CSV_HEADER, ...rows])
}
