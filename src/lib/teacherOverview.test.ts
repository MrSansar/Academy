import { describe, expect, it } from 'vitest'
import {
  cellKind,
  classQuizByStudent,
  classesForNote,
  needsAttention,
  rowStats,
  unassignedLessons,
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
  courseLessons: [L('l0'), L('l1'), L('l2'), L('l3')],
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

describe('unassignedLessons', () => {
  it('lists course lessons that no assignment of the class includes', () => {
    expect(unassignedLessons(cls).map((l) => l.id)).toEqual(['l3'])
  })
  it('is empty when every lesson is assigned', () => {
    expect(unassignedLessons({ ...cls, courseLessons: [L('l1')] })).toEqual([])
  })
})

describe('cellKind', () => {
  const due = iso(30 * HOUR)
  it('done before class, or late after it', () => {
    expect(cellKind({ completed_at: iso(-HOUR) }, due, now)).toBe('done')
    expect(cellKind({ completed_at: iso(31 * HOUR) }, due, now + 40 * HOUR)).toBe('late')
  })
  it('missed once class has started without finishing', () => {
    expect(cellKind(undefined, iso(-HOUR), now)).toBe('missed')
    expect(cellKind({ completed_at: null }, iso(-HOUR), now)).toBe('missed')
  })
  it('started, soon (within 3 days) or not opened yet', () => {
    expect(cellKind({ completed_at: null }, due, now)).toBe('progress')
    expect(cellKind(undefined, due, now)).toBe('soon')
    expect(cellKind(undefined, iso(100 * HOUR), now)).toBe('todo')
  })
})

describe('rowStats', () => {
  const quiz = classQuizByStudent(
    [
      { id: 'q1', lesson_id: 'l1' },
      { id: 'q2', lesson_id: 'l1' },
      { id: 'q9', lesson_id: 'elsewhere' },
    ],
    [
      { question_id: 'q1', student_id: 'ana', is_correct: false, created_at: iso(-3 * HOUR) },
      { question_id: 'q1', student_id: 'ana', is_correct: true, created_at: iso(-2 * HOUR) },
      { question_id: 'q2', student_id: 'ana', is_correct: true, created_at: iso(-2 * HOUR) },
      { question_id: 'q9', student_id: 'ana', is_correct: true, created_at: iso(-2 * HOUR) },
    ],
    ['ana', 'ben'],
  )
  const p = prog([
    { student_id: 'ana', lesson_id: 'l0', completed_at: iso(-47 * HOUR) }, // after the past class: late
    { student_id: 'ana', lesson_id: 'l1', completed_at: iso(-HOUR), last_watched_at: iso(-HOUR) },
    { student_id: 'ana', lesson_id: 'l2', percent_watched: 30 },
  ])
  const notes = [
    { studentId: 'ana', lessonId: 'l1', handledAt: null },
    { studentId: 'ana', lessonId: 'l1', handledAt: iso(-HOUR) },
    { studentId: 'ana', lessonId: 'zz', handledAt: null },
  ]

  it('counts done, late, missed and due-soon over the assignments shown', () => {
    const r = rowStats('ana', cls.assignments, p, quiz.get('ana'), notes, now)
    expect(r).toMatchObject({ assigned: 3, done: 2, late: 1, missed: 0, dueSoon: 1, openNotes: 1 })
    expect(r.lastActive).toBe(iso(-HOUR))
    expect(needsAttention(r)).toBe(true)
  })
  it('adds up first-try quiz results on the shown lessons only', () => {
    const r = rowStats('ana', cls.assignments, p, quiz.get('ana'), notes, now)
    expect(r.quiz).toEqual({ questions: 2, answered: 2, right: 1 })
    expect(rowStats('ben', cls.assignments, p, quiz.get('ben'), notes, now).quiz).toEqual({ questions: 2, answered: 0, right: 0 })
  })
  it('a student who opened nothing has missed the past lesson', () => {
    const r = rowStats('cy', cls.assignments, p, undefined, notes, now)
    expect(r).toMatchObject({ done: 0, missed: 1, dueSoon: 2, lastActive: null })
  })
  it('one assignment only', () => {
    const r = rowStats('ana', [cls.assignments[1]], p, quiz.get('ana'), notes, now)
    expect(r).toMatchObject({ assigned: 2, done: 1, late: 0, missed: 0 })
    expect(needsAttention(rowStats('ana', [cls.assignments[0]], p, undefined, [], now))).toBe(false)
  })
})
