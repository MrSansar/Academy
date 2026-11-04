/**
 * Everything the teacher's dashboard, class, notes and student pages need, in one shape.
 * Loading is in `loadOverview`; the rest are pure helpers so they can be unit-tested.
 */
import { formatShort } from './format'
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
  /** Every lesson in the class's course, in course order (assigned or not). */
  courseLessons: OvLesson[]
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
  /** When the teacher marked it handled (answered, or covered in class); null while open. */
  handledAt: string | null
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

/** The overview with one class open. */
export const classPath = (classId: string) => `/teach?class=${encodeURIComponent(classId)}`

/** The overview with one class open and a student's details showing. */
export const studentPath = (classId: string, studentId: string) =>
  `${classPath(classId)}&student=${encodeURIComponent(studentId)}`

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
      'id, name, archived, join_code, course_id, courses(title, lessons(id, title, duration_seconds, position, created_at)), enrollments(student_id, joined_at, profiles(full_name, email)), assignments(id, title, due_at, assignment_lessons(position, lessons(id, title, duration_seconds)))',
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
    courseLessons: [...(c.courses?.lessons ?? [])]
      .sort((x, y) => x.position - y.position || x.created_at.localeCompare(y.created_at))
      .map(({ id, title, duration_seconds }) => ({ id, title, duration_seconds })),
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
      // Two keys point at profiles (the student, and who handled it): name the student one.
      .select(
        'id, body, created_at, handled_at, lesson_id, student_id, lessons(title), profiles!confusion_notes_student_id_fkey(full_name, email)',
      )
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
        handledAt: n.handled_at,
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

export interface Prep<S extends { id: string; name: string } = OvStudent> {
  ready: S[]
  started: S[]
  notOpened: S[]
}

/** Splits a class into who finished an assignment, who started, and who hasn't opened any of it. */
export function prepFor<S extends { id: string; name: string }>(
  a: { lessons: { id: string }[] },
  students: S[],
  progress: Map<string, Pick<OvProgress, 'completed_at'>>,
): Prep<S> {
  const prep: Prep<S> = { ready: [], started: [], notOpened: [] }
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

// ---------------------------------------------------------------------------
// Handled notes
// ---------------------------------------------------------------------------

const DAY = 86_400_000

/** "New" = still open and left in the last 24 hours. The same on every device. */
export function isRecentNote(n: Pick<OvNote, 'created_at' | 'handledAt'>, now = Date.now()): boolean {
  return !n.handledAt && now - new Date(n.created_at).getTime() < DAY
}

/** Marks notes handled (or open again) for everyone; returns how many changed. Teacher only. */
export async function setNotesHandled(ids: number[], handled: boolean): Promise<number> {
  if (ids.length === 0) return 0
  const { data, error } = await supabase.rpc('set_notes_handled', { p_note_ids: ids, p_handled: handled })
  if (error) throw error
  notifyNotesChanged()
  return data ?? 0
}

/** Lets the nav's open-notes count refresh as soon as a note is handled anywhere in the app. */
export const NOTES_CHANGED = 'chalkline:notes-changed'
export function notifyNotesChanged(): void {
  window.dispatchEvent(new Event(NOTES_CHANGED))
}

/** Copy of `notes` with the given ids set handled (now) or open. For optimistic updates. */
export function withHandled<N extends Pick<OvNote, 'id' | 'handledAt'>>(notes: N[], ids: number[], handled: boolean, at: string): N[] {
  const set = new Set(ids)
  return notes.map((n) => (set.has(n.id) ? { ...n, handledAt: handled ? (n.handledAt ?? at) : null } : n))
}

// ---------------------------------------------------------------------------
// The overview grid: one row per student, one column per assigned lesson
// ---------------------------------------------------------------------------

/** Lessons in the class's course that no assignment of this class includes: students can't see them. */
export function unassignedLessons(cls: Pick<OvClass, 'courseLessons' | 'assignments'>): OvLesson[] {
  const used = new Set(cls.assignments.flatMap((a) => a.lessons.map((l) => l.id)))
  return cls.courseLessons.filter((l) => !used.has(l.id))
}

/**
 * One grid cell.
 *   done     finished before class        late     finished, but after class started
 *   missed   class started, not finished  progress started, class still ahead
 *   soon     not opened, class within 3 days   todo  not opened, class further off
 */
export type CellKind = 'done' | 'late' | 'missed' | 'progress' | 'soon' | 'todo'

export function cellKind(p: Pick<OvProgress, 'completed_at'> | undefined, dueAt: string, now = Date.now()): CellKind {
  const due = new Date(dueAt).getTime()
  if (p?.completed_at) return new Date(p.completed_at).getTime() > due ? 'late' : 'done'
  if (due < now) return 'missed'
  if (p) return 'progress'
  return due - now <= 72 * HOUR ? 'soon' : 'todo'
}

/** Questions on each lesson, and each student's first-try results on them. */
export type ClassQuiz = Map<string, Map<string, QuizResult>>

export function classQuizByStudent(
  questions: { id: string; lesson_id: string }[],
  attempts: { question_id: string; student_id: string; is_correct: boolean; created_at: string }[],
  studentIds: string[],
): ClassQuiz {
  const mine = new Map<string, typeof attempts>()
  for (const t of attempts) mine.set(t.student_id, [...(mine.get(t.student_id) ?? []), t])
  return new Map(studentIds.map((id) => [id, quizByLesson(questions, mine.get(id) ?? [])]))
}

/** Every check question on the given lessons and every student's attempts at them. */
export async function loadClassQuiz(lessonIds: string[], studentIds: string[]): Promise<ClassQuiz> {
  if (lessonIds.length === 0 || studentIds.length === 0) return new Map()
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
  if (questions.length === 0) return classQuizByStudent([], [], studentIds)
  const attempts = (
    await Promise.all(
      chunks(
        questions.map((q) => q.id),
        ID_CHUNK,
      ).map((ids) =>
        fetchAll<{ question_id: string; student_id: string; is_correct: boolean; created_at: string }>((from, to) =>
          supabase
            .from('question_attempts')
            .select('question_id, student_id, is_correct, created_at')
            .in('question_id', ids)
            .order('created_at')
            .order('id')
            .range(from, to),
        ),
      ),
    )
  ).flat()
  return classQuizByStudent(questions, attempts, studentIds)
}

export interface RowStats {
  /** Unique lessons in the assignments shown. */
  assigned: number
  done: number
  /** Finished, but after class started. Counted in `done` too. */
  late: number
  /** Class started and the lesson still isn't finished. */
  missed: number
  /** Not finished, and class is within 3 days. */
  dueSoon: number
  lastActive: string | null
  quiz: { questions: number; answered: number; right: number }
  openNotes: number
}

/** A student's figures over the given assignments (a lesson assigned twice counts once, at its earliest due time). */
export function rowStats(
  studentId: string,
  assignments: Pick<OvAssignment, 'due_at' | 'lessons'>[],
  progress: Map<string, OvProgress>,
  quiz: Map<string, QuizResult> | undefined,
  notes: Pick<OvNote, 'studentId' | 'lessonId' | 'handledAt'>[],
  now = Date.now(),
): RowStats {
  const due = new Map<string, string>()
  for (const a of [...assignments].sort((x, y) => x.due_at.localeCompare(y.due_at)))
    for (const l of a.lessons) if (!due.has(l.id)) due.set(l.id, a.due_at)
  const r: RowStats = {
    assigned: due.size,
    done: 0,
    late: 0,
    missed: 0,
    dueSoon: 0,
    lastActive: null,
    quiz: { questions: 0, answered: 0, right: 0 },
    openNotes: 0,
  }
  for (const [lessonId, dueAt] of due) {
    const p = progress.get(progressKey(studentId, lessonId))
    const kind = cellKind(p, dueAt, now)
    if (kind === 'done' || kind === 'late') r.done++
    if (kind === 'late') r.late++
    if (kind === 'missed') r.missed++
    if ((kind === 'soon' || kind === 'progress') && new Date(dueAt).getTime() - now <= 72 * HOUR) r.dueSoon++
    for (const t of [p?.last_watched_at, p?.first_opened_at]) if (t && (!r.lastActive || t > r.lastActive)) r.lastActive = t
    const q = quiz?.get(lessonId)
    if (q) {
      r.quiz.questions += q.questions
      r.quiz.answered += q.answered
      r.quiz.right += q.firstTryRight
    }
  }
  r.openNotes = notes.filter((n) => n.studentId === studentId && !n.handledAt && due.has(n.lessonId)).length
  return r
}

/** Behind (missed something) or at risk (something unfinished with class within 3 days). */
export const needsAttention = (r: RowStats) => r.missed > 0 || r.dueSoon > 0

/** Hover text for a cell: when it was opened, last watched and finished. */
export function cellDetail(p: OvProgress | undefined): string | undefined {
  if (!p) return undefined
  return [
    `Opened ${formatShort(p.first_opened_at)}`,
    p.last_watched_at && `last watched ${formatShort(p.last_watched_at)}`,
    p.completed_at && `completed ${formatShort(p.completed_at)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

