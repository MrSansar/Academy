/**
 * Small bits of personality for the student side: greetings, cheers, class colours.
 * Everything here is about the student's own work. Nothing compares students with each other.
 */

/** "Good morning", "Good afternoon", … for the viewer's local hour. */
export function greeting(hour: number): { text: string; emoji: string } {
  if (hour < 5) return { text: 'Burning the midnight chalk', emoji: '🌙' }
  if (hour < 12) return { text: 'Good morning', emoji: '☀️' }
  if (hour < 17) return { text: 'Good afternoon', emoji: '🌤️' }
  if (hour < 22) return { text: 'Good evening', emoji: '🌆' }
  return { text: 'Late-night study session', emoji: '🌙' }
}

const CHEERS = ['Nailed it!', 'Spot on!', 'Yes! That’s it.', 'Exactly right.', 'You got it!', 'Correct!'] as const
const NUDGES = ['Not quite.', 'Close, but no.', 'Almost.', 'Not this one.'] as const
const COMPLETE = ['Lesson complete!', 'Done and dusted!', 'That’s a wrap!', 'Lesson in the bag!'] as const

/** Deterministic pick so a given question always gets the same line (stable across re-renders). */
function pick<T>(list: readonly T[], seed: string): T {
  return list[hashString(seed) % list.length]
}

export const cheerFor = (seed: string) => pick(CHEERS, seed)
export const nudgeFor = (seed: string) => pick(NUDGES, seed)
export const completeLineFor = (seed: string) => pick(COMPLETE, seed)

/** Short tip for the home page, one per day so it doesn't flicker on reload. */
const TIPS = [
  'Pause and predict what comes next before you hit play again.',
  'Watching at 1.25× is fine. Rewinding the tricky bit is better.',
  'Write down one question to ask in class.',
  'Explain the idea out loud to an imaginary friend. If you stumble, rewatch that part.',
  'Click a transcript line to jump straight to that moment.',
  'Got confused? Tell your teacher in the “What was confusing?” box. It really helps.',
  'Short breaks between lessons help ideas stick.',
] as const

export function tipOfTheDay(date: Date): string {
  const day = Math.floor(date.getTime() / 86_400_000)
  return TIPS[((day % TIPS.length) + TIPS.length) % TIPS.length]
}

/** FNV-1a, enough to spread ids over a small palette. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Chalk colours a class can be tinted with. Names match `.tint--*` in styles.css. */
export const CLASS_TINTS = ['yellow', 'pink', 'blue', 'mint', 'orange', 'violet'] as const
export type ClassTint = (typeof CLASS_TINTS)[number]

export function classTint(classId: string): ClassTint {
  return CLASS_TINTS[hashString(classId) % CLASS_TINTS.length]
}

/** "Ada Lovelace" -> "AL", "ada@example.com" -> "A". */
export function initials(name: string | null | undefined, email?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  if (words.length === 1) return words[0][0].toUpperCase()
  return (email?.trim()[0] ?? '?').toUpperCase()
}
