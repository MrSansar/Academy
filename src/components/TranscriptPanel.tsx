import { useEffect, useMemo, useRef } from 'react'
import { formatClock } from '../lib/format'
import { activeCueIndex, parseTranscript } from '../lib/transcript'

interface Props {
  raw: string
  currentTime: number
  onSeek: (seconds: number) => void
}

export function TranscriptPanel({ raw, currentTime, onSeek }: Props) {
  const cues = useMemo(() => parseTranscript(raw), [raw])
  const active = activeCueIndex(cues, currentTime)
  const listRef = useRef<HTMLOListElement>(null)

  // Keep the current line visible inside the panel without scrolling the page.
  useEffect(() => {
    const list = listRef.current
    const el = list?.children[active] as HTMLElement | undefined
    if (!list || !el) return
    const top = el.offsetTop - list.offsetTop
    if (top < list.scrollTop || top + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: Math.max(0, top - list.clientHeight / 3), behavior: 'smooth' })
    }
  }, [active])

  if (cues.length === 0) return null

  return (
    <section className="transcript" aria-labelledby="transcript-h">
      <h2 id="transcript-h">Transcript</h2>
      <p className="hint">Select a line to jump to that point in the video.</p>
      <ol ref={listRef}>
        {cues.map((c, i) => (
          <li key={`${c.start}-${i}`}>
            <button
              type="button"
              className={i === active ? 'cue cue--active' : 'cue'}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => onSeek(c.start)}
            >
              <span className="cue__time">{formatClock(c.start)}</span> <span>{c.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
