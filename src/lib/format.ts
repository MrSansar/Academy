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

export function pct(value: number | null | undefined): string {
  return `${Math.floor(value ?? 0)}%`
}
