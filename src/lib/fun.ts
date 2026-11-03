/**
 * Small bits of personality for the student side: greetings, cheers, class colours.
 * Everything here is about the student's own work. Nothing compares students with each other.
 */

/** "Good morning", "Good afternoon", … for the viewer's local hour. */
export function greeting(hour: number): string {
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 22) return 'Good evening'
  return 'Still up'
}

const CHEERS = ['Nailed it!', 'Spot on!', 'Yes! That’s it.', 'Exactly right.', 'You got it!', 'Correct!'] as const
const NUDGES = ['Not quite.', 'Close, but no.', 'Almost.', 'Not this one.'] as const
const COMPLETE = ['That’s a wrap!', 'Done and dusted!', 'Lesson in the bag!', 'Nice work!'] as const

/** Deterministic pick so a given question always gets the same line (stable across re-renders). */
function pick<T>(list: readonly T[], seed: string): T {
  return list[hashString(seed) % list.length]
}

export const cheerFor = (seed: string) => pick(CHEERS, seed)
export const nudgeFor = (seed: string) => pick(NUDGES, seed)
export const completeLineFor = (seed: string) => pick(COMPLETE, seed)

/** Short study tip, one per day so it doesn't change on every reload. */
const TIPS = [
  'Pause and predict what comes next before you press play again.',
  'Watching at 1.25× is fine. Rewinding the tricky bit is better.',
  'Write down one question to ask in class.',
  'Explain the idea out loud to an imaginary friend. If you stumble, rewatch that part.',
  'Click a line in the transcript to jump straight to that moment.',
  'Confused? Say so in the sticky note under the video. Your teacher reads them.',
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

/** Highlighter colours a class can be marked with. Names match `.hl--*` in styles.css. */
export const CLASS_TINTS = ['yellow', 'pink', 'blue', 'green', 'orange', 'violet'] as const
export type ClassTint = (typeof CLASS_TINTS)[number]

export function classTint(classId: string): ClassTint {
  return CLASS_TINTS[hashString(classId) % CLASS_TINTS.length]
}

/** A small, stable tilt in degrees (for stickers and notes), so things look placed by hand. */
export function tilt(seed: string, max = 6): number {
  return (hashString(seed) % (2 * max * 10 + 1)) / 10 - max
}
