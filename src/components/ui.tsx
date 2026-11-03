import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { pct } from '../lib/format'
import type { AssignmentStatus, LessonStatus } from '../lib/types'

export function Loading({ label = 'Loading', full = false }: { label?: string; full?: boolean }) {
  return (
    <div className={full ? 'loading loading--full' : 'loading'} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}…
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="error" role="alert">
      {children}
    </p>
  )
}

const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
}

export function AssignmentBadge({ status }: { status: AssignmentStatus }) {
  return <span className={`badge badge--${status}`}>{ASSIGNMENT_LABEL[status]}</span>
}

export function LessonBadge({ status, percent }: { status: LessonStatus; percent?: number }) {
  if (status === 'complete') return <span className="badge badge--done">✓ Complete</span>
  if (status === 'in_progress') return <span className="badge badge--in_progress">{pct(percent)} watched</span>
  return <span className="badge badge--not_started">Not started</span>
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      className="pbar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(v)}
    >
      <div className="pbar__fill" style={{ width: `${v}%` }} />
      <div className="pbar__mark" style={{ left: '90%' }} aria-hidden="true" />
    </div>
  )
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }

export function Field({ label, hint, id, ...rest }: FieldProps) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <input id={fid} aria-describedby={hint ? `${fid}-hint` : undefined} {...rest} />
      {hint && (
        <p className="hint" id={`${fid}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode }

export function TextArea({ label, hint, id, ...rest }: AreaProps) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <textarea id={fid} aria-describedby={hint ? `${fid}-hint` : undefined} {...rest} />
      {hint && (
        <p className="hint" id={`${fid}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const id = useId()
  return (
    <div className="toggle">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </label>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="page narrow">
      <h1>Page not found</h1>
      <p className="muted">
        <a href="#/">Go to your home page</a>
      </p>
    </div>
  )
}
