import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { formatClock } from '../lib/format'
import { COMPLETE_AT_PERCENT, mergeIntervals, percentCovered, toIntervals, type Interval } from '../lib/intervals'
import {
  alreadySaved,
  clearStash,
  readStash,
  saveProgress,
  saveProgressOnExit,
  writeStash,
} from '../lib/progressSaver'
import type { LessonProgress } from '../lib/types'
import { WatchTracker } from '../lib/watchTracker'
import { loadYouTubeApi, PlayerState, SPEEDS, type YTPlayer } from '../lib/youtube'
import { ProgressBar } from './ui'

const SAMPLE_MS = 250
const SAVE_EVERY_MS = 10_000
const SPEED_KEY = 'chalkline:speed'

export interface PlayerControls {
  seekTo: (seconds: number) => void
}

interface Props {
  lessonId: string
  youtubeId: string
  title: string
  durationSeconds: number
  /** Omit to preview without recording anything (teacher view, editor). */
  tracking?: { userId: string; initial: LessonProgress }
  onSaved?: (row: LessonProgress) => void
  onTime?: (seconds: number) => void
  onReady?: (controls: PlayerControls, durationSeconds: number) => void
}

function savedSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY))
    return (SPEEDS as readonly number[]).includes(v) ? v : 1
  } catch {
    return 1
  }
}

export function LessonPlayer({ lessonId, youtubeId, title, durationSeconds, tracking, onSaved, onTime, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const trackerRef = useRef(new WatchTracker())
  const serverRef = useRef<Interval[]>(toIntervals(tracking?.initial.watched_intervals))
  // Intervals handed to a save that the server has not confirmed yet (in flight, or sent on exit).
  const outboxRef = useRef<Interval[]>([])
  const savingRef = useRef(false)
  const durationRef = useRef(durationSeconds)

  const [percent, setPercent] = useState(() => Number(tracking?.initial.percent_watched ?? 0))
  const [duration, setDuration] = useState(durationSeconds)
  const [speed, setSpeed] = useState(savedSpeed)
  const [speeds, setSpeeds] = useState<number[]>([...SPEEDS])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState(false)
  const speedId = useId()

  // Keep the latest callbacks without re-creating the player.
  const cb = useRef({ onSaved, onTime, onReady, title })
  useEffect(() => {
    cb.current = { onSaved, onTime, onReady, title }
  })

  const userId = tracking?.userId
  const isTracking = Boolean(tracking)

  const recompute = useCallback(() => {
    const all = [...serverRef.current, ...outboxRef.current, ...trackerRef.current.snapshot()]
    setPercent(percentCovered(all, durationRef.current))
  }, [])

  const stash = useCallback(() => {
    if (!userId) return
    const p = playerRef.current
    writeStash(userId, lessonId, {
      intervals: mergeIntervals([...outboxRef.current, ...trackerRef.current.snapshot()]),
      duration: durationRef.current,
      position: p ? p.getCurrentTime() : null,
    })
  }, [userId, lessonId])

  /**
   * Sends unsaved intervals. `exit` uses a keepalive request that outlives the page; the
   * intervals stay in the outbox (and the local stash) until a normal save confirms them.
   */
  const flush = useCallback(
    async (mode: 'normal' | 'force' | 'exit') => {
      if (!userId) return
      const p = playerRef.current
      const tracker = trackerRef.current
      if (p && p.getPlayerState() === PlayerState.PLAYING) {
        tracker.sample(p.getCurrentTime(), performance.now(), p.getPlaybackRate())
      }
      outboxRef.current = mergeIntervals([...outboxRef.current, ...tracker.drain()])
      const payload = {
        lessonId,
        intervals: outboxRef.current,
        duration: p?.getDuration() || durationRef.current,
        position: p ? p.getCurrentTime() : null,
      }

      if (mode === 'exit') {
        stash()
        if (payload.intervals.length) saveProgressOnExit(payload)
        return
      }
      if (savingRef.current) return
      if (!payload.intervals.length && mode !== 'force') return

      savingRef.current = true
      const sent = outboxRef.current
      try {
        const row = await saveProgress(payload)
        serverRef.current = toIntervals(row.watched_intervals)
        if (outboxRef.current === sent) outboxRef.current = []
        setSaveError(false)
        cb.current.onSaved?.(row)
        if (outboxRef.current.length || tracker.snapshot().length) stash()
        else clearStash(userId, lessonId)
      } catch (err) {
        // CL429: the server's watch-rate check; the outbox is simply retried on the next save.
        if ((err as { code?: string }).code !== 'CL429') setSaveError(true)
        stash()
      } finally {
        savingRef.current = false
        recompute()
      }
    },
    [userId, lessonId, stash, recompute],
  )

  // Anything left in this browser from a previous visit (closed offline, crashed) goes out first.
  useEffect(() => {
    if (!userId) return
    const old = readStash(userId, lessonId)
    if (!old) return
    if (alreadySaved(serverRef.current, old.intervals)) clearStash(userId, lessonId)
    else {
      outboxRef.current = mergeIntervals([...outboxRef.current, ...old.intervals])
      void flush('force')
    }
  }, [userId, lessonId, flush])

  // Create the YouTube player.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let player: YTPlayer | null = null
    // YouTube replaces this element with its iframe, so React must not own it.
    const mount = document.createElement('div')
    host.appendChild(mount)

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return
        player = new YT.Player(mount, {
          videoId: youtubeId,
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: {
            cc_load_policy: 1, // captions on by default
            cc_lang_pref: 'en',
            hl: 'en',
            rel: 0,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return
              const p = e.target
              playerRef.current = p
              p.getIframe().title = `Video: ${cb.current.title}`
              const d = p.getDuration()
              if (d > 0) {
                durationRef.current = d
                setDuration(d)
              }
              const available = p.getAvailablePlaybackRates?.() ?? []
              const allowed = SPEEDS.filter((s) => available.length === 0 || available.includes(s))
              setSpeeds(allowed)
              const preferred = savedSpeed()
              if (preferred !== 1 && allowed.includes(preferred as (typeof SPEEDS)[number])) p.setPlaybackRate(preferred)
              setReady(true)
              recompute()
              cb.current.onReady?.(
                {
                  seekTo: (s) => {
                    p.seekTo(s, true)
                    p.playVideo()
                  },
                },
                durationRef.current,
              )
            },
            onStateChange: (e) => {
              const p = e.target
              const t = trackerRef.current
              if (e.data === PlayerState.PLAYING) {
                t.sample(p.getCurrentTime(), performance.now(), p.getPlaybackRate())
                return
              }
              if (t.isTracking) t.stop(p.getCurrentTime(), performance.now(), p.getPlaybackRate())
              if (e.data === PlayerState.PAUSED || e.data === PlayerState.ENDED) void flush('force')
              recompute()
            },
            onPlaybackRateChange: (e) => setSpeed(e.data),
            onError: (e) => {
              const code = e.data
              setError(
                code === 101 || code === 150
                  ? 'The video owner doesn’t allow this video to play here.'
                  : code === 100
                    ? 'This video was not found. It may be private or removed.'
                    : 'The video could not be played.',
              )
            },
          },
        })
      })
      .catch((err: Error) => setError(err.message))

    return () => {
      cancelled = true
      // Leaving the lesson inside the app: send what we have (keepalive), then tear down.
      void flush('exit')
      playerRef.current = null
      try {
        player?.destroy()
      } catch {
        // player was never fully created
      }
      mount.remove()
    }
  }, [youtubeId, flush, recompute])

  // Sample playback, update the meter, and save every ~10 s.
  useEffect(() => {
    let ticks = 0
    const sampler = window.setInterval(() => {
      const p = playerRef.current
      if (!p) return
      const t = p.getCurrentTime()
      if (p.getPlayerState() === PlayerState.PLAYING) {
        trackerRef.current.sample(t, performance.now(), p.getPlaybackRate())
        if (++ticks % 4 === 0) {
          recompute()
          stash()
        }
      }
      cb.current.onTime?.(t)
    }, SAMPLE_MS)
    const saver = isTracking ? window.setInterval(() => void flush('normal'), SAVE_EVERY_MS) : 0
    return () => {
      window.clearInterval(sampler)
      if (saver) window.clearInterval(saver)
    }
  }, [isTracking, flush, recompute, stash])

  // Save when the tab is hidden or closed.
  useEffect(() => {
    if (!isTracking) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush('exit')
    }
    const onPageHide = () => void flush('exit')
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [isTracking, flush])

  function changeSpeed(value: number) {
    setSpeed(value)
    playerRef.current?.setPlaybackRate(value)
    try {
      localStorage.setItem(SPEED_KEY, String(value))
    } catch {
      // not remembered, still applied
    }
  }

  const resumeAt = Number(tracking?.initial.last_position ?? 0)
  const complete = percent >= COMPLETE_AT_PERCENT
  const canResume = isTracking && !complete && resumeAt > 5 && resumeAt < duration - 10

  return (
    <div className="player">
      <div className="stage" ref={hostRef}>
        {!ready && !error && <div className="stage__msg">Loading video…</div>}
        {error && (
          <div className="stage__msg" role="alert">
            <p>{error}</p>
            <a href={`https://www.youtube.com/watch?v=${youtubeId}`} target="_blank" rel="noopener noreferrer">
              Open on YouTube
            </a>
          </div>
        )}
      </div>

      <div className="player__bar">
        <div className="speed">
          <label htmlFor={speedId}>Speed</label>
          <select id={speedId} value={speed} disabled={!ready} onChange={(e) => changeSpeed(Number(e.target.value))}>
            {speeds.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </div>
        {canResume && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={!ready}
            onClick={() => {
              playerRef.current?.seekTo(resumeAt, true)
              playerRef.current?.playVideo()
            }}
          >
            Resume at {formatClock(resumeAt)}
          </button>
        )}
        {isTracking ? (
          <div className="watched">
            <p className="watched__text" aria-live="polite">
              {complete ? (
                <strong className="ok">✓ Complete</strong>
              ) : (
                <>
                  <strong>{Math.floor(percent)}%</strong> watched
                </>
              )}
              <span className="muted"> · counts as done at {COMPLETE_AT_PERCENT}%</span>
            </p>
            <ProgressBar value={percent} label="Unique video watched" />
          </div>
        ) : (
          <p className="muted watched">Preview: viewing isn’t recorded.</p>
        )}
      </div>
      {saveError && (
        <p className="warn-note" role="status">
          Couldn’t save just now. Your progress is kept on this device and will be sent when you’re back online.
        </p>
      )}
    </div>
  )
}
