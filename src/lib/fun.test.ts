import { describe, expect, it } from 'vitest'
import { calendarDaysBetween, dayPhrase } from './format'
import { CLASS_TINTS, cheerFor, classTint, greeting, tilt, tipOfTheDay } from './fun'

describe('greeting', () => {
  it('follows the clock', () => {
    expect(greeting(8)).toBe('Good morning')
    expect(greeting(13)).toBe('Good afternoon')
    expect(greeting(19)).toBe('Good evening')
    expect(greeting(23)).toBe('Still up')
    expect(greeting(2)).toBe('Still up')
  })
})

describe('classTint', () => {
  it('is stable and from the palette', () => {
    const t = classTint('2b7c1f5e-0000-4000-8000-000000000001')
    expect(CLASS_TINTS).toContain(t)
    expect(classTint('2b7c1f5e-0000-4000-8000-000000000001')).toBe(t)
  })
  it('spreads ids over several colours', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => classTint(`class-${i}`)))
    expect(seen.size).toBeGreaterThan(3)
  })
})

describe('tilt', () => {
  it('stays within the limit and is stable', () => {
    for (let i = 0; i < 50; i++) {
      const t = tilt(`s${i}`, 4)
      expect(Math.abs(t)).toBeLessThanOrEqual(4)
      expect(tilt(`s${i}`, 4)).toBe(t)
    }
  })
})

describe('cheers and tips', () => {
  it('are deterministic', () => {
    expect(cheerFor('q1')).toBe(cheerFor('q1'))
    expect(tipOfTheDay(new Date('2026-11-03T12:00:00Z'))).toBe(tipOfTheDay(new Date('2026-11-03T13:00:00Z')))
  })
})

describe('dayPhrase', () => {
  const now = new Date(2026, 10, 3, 9, 0) // Tue Nov 3, local time
  it('says today / tomorrow with a time', () => {
    expect(dayPhrase(new Date(2026, 10, 3, 15, 15).toISOString(), now)).toMatch(/^today at /)
    expect(dayPhrase(new Date(2026, 10, 4, 0, 30).toISOString(), now)).toMatch(/^tomorrow at /)
  })
  it('uses the weekday within a week, then the date', () => {
    expect(dayPhrase(new Date(2026, 10, 6, 10, 0).toISOString(), now)).toMatch(/^on \S+day$/)
    expect(dayPhrase(new Date(2026, 10, 20, 10, 0).toISOString(), now)).toMatch(/^on \D+ 20$/)
  })
  it('counts calendar days, not 24-hour blocks', () => {
    expect(calendarDaysBetween(new Date(2026, 10, 3, 23, 50), new Date(2026, 10, 4, 0, 10))).toBe(1)
  })
})
