import { mergeIntervals, type Interval } from './intervals'

/**
 * Turns a stream of "the player is playing and is at time t" samples into intervals of
 * video that were actually played.
 *
 * Each sample is compared with the previous one. If the video time moved forward by
 * about as much as the wall clock (times playback speed) allows, the open interval is
 * extended. A larger forward jump is a seek, so the skipped part is not counted; any
 * backward jump starts a new interval. Intervals are in video time, so watching at 2x
 * or rewatching a part never counts a second twice once they are merged.
 */
export class WatchTracker {
  private segStart: number | null = null
  private lastTime = 0
  private lastWall = 0
  private pending: Interval[] = []

  /** Seconds of slack allowed on top of the expected advance before calling it a seek. */
  private readonly slack: number

  constructor(slackSeconds = 1) {
    this.slack = slackSeconds
  }

  /** Call regularly (e.g. every 250 ms) while the player state is PLAYING. */
  sample(videoTime: number, wallMs: number, rate: number): void {
    if (!Number.isFinite(videoTime)) return
    if (this.segStart === null) {
      this.segStart = videoTime
    } else if (!this.isContinuous(videoTime, wallMs, rate)) {
      this.closeSegment()
      this.segStart = videoTime
    }
    this.lastTime = videoTime
    this.lastWall = wallMs
  }

  /**
   * Call when playback stops (pause, end, buffering, leaving the page). If the final
   * time follows on from the last sample, the interval is extended up to it.
   */
  stop(videoTime?: number, wallMs?: number, rate = 1): void {
    if (
      this.segStart !== null &&
      videoTime !== undefined &&
      wallMs !== undefined &&
      this.isContinuous(videoTime, wallMs, rate)
    ) {
      this.lastTime = videoTime
    }
    this.closeSegment()
    this.segStart = null
  }

  /** Unsaved intervals, including the one still being played. */
  snapshot(): Interval[] {
    const open: Interval[] =
      this.segStart !== null && this.lastTime > this.segStart ? [[this.segStart, this.lastTime]] : []
    return mergeIntervals([...this.pending, ...open])
  }

  /** Hands over everything unsaved and clears it. The open interval keeps going. */
  drain(): Interval[] {
    const out = this.snapshot()
    this.pending = []
    if (this.segStart !== null) this.segStart = this.lastTime
    return out
  }

  /** Puts intervals back after a failed save. */
  restore(intervals: readonly Interval[]): void {
    this.pending = mergeIntervals([...this.pending, ...intervals])
  }

  get isTracking(): boolean {
    return this.segStart !== null
  }

  private isContinuous(videoTime: number, wallMs: number, rate: number): boolean {
    const advanced = videoTime - this.lastTime
    const expected = (Math.max(0, wallMs - this.lastWall) / 1000) * Math.max(rate, 0.25)
    return advanced >= -0.05 && advanced <= expected * 1.25 + this.slack
  }

  private closeSegment(): void {
    if (this.segStart !== null && this.lastTime > this.segStart) {
      this.pending = mergeIntervals([...this.pending, [this.segStart, this.lastTime]])
    }
  }
}
