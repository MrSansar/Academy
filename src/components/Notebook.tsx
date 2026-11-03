/**
 * Hand-drawn pieces for the student "notebook" look. Shapes are deliberately a little wobbly.
 * All SVGs are decorative; meaning is always carried by text next to them.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { classTint, tilt } from '../lib/fun'
import { calendarParts } from '../lib/format'
import type { LessonStatus } from '../lib/types'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** A pen-drawn box: empty, started (one slash), or ticked. */
export function Checkbox({ status }: { status: LessonStatus }) {
  return (
    <svg className={`cbox cbox--${status}`} viewBox="0 0 28 26" aria-hidden="true" focusable="false">
      <path
        className="cbox__box"
        {...stroke}
        strokeWidth={1.8}
        d="M4.2 6.1c5-.9 10.4-1 15.6-.6.5 5 .6 9.9.1 14.9-5.1.6-10.3.7-15.4.2-.6-4.9-.7-9.6-.3-14.5z"
      />
      {status === 'in_progress' && <path className="cbox__slash" {...stroke} strokeWidth={2.2} d="M8 17.5L16.5 9" />}
      {status === 'complete' && (
        <path className="cbox__tick" {...stroke} strokeWidth={2.8} d="M7 13.5c1.6 1.4 3 3.2 4.1 5.3C14 12.6 18.6 6.6 25.5 1.8" />
      )}
    </svg>
  )
}

/** A big marking tick, drawn on when it appears. */
export function Tick({ className = '' }: { className?: string }) {
  return (
    <svg className={`tick ${className}`} viewBox="0 0 40 32" aria-hidden="true" focusable="false">
      <path {...stroke} strokeWidth={4} pathLength={1} d="M4 17c3.4 2.4 6.2 5.6 8.4 10C18 16.3 26 7.4 37 2.5" />
    </svg>
  )
}

/** A rubber stamp. `children` is the stamped word, so it is read out. */
export function Stamp({ children, seed, big = false }: { children: ReactNode; seed: string; big?: boolean }) {
  return (
    <span className={big ? 'stamp stamp--big' : 'stamp'} style={{ '--tilt': `${tilt(seed, 9) - 4}deg` } as CSSProperties}>
      {children}
    </span>
  )
}

/** A highlighter swipe behind a class name, in that class's colour. */
export function ClassMark({ id, name }: { id: string; name: string }) {
  return <span className={`hl hl--${classTint(id)}`}>{name}</span>
}

/** A tear-off calendar page for a due date. The full date is given in text elsewhere. */
export function DateTab({ iso }: { iso: string }) {
  const p = calendarParts(iso)
  return (
    <span className="datetab" aria-hidden="true">
      <span className="datetab__top">{p.weekday}</span>
      <span className="datetab__day">{p.day}</span>
      <span className="datetab__month">{p.month}</span>
    </span>
  )
}

/** A gold-star sticker (filled) or the empty spot waiting for one. */
export function StarSticker({ seed, state }: { seed: string; state: LessonStatus }) {
  const style = { '--tilt': `${tilt(seed, 14)}deg` } as CSSProperties
  return (
    <span className={`sticker sticker--${state}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <path
          strokeWidth={2.4}
          strokeLinejoin="round"
          d="M24 4.5l5.9 12.4 13.6 1.6-10 9.4 2.7 13.5L24 34.7l-12.2 6.7 2.7-13.5-10-9.4 13.6-1.6z"
        />
      </svg>
    </span>
  )
}

/** A loose pen arrow, pointing left, for margin notes. */
export function PenArrow({ className = '' }: { className?: string }) {
  return (
    <svg className={`penarrow ${className}`} viewBox="0 0 70 34" aria-hidden="true" focusable="false">
      <path {...stroke} strokeWidth={2.2} d="M66 6C52 4 34 10 18 24" />
      <path {...stroke} strokeWidth={2.2} d="M26 25.5L16 25.8l2.6-9.6" />
    </svg>
  )
}

/** Hand-drawn sun / moon for the theme switch. */
export function SunMoon({ dark }: { dark: boolean }) {
  return dark ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.2" {...stroke} strokeWidth={1.8} />
      <path
        {...stroke}
        strokeWidth={1.8}
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M5.2 18.8l1.6-1.6M17.2 6.8l1.6-1.6"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path {...stroke} strokeWidth={1.8} d="M19.5 14.6A8 8 0 019.4 4.5a8 8 0 1010.1 10.1z" />
    </svg>
  )
}

/** One lesson as a to-do line: box, title, dot leader, minutes. The whole line is the link. */
export function TodoRow({
  to,
  title,
  status,
  percent,
  meta,
}: {
  to: string
  title: string
  status: LessonStatus
  percent?: number | null
  meta: string
}) {
  return (
    <li>
      <Link to={to} className={`todo__row todo__row--${status}`}>
        <Checkbox status={status} />
        <span className="todo__title">{title}</span>
        <span className="todo__leader" aria-hidden="true" />
        <span className="todo__meta">
          {status === 'in_progress' && <span className="todo__pct">
              {Math.floor(percent ?? 0)}%<span className="todo__pct-word"> watched</span> ·{' '}
            </span>}
          {meta}
        </span>
        <span className="visually-hidden">
          {status === 'complete' ? ', complete' : status === 'not_opened' ? ', not started' : ''}
        </span>
      </Link>
    </li>
  )
}
