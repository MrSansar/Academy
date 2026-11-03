import { describe, expect, it } from 'vitest'
import { CLASS_TINTS, cheerFor, classTint, greeting, initials, tipOfTheDay } from './fun'

describe('greeting', () => {
  it('follows the clock', () => {
    expect(greeting(8).text).toBe('Good morning')
    expect(greeting(13).text).toBe('Good afternoon')
    expect(greeting(19).text).toBe('Good evening')
    expect(greeting(23).emoji).toBe('🌙')
    expect(greeting(2).emoji).toBe('🌙')
  })
})

describe('initials', () => {
  it('uses first and last name', () => {
    expect(initials('Ada King Lovelace')).toBe('AL')
    expect(initials('  grace  ')).toBe('G')
  })
  it('falls back to the email, then a placeholder', () => {
    expect(initials('', 'sam@example.com')).toBe('S')
    expect(initials(null, null)).toBe('?')
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

describe('cheers and tips', () => {
  it('are deterministic', () => {
    expect(cheerFor('q1')).toBe(cheerFor('q1'))
    const d = new Date('2026-11-03T12:00:00Z')
    expect(tipOfTheDay(d)).toBe(tipOfTheDay(new Date('2026-11-03T13:00:00Z')))
  })
})
