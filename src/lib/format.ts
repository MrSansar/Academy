const dueFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const shortFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** "Thu, Oct 30, 9:00 AM" in the viewer's own time zone. */
export function formatDue(iso: string): string {
  return dueFormat.format(new Date(iso))
}

export function formatShort(iso: string | null | undefined): string {
  return iso ? shortFormat.format(new Date(iso)) : '—'
}

/** 0:05, 6:12, 1:02:03 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** "6 min", "45 sec" */
export function formatMinutes(totalSeconds: number): string {
  return totalSeconds < 60 ? `${Math.round(totalSeconds)} sec` : `${Math.round(totalSeconds / 60)} min`
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "in 3 hours", "tomorrow", "2 days ago" */
export function formatRelative(iso: string, now = Date.now()): string {
  const diffMin = (new Date(iso).getTime() - now) / 60000
  const abs = Math.abs(diffMin)
  if (abs < 60) return rtf.format(Math.round(diffMin), 'minute')
  if (abs < 48 * 60) return rtf.format(Math.round(diffMin / 60), 'hour')
  return rtf.format(Math.round(diffMin / 1440), 'day')
}

/** Value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

/** ABCD2345 -> ABCD-2345 */
export function formatJoinCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/** Watched share: rounds DOWN so 89.6% never shows as 90% (the completion mark). */
export function pct(value: number | null | undefined): string {
  return `${Math.floor(value ?? 0)}%`
}

/** Rates (e.g. right on the first try): nearest whole percent, so 2 of 3 is 67%. */
export function pctRound(value: number | null | undefined): string {
  return `${Math.round(value ?? 0)}%`
}

const timeOnly = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' })
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/** Whole calendar days from `a` to `b` in the viewer's time zone (0 = same day). */
export function calendarDaysBetween(a: Date, b: Date): number {
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((db - da) / 86_400_000)
}

/**
 * The one way the app writes a due time, in sentences and lists alike:
 * "today at 3:15 PM", "tomorrow at 9:00 AM", "yesterday at 9:00 AM", "on Friday at 3:15 PM",
 * "on Nov 20 at 3:15 PM".
 */
export function dayPhrase(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const days = calendarDaysBetween(now, d)
  const at = timeOnly.format(d)
  if (days === 0) return `today at ${at}`
  if (days === 1) return `tomorrow at ${at}`
  if (days === -1) return `yesterday at ${at}`
  if (days > 1 && days < 7) return `on ${weekdayLong.format(d)} at ${at}`
  return `on ${monthDay.format(d)} at ${at}`
}

/** Parts for a tear-off calendar page: { weekday: "Wed", day: "4", month: "Nov", time: "3:15 PM" }. */
export function calendarParts(iso: string) {
  const d = new Date(iso)
  return {
    weekday: weekdayShort.format(d),
    day: String(d.getDate()),
    month: monthShort.format(d),
    time: timeOnly.format(d),
  }
}

/** "Nov 4, 3:15 PM": a due time that fits in a table header. */
export function formatDueCompact(iso: string): string {
  const d = new Date(iso)
  return `${monthDay.format(d)}, ${timeOnly.format(d)}`
}
