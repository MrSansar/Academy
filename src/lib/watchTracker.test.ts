import { describe, expect, it } from 'vitest'
import { coveredSeconds, mergeIntervals, newSeconds, percentCovered } from './intervals'
import { WatchTracker } from './watchTracker'

/** Feeds the tracker samples every `stepMs` of wall time while playing at `rate`. */
function play(t: WatchTracker, from: number, to: number, rate: number, startWall: number, stepMs = 250) {
  let wall = startWall
  for (let v = from; v <= to + 1e-9; v += (stepMs / 1000) * rate) {
    t.sample(v, wall, rate)
    wall += stepMs
  }
  return wall
}

describe('mergeIntervals', () => {
  it('merges overlapping and touching intervals and sorts them', () => {
    expect(mergeIntervals([[5, 8], [0, 2], [2, 3], [7, 10], [20, 20]])).toEqual([[0, 3], [5, 10]])
  })

  it('counts overlapping seconds once', () => {
    expect(coveredSeconds([[0, 10], [5, 15], [5, 15]])).toBe(15)
    expect(percentCovered([[0, 54]], 60)).toBe(90)
    expect(newSeconds([[0, 10]], [[5, 12]])).toBe(2)
  })
})

describe('WatchTracker', () => {
  it('records continuous playback as one interval', () => {
    const t = new WatchTracker()
    play(t, 0, 30, 1, 0)
    t.stop()
    expect(t.drain()).toEqual([[0, 30]])
  })

  it('does not count a forward seek', () => {
    const t = new WatchTracker()
    const wall = play(t, 0, 20, 1, 0)
    // user drags the scrubber from 20s to 80s, then keeps watching to 90s
    play(t, 80, 90, 1, wall)
    t.stop()
    const got = t.drain()
    expect(got).toEqual([[0, 20], [80, 90]])
    expect(coveredSeconds(got)).toBe(30)
  })

  it('counts each second once at 2x speed', () => {
    const t = new WatchTracker()
    play(t, 0, 60, 2, 0)
    t.stop()
    expect(coveredSeconds(t.drain())).toBeCloseTo(60, 5)
  })

  it('counts rewatched seconds once', () => {
    const t = new WatchTracker()
    const wall = play(t, 0, 40, 1, 0)
    play(t, 10, 30, 1.5, wall) // jump back and rewatch faster
    t.stop()
    expect(t.drain()).toEqual([[0, 40]])
  })

  it('keeps the open interval running across a drain', () => {
    const t = new WatchTracker()
    const wall = play(t, 0, 10, 1, 0)
    const first = t.drain()
    play(t, 10.25, 20, 1, wall)
    t.stop()
    expect(mergeIntervals([...first, ...t.drain()])).toEqual([[0, 20]])
  })

  it('tolerates throttled timers in a background tab', () => {
    const t = new WatchTracker()
    // samples arrive once per second instead of every 250 ms
    play(t, 0, 30, 1, 0, 1000)
    t.stop()
    expect(t.drain()).toEqual([[0, 30]])
  })

  it('restores intervals after a failed save', () => {
    const t = new WatchTracker()
    play(t, 0, 5, 1, 0)
    t.stop()
    const sent = t.drain()
    t.restore(sent)
    expect(t.snapshot()).toEqual([[0, 5]])
  })
})
