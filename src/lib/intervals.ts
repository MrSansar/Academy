/** A played stretch of video, [start, end] in video seconds. */
export type Interval = [number, number]

/** Sorts and merges overlapping or touching intervals. Drops empty or invalid ones. */
export function mergeIntervals(list: readonly Interval[]): Interval[] {
  const sorted = list
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .map(([s, e]): Interval => [Math.max(0, s), e])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])

  const out: Interval[] = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

/** Total seconds covered, counting overlaps once. */
export function coveredSeconds(list: readonly Interval[], duration = Infinity): number {
  return mergeIntervals(list).reduce((sum, [s, e]) => sum + Math.max(0, Math.min(e, duration) - s), 0)
}

/** Percent of `duration` covered, 0–100. */
export function percentCovered(list: readonly Interval[], duration: number): number {
  if (!(duration > 0)) return 0
  return Math.min(100, (coveredSeconds(list, duration) / duration) * 100)
}

/** Seconds of `extra` not already covered by `base`. */
export function newSeconds(base: readonly Interval[], extra: readonly Interval[]): number {
  return coveredSeconds([...base, ...extra]) - coveredSeconds(base)
}

/** Parses a JSON value stored by the database into intervals, ignoring anything malformed. */
export function toIntervals(value: unknown): Interval[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((pair): Interval[] =>
    Array.isArray(pair) && typeof pair[0] === 'number' && typeof pair[1] === 'number'
      ? [[pair[0], pair[1]]]
      : [],
  )
}

export const COMPLETE_AT_PERCENT = 90
