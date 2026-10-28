import type { Tables } from './database.types'

export type Profile = Tables<'profiles'>
export type Course = Tables<'courses'>
export type ClassRow = Tables<'classes'>
export type Lesson = Tables<'lessons'>
export type Assignment = Tables<'assignments'>
export type AssignmentLesson = Tables<'assignment_lessons'>
export type Question = Tables<'questions'>
export type QuestionKey = Tables<'question_keys'>
export type QuestionAttempt = Tables<'question_attempts'>
export type ConfusionNote = Tables<'confusion_notes'>
export type LessonProgress = Tables<'lesson_progress'>

export type LessonStatus = 'not_opened' | 'in_progress' | 'complete'
export type AssignmentStatus = 'not_started' | 'in_progress' | 'done'

export function lessonStatus(p: Pick<LessonProgress, 'completed_at'> | null | undefined): LessonStatus {
  if (!p) return 'not_opened'
  return p.completed_at ? 'complete' : 'in_progress'
}

export function assignmentStatus(statuses: LessonStatus[]): AssignmentStatus {
  if (statuses.length > 0 && statuses.every((s) => s === 'complete')) return 'done'
  if (statuses.some((s) => s !== 'not_opened')) return 'in_progress'
  return 'not_started'
}

/** Choices are stored as a JSON array of strings. */
export function choicesOf(q: Pick<Question, 'choices'>): string[] {
  return Array.isArray(q.choices) ? q.choices.map(String) : []
}
