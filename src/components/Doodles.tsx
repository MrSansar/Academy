/** Hand-drawn chalk doodles. Purely decorative, so always hidden from assistive tech. */

type DoodleProps = { className?: string }

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

export function Star({ className }: DoodleProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} {...common}>
      <path d="M24 5l5.6 12.2 13.2 1.4-9.9 8.9 2.8 13.1L24 34l-11.7 6.6 2.8-13.1-9.9-8.9 13.2-1.4z" />
    </svg>
  )
}

export function Squiggle({ className }: DoodleProps) {
  return (
    <svg viewBox="0 0 120 20" className={className} {...common} preserveAspectRatio="none">
      <path d="M3 12c9-9 15 7 24 0s15-9 24 0 15 7 24 0 15-9 24 0 12 6 18 1" />
    </svg>
  )
}

export function Lightbulb({ className }: DoodleProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} {...common}>
      <path d="M17 31c-4-3-6-7-6-11a13 13 0 0126 0c0 4-2 8-6 11v5H17z" />
      <path d="M18 41h12M21 45h6M24 2v3M6 8l2 2M42 8l-2 2" />
    </svg>
  )
}

export function Pencil({ className }: DoodleProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} {...common}>
      <path d="M8 40l3-10L33 8l7 7-22 22zM29 12l7 7M11 30l7 7" />
    </svg>
  )
}

export function Atom({ className }: DoodleProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} {...common}>
      <ellipse cx="24" cy="24" rx="20" ry="8" />
      <ellipse cx="24" cy="24" rx="20" ry="8" transform="rotate(60 24 24)" />
      <ellipse cx="24" cy="24" rx="20" ry="8" transform="rotate(120 24 24)" />
      <circle cx="24" cy="24" r="2" fill="currentColor" />
    </svg>
  )
}

/** Chalk doodles scattered across the sign-in board. */
export function DoodleField() {
  return (
    <div className="doodles" aria-hidden="true">
      <Star className="doodle doodle--1" />
      <Atom className="doodle doodle--2" />
      <Lightbulb className="doodle doodle--3" />
      <Pencil className="doodle doodle--4" />
      <Squiggle className="doodle doodle--5" />
      <Star className="doodle doodle--6" />
    </div>
  )
}
