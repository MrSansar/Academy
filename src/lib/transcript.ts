export interface Cue {
  start: number
  text: string
}

// 1:23, 01:23, 1:02:03, [1:23], (1:23), 00:01:23.456 (WebVTT/SRT, comma or dot)
const TIME = String.raw`\[?\(?(\d{1,2}:)?(\d{1,2}):(\d{2})(?:[.,]\d{1,3})?\]?\)?`
const LEADING_TIME = new RegExp(`^${TIME}(?:\\s*-->\\s*\\S+)?\\s*[-–—:]?\\s*(.*)$`)

function toSeconds(h: string | undefined, m: string, s: string): number {
  return (h ? parseInt(h, 10) * 3600 : 0) + parseInt(m, 10) * 60 + parseInt(s, 10)
}

/**
 * Parses a pasted transcript into timed cues. Accepts:
 *   "0:00 Welcome"            (time and text on one line)
 *   "0:00\nWelcome"           (YouTube's "Show transcript" copy: time line, then text)
 *   WebVTT / SRT cue blocks   (start time of each cue is used)
 * Lines before the first timestamp, cue numbers, and the WEBVTT header are ignored.
 */
export function parseTranscript(raw: string | null | undefined): Cue[] {
  if (!raw) return []
  const cues: Cue[] = []
  let current: Cue | null = null

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed === 'WEBVTT') continue
    const m = LEADING_TIME.exec(trimmed)
    if (m) {
      if (current?.text) cues.push(current)
      current = { start: toSeconds(m[1]?.slice(0, -1), m[2], m[3]), text: m[4].trim() }
    } else if (current) {
      if (/^\d+$/.test(trimmed)) continue // SRT cue number
      current.text = current.text ? `${current.text} ${trimmed}` : trimmed
    }
  }
  if (current?.text) cues.push(current)
  return cues.sort((a, b) => a.start - b.start)
}

/** Index of the cue playing at `time`, or -1 before the first cue. */
export function activeCueIndex(cues: readonly Cue[], time: number): number {
  let lo = 0
  let hi = cues.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid].start <= time) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}
