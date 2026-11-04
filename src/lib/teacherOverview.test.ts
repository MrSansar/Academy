import { describe, expect, it } from 'vitest'
import {
  classesForNote,
  isRecentNote,
  prepFor,
  progressKey,
  quizByLesson,
  studentSummary,
  upcomingAssignments,
  urgency,
  withHandled,
  type OvClass,
  type OvProgress,
} from './teacherOverview'

const HOUR = 3_600_000
const now = Date.parse('2026-11-03T12:00:00Z')
const iso = (ms: number) => new Date(now + ms).toISOString()

const ana = { id: 'ana', name: 'Ana', email: 'ana@x', joinedAt: iso(-100 * HOUR) }
const ben = { id: 'ben', name: 'Ben', email: 'ben@x', joinedAt: iso(-100 * HOUR) }
const cy = { id: 'cy', name: 'Cy', email: 'cy@x', joinedAt: iso(-100 * HOUR) }
const L = (id: string) => ({ id, title: id, duration_seconds: 300 })

const cls: OvClass = {
  id: 'c1',
  name: 'Physics',
  archived: false,
  joinCode: 'ABCD2345',
  courseId: 'co',
  courseTitle: 'Physics course',
  students: [ana, ben, cy],
  assignments: [
    { id: 'past', title: 'Past', due_at: iso(-48 * HOUR), classId: 'c1', lessons: [L('l0')] },
    { id: 'next', title: 'Next', due_at: iso(30 * HOUR), classId: 'c1', lessons: [L('l1'), L('l2')] },
  ],
}

function prog(rows: Partial<OvProgress>[]): Map<string, OvProgress> {
  return new Map(
    rows.map((r) => {
      const p: OvProgress = {
        student_id: r.student_id!,
        lesson_id: r.lesson_id!,
        percent_watched: r.percent_watched ?? 0,
        completed_at: r.completed_at ?? null,
        first_opened_at: r.first_opened_at ?? iso(-HOUR),
        last_watched_at: r.last_watched_at ?? null,
      }
      return [progressKey(p.student_id, p.lesson_id), p]
    }),
  )
}

describe('prepFor', () => {
  it('splits students into ready / started / not opened', () => {
    const p = prog([
      { student_id: 'ana', lesson_id: 'l1', completed_at: iso(-HOUR) },
      { student_id: 'ana', lesson_id: 'l2', completed_at: iso(-HOUR) },
      { student_id: 'ben', lesson_id: 'l1', percent_watched: 40 },
    ])
    const prep = prepFor(cls.assignments[1], cls.students, p)
    expect(prep.ready.map((s) => s.id)).toEqual(['ana'])
    expect(prep.started.map((s) => s.id)).toEqual(['ben'])
    expect(prep.notOpened.map((s) => s.id)).toEqual(['cy'])
  })
})

describe('studentSummary', () => {
  it('counts done, missed (not finished by the due time) and last activity', () => {
    const p = prog([
      // finished the past lesson, but after it was due: still "missed"
      { student_id: 'ana', lesson_id: 'l0', completed_at: iso(-10 * HOUR), last_watched_at: iso(-10 * HOUR) },
      { student_id: 'ana', lesson_id: 'l1', completed_at: iso(-2 * HOUR), last_watched_at: iso(-2 * HOUR) },
    ])
    const notes = [
      { id: 1, body: 'x', created_at: iso(-HOUR), handledAt: null, lessonId: 'l1', lessonTitle: 'l1', studentId: 'ana', studentName: 'Ana' },
      { id: 2, body: 'y', created_at: iso(-HOUR), handledAt: null, lessonId: 'other', lessonTitle: 'o', studentId: 'ana', studentName: 'Ana' },
    ]
    const s = studentSummary(ana, cls, p, notes, now)
    expect(s).toEqual({ assigned: 3, done: 2, missed: 1, lastActive: iso(-HOUR), notes: 1 })
  })
  it('is all zeroes for someone who never opened anything', () => {
    expect(studentSummary(cy, cls, new Map(), [], now)).toEqual({ assigned: 3, done: 0, missed: 1, lastActive: null, notes: 0 })
  })
})

describe('urgency', () => {
  it('goes amber within 3 days and red within a day', () => {
    expect(urgency(iso(100 * HOUR), now)).toBe('none')
    expect(urgency(iso(48 * HOUR), now)).toBe('soon')
    expect(urgency(iso(5 * HOUR), now)).toBe('urgent')
  })
})

describe('upcomingAssignments and classesForNote', () => {
  it('skips past assignments and archived classes', () => {
    const archived = { ...cls, id: 'c2', archived: true }
    expect(upcomingAssignments([cls, archived], now).map((x) => x.a.id)).toEqual(['next'])
  })
  it('finds the class a note came from', () => {
    const other: OvClass = { ...cls, id: 'c2', students: [ben] }
    expect(classesForNote({ studentId: 'ana', lessonId: 'l1' }, [cls, other]).map((c) => c.id)).toEqual(['c1'])
    expect(classesForNote({ studentId: 'ana', lessonId: 'nope' }, [cls])).toEqual([])
  })
})

describe('quizByLesson', () => {
  it('counts only the first try at each question', () => {
    const qs = [
      { id: 'q1', lesson_id: 'l1' },
      { id: 'q2', lesson_id: 'l1' },
      { id: 'q3', lesson_id: 'l2' },
    ]
    const tries = [
      { question_id: 'q1', is_correct: false, created_at: iso(-3 * HOUR) },
      { question_id: 'q1', is_correct: true, created_at: iso(-2 * HOUR) }, // retry, ignored
      { question_id: 'q2', is_correct: true, created_at: iso(-HOUR) },
    ]
    const r = quizByLesson(qs, tries)
    expect(r.get('l1')).toEqual({ questions: 2, answered: 2, firstTryRight: 1 })
    expect(r.get('l2')).toEqual({ questions: 1, answered: 0, firstTryRight: 0 })
  })
})

describe('handled notes', () => {
  it('calls a note new only while it is open and under a day old', () => {
    expect(isRecentNote({ created_at: iso(-2 * HOUR), handledAt: null }, now)).toBe(true)
    expect(isRecentNote({ created_at: iso(-30 * HOUR), handledAt: null }, now)).toBe(false)
    expect(isRecentNote({ created_at: iso(-2 * HOUR), handledAt: iso(-HOUR) }, now)).toBe(false)
  })
  it('updates only the chosen notes, and keeps the first handled time', () => {
    const notes = [
      { id: 1, handledAt: null },
      { id: 2, handledAt: '2026-11-01T00:00:00Z' },
      { id: 3, handledAt: null },
    ]
    expect(withHandled(notes, [1, 2], true, 'NOW')).toEqual([
      { id: 1, handledAt: 'NOW' },
      { id: 2, handledAt: '2026-11-01T00:00:00Z' },
      { id: 3, handledAt: null },
    ])
    expect(withHandled(notes, [2], false, 'NOW')[1]).toEqual({ id: 2, handledAt: null })
  })
})
