import { supabase } from './supabase'
import type { LessonProgress } from './types'

export interface AssignedLesson {
  id: string
  title: string
  duration_seconds: number
}

export interface StudentAssignment {
  id: string
  title: string
  instructions: string
  due_at: string
  classId: string
  className: string
  lessons: AssignedLesson[]
}

export interface MyClass {
  id: string
  name: string
}

/** Assignments in every class the signed-in student belongs to (RLS does the filtering). */
export async function loadMyAssignments(): Promise<StudentAssignment[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('id, title, instructions, due_at, class_id, classes(id, name), assignment_lessons(position, lessons(id, title, duration_seconds))')
    .order('due_at')
  if (error) throw error
  return data.map((a) => ({
    id: a.id,
    title: a.title,
    instructions: a.instructions,
    due_at: a.due_at,
    classId: a.class_id,
    className: a.classes?.name ?? '',
    lessons: [...a.assignment_lessons]
      .sort((x, y) => x.position - y.position)
      .flatMap((al) => (al.lessons ? [al.lessons] : [])),
  }))
}

export async function loadMyClasses(userId: string): Promise<MyClass[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('classes(id, name)')
    .eq('student_id', userId)
  if (error) throw error
  return data.flatMap((e) => (e.classes ? [e.classes] : [])).sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadMyProgress(userId: string): Promise<Map<string, LessonProgress>> {
  const { data, error } = await supabase.from('lesson_progress').select('*').eq('student_id', userId)
  if (error) throw error
  return new Map(data.map((p) => [p.lesson_id, p]))
}
