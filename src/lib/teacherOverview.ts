/**
 * Everything the teacher's dashboard, class, notes and student pages need, in one shape.
 * Loading is in `loadOverview`; the rest are pure helpers so they can be unit-tested.
 */
import { supabase } from './supabase'
import { lessonStatus, type LessonProgress } from './types'

export interface OvStudent {
  id: string
  name: string
  email: string
  joinedAt: string
}

export interface OvLesson {
  id: string
  title: string
  duration_seconds: number
}

export interface OvAssignment {
  id: string
  title: string
  due_at: string
  classId: string
  lessons: OvLesson[]
}

export interface OvClass {
  id: string
  name: string
  archived: boolean
  joinCode: string
  courseId: string
  courseTitle: string
  students: OvStudent[]
  /** Soonest due first. */
  assignments: OvAssignment[]
}

export type OvProgress = Pick<
  LessonProgress,
  'student_id' | 'lesson_id' | 'percent_watched' | 'completed_at' | 'first_opened_at' | 'last_watched_at'
>

export interface OvNote {
  id: number
  body: string
  created_at: string
  lessonId: string
  lessonTitle: string
  studentId: string
  studentName: string
}

export interface Overview {
  classes: OvClass[]
  /** Keyed by `progressKey(student, lesson)`. */
  progress: Map<string, OvProgress>
  /** Newest first, only from students in the loaded classes. */
  notes: OvNote[]
}

export const progressKey = (studentId: string, lessonId: string) => `${studentId}:${lessonId}`

/** Route of a student's page within one class. */
export const studentPath = (classId: string, studentId: string) => `/teach/classes/${classId}/students/${studentId}`

const PAGE = 1000 // PostgREST returns at most this many rows per request on Supabase by default
const ID_CHUNK = 100 // keeps `in.(…)` filters well under URL length limits

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Runs a ranged query page by page until a short page comes back. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

export async function loadOverview(opts: { classId?: string; studentId?: string; notesLimit?: number } = {}): Promise<Overview> {
  let q = supabase
    .from('classes')
    .select(
      'id, name, archived, join_code, course_id, courses(title), enrollments(student_id, joined_at, profiles(full_name, email)), assignments(id, title, due_at, assignment_lessons(position, lessons(id, title, duration_seconds)))',
    )
    .order('name')
  if (opts.classId) q = q.eq('id', opts.classId)
  const { data, error } = await q
  if (error) throw error

  const classes: OvClass[] = data.map((c) => ({
    id: c.id,
    name: c.name,
    archived: c.archived,
    joinCode: c.join_code,
    courseId: c.course_id,
    courseTitle: c.courses?.title ?? '',
    students: c.enrollments
      .filter((e) => !opts.studentId || e.student_id === opts.studentId)
      .map((e) => ({
        id: e.student_id,
        name: e.profiles?.full_name || e.profiles?.email || '(no name)',
        email: e.profiles?.email ?? '',
        joinedAt: e.joined_at,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    assignments: c.assignments
      .map((a) => ({
        id: a.id,
        title: a.title,
        due_at: a.due_at,
        classId: c.id,
        lessons: [...a.assignment_lessons]
          .sort((x, y) => x.position - y.position)
          .flatMap((al) => (al.lessons ? [al.lessons] : [])),
      }))
      .sort((a, b) => a.due_at.localeCompare(b.due_at)),
  }))

  const studentIds = new Set(classes.flatMap((c) => c.students.map((s) => s.id)))
  const lessonIds = [...new Set(classes.flatMap((c) => c.assignments.flatMap((a) => a.lessons.map((l) => l.id))))]

  const progressRows = (
    await Promise.all(
      chunks(lessonIds, ID_CHUNK).map((ids) =>
        fetchAll<OvProgress>((from, to) => {
          let p = supabase
            .from('lesson_progress')
            .select('student_id, lesson_id, percent_watched, completed_at, first_opened_at, last_watched_at')
            .in('lesson_id', ids)
          if (opts.studentId) p = p.eq('student_id', opts.studentId)
          return p.order('student_id').order('lesson_id').range(from, to)
        }),
      ),
    )
  ).flat()

  const limit = opts.notesLimit ?? 500
  const notesQuery = (ids?: string[]) => {
    let nq = supabase
      .from('confusion_notes')
      .select('id, body, created_at, lesson_id, student_id, lessons(title), profiles(full_name, email)')
      .order('created_at', { ascending: false })
    if (opts.studentId) nq = nq.eq('student_id', opts.studentId)
    if (ids) nq = nq.in('lesson_id', ids)
    return nq.limit(limit).then(({ data, error }) => {
      if (error) throw error
      return data
    })
  }
  // For one class, only notes on that class's lessons; otherwise the newest notes overall.
  const noteRows = opts.classId
    ? (await Promise.all(chunks(lessonIds, ID_CHUNK).map(notesQuery)))
        .flat()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
    : await notesQuery()

  return {
    classes,
    progress: new Map(
      progressRows.filter((p) => studentIds.has(p.student_id)).map((p) => [progressKey(p.student_id, p.lesson_id), p]),
    ),
    notes: noteRows
      .filter((n) => studentIds.has(n.student_id))
      .map((n) => ({
        id: n.id,
        body: n.body,
        created_at: n.created_at,
        lessonId: n.lesson_id,
        lessonTitle: n.lessons?.title ?? 'Lesson',
        studentId: n.student_id,
        studentName: n.profiles?.full_name || n.profiles?.email || 'Student',
      })),
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export interface Prep {
  ready: OvStudent[]
  started: OvStudent[]
  notOpened: OvStudent[]
}

/** Splits a class into who finished an assignment, who started, and who hasn't opened any of it. */
export function prepFor(a: OvAssignment, students: OvStudent[], progress: Map<string, OvProgress>): Prep {
  const prep: Prep = { ready: [], started: [], notOpened: [] }
  for (const s of students) {
    const st = a.lessons.map((l) => lessonStatus(progress.get(progressKey(s.id, l.id))))
    if (st.length > 0 && st.every((x) => x === 'complete')) prep.ready.push(s)
    else if (st.some((x) => x !== 'not_opened')) prep.started.push(s)
    else prep.notOpened.push(s)
  }
  return prep
}

const HOUR = 3_600_000

/** How loudly to flag "not opened yet": amber within 3 days of class, red within 24 h or after. */
export function urgency(dueAt: string, now = Date.now()): 'none' | 'soon' | 'urgent' {
  const left = new Date(dueAt).getTime() - now
  if (left <= 24 * HOUR) return 'urgent'
  if (left <= 72 * HOUR) return 'soon'
  return 'none'
}

export interface StudentSummary {
  /** Unique lessons assigned to the student's class. */
  assigned: number
  done: number
  /** Lessons whose (earliest) due time has passed without being completed by then. */
  missed: number
  lastActive: string | null
  notes: number
}

export function studentSummary(
  s: OvStudent,
  cls: OvClass,
  progress: Map<string, OvProgress>,
  notes: OvNote[],
  now = Date.now(),
): StudentSummary {
  // A lesson assigned twice in one class counts once, against its earliest due time.
  const due = new Map<string, string>()
  for (const a of cls.assignments) for (const l of a.lessons) if (!due.has(l.id)) due.set(l.id, a.due_at)
  let done = 0
  let missed = 0
  let lastActive: string | null = null
  for (const [lessonId, dueAt] of due) {
    const p = progress.get(progressKey(s.id, lessonId))
    if (p?.completed_at) done++
    const finishedInTime = p?.completed_at && new Date(p.completed_at) <= new Date(dueAt)
    if (new Date(dueAt).getTime() < now && !finishedInTime) missed++
    for (const t of [p?.last_watched_at, p?.first_opened_at]) if (t && (!lastActive || t > lastActive)) lastActive = t
  }
  const lessonIds = new Set(due.keys())
  return {
    assigned: due.size,
    done,
    missed,
    lastActive,
    notes: notes.filter((n) => n.studentId === s.id && lessonIds.has(n.lessonId)).length,
  }
}

/** Classes a note belongs to: the student is in the class and the lesson is assigned there. */
export function classesForNote(n: Pick<OvNote, 'studentId' | 'lessonId'>, classes: OvClass[]): OvClass[] {
  return classes.filter(
    (c) => c.students.some((s) => s.id === n.studentId) && c.assignments.some((a) => a.lessons.some((l) => l.id === n.lessonId)),
  )
}

/** The next assignments to prepare for (not yet due), soonest first, across classes. */
export function upcomingAssignments(classes: OvClass[], now = Date.now()): { a: OvAssignment; cls: OvClass }[] {
  return classes
    .filter((c) => !c.archived)
    .flatMap((cls) => cls.assignments.filter((a) => new Date(a.due_at).getTime() >= now).map((a) => ({ a, cls })))
    .sort((x, y) => x.a.due_at.localeCompare(y.a.due_at))
}

export interface QuizResult {
  questions: number
  answered: number
  firstTryRight: number
}

/** Per lesson: how many questions, how many this student tried, how many they got right first time. */
export function quizByLesson(
  questions: { id: string; lesson_id: string }[],
  attempts: { question_id: string; is_correct: boolean; created_at: string }[],
): Map<string, QuizResult> {
  const lessonOf = new Map(questions.map((q) => [q.id, q.lesson_id]))
  const out = new Map<string, QuizResult>()
  for (const q of questions) {
    const r = out.get(q.lesson_id) ?? { questions: 0, answered: 0, firstTryRight: 0 }
    r.questions++
    out.set(q.lesson_id, r)
  }
  const seen = new Set<string>()
  for (const t of [...attempts].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (seen.has(t.question_id)) continue // later tries are practice; the first one is what counts
    seen.add(t.question_id)
    const r = out.get(lessonOf.get(t.question_id) ?? '')
    if (!r) continue
    r.answered++
    if (t.is_correct) r.firstTryRight++
  }
  return out
}

/** Questions on the given lessons and one student's attempts at them. */
export async function loadStudentQuiz(studentId: string, lessonIds: string[]): Promise<Map<string, QuizResult>> {
  if (lessonIds.length === 0) return new Map()
  const questions = (
    await Promise.all(
      chunks(lessonIds, ID_CHUNK).map((ids) =>
        supabase
          .from('questions')
          .select('id, lesson_id')
          .in('lesson_id', ids)
          .then(({ data, error }) => {
            if (error) throw error
            return data
          }),
      ),
    )
  ).flat()
  if (questions.length === 0) return new Map()
  const attempts = await fetchAll<{ question_id: string; is_correct: boolean; created_at: string }>((from, to) =>
    supabase
      .from('question_attempts')
      .select('question_id, is_correct, created_at')
      .eq('student_id', studentId)
      .order('created_at')
      .range(from, to),
  )
  return quizByLesson(questions, attempts)
}
