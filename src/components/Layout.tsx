import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { NOTES_CHANGED } from '../lib/teacherOverview'
import { useTheme } from '../lib/theme'
import { DoodleField } from './Doodles'
import { SunMoon } from './Notebook'

interface NavItem {
  to: string
  label: string
  /** Paths that belong to this section, so it stays highlighted on the pages inside it. */
  match: (path: string) => boolean
  badge?: number
}

const STUDENT_NAV: NavItem[] = [
  { to: '/', label: 'Assignments', match: (p) => p === '/' || p.startsWith('/lesson/') },
  { to: '/progress', label: 'My progress', match: (p) => p.startsWith('/progress') },
]

function teacherNav(openNotes: number): NavItem[] {
  return [
    {
      to: '/teach',
      label: 'Overview',
      match: (p) =>
        p === '/teach' || p === '/teach/' || p.startsWith('/teach/classes') || p.startsWith('/teach/assignments'),
    },
    {
      to: '/teach/courses',
      label: 'Lessons',
      match: (p) => p.startsWith('/teach/courses') || p.startsWith('/teach/lessons') || p.startsWith('/lesson/'),
    },
    { to: '/teach/notes', label: 'Notes', match: (p) => p.startsWith('/teach/notes'), badge: openNotes },
  ]
}

/**
 * How many notes are still open (not handled). Stored on the notes, so it is the same on every
 * device; re-checked on navigation and whenever a note is handled.
 */
function useOpenNotesCount(enabled: boolean, path: string): number {
  const [count, setCount] = useState(0)
  const [bump, setBump] = useState(0)
  useEffect(() => {
    const onChange = () => setBump((n) => n + 1)
    window.addEventListener(NOTES_CHANGED, onChange)
    return () => window.removeEventListener(NOTES_CHANGED, onChange)
  }, [])
  useEffect(() => {
    if (!enabled) return
    let active = true
    void supabase
      .from('confusion_notes')
      .select('id', { count: 'exact', head: true })
      .is('handled_at', null)
      .then(({ count: n }) => active && setCount(n ?? 0))
    return () => {
      active = false
    }
  }, [enabled, path, bump])
  return enabled ? count : 0
}

export function Layout({ children }: { children: ReactNode }) {
  const { isTeacher } = useAuth()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const openNotes = useOpenNotesCount(isTeacher, location.pathname)
  const items = isTeacher ? teacherNav(openNotes) : STUDENT_NAV
  // Teacher pages use a plain working style (teacher.css); a lesson preview keeps the student look.
  const teachArea = isTeacher && location.pathname.startsWith('/teach')
  useEffect(() => {
    const root = document.documentElement
    if (teachArea) root.dataset.area = 'teach'
    else delete root.dataset.area
    return () => {
      delete root.dataset.area
    }
  }, [teachArea])

  // Move focus to the page on navigation so screen-reader and keyboard users start at the top.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus() }}>
        Skip to content
      </a>
      <header className="bar">
        <div className="bar__in">
          <Link to={isTeacher ? '/teach' : '/'} className="mark" aria-label="Chalkline home">
            Chalk<span>line</span>
          </Link>
          <nav aria-label="Main" className="nav">
            {items.map((it) => {
              const here = it.match(location.pathname)
              return (
                <Link key={it.to} to={it.to} aria-current={here ? 'page' : undefined}>
                  {it.label}
                  {it.badge ? (
                    <span className="nav__badge">
                      {it.badge > 99 ? '99+' : it.badge}
                      <span className="visually-hidden"> open</span>
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </nav>
          <AccountMenu />
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        {children}
      </main>
    </>
  )
}

/** Name button that opens the less frequent things: join a class, theme, sign out. */
function AccountMenu() {
  const { profile, isTeacher, signOut } = useAuth()
  const [theme, setTheme] = useTheme()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const name = profile?.full_name || profile?.email || 'Account'

  // Close on outside click or Escape (and when an item is chosen, below).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="account" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="account__btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <svg className="account__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="account__name">{name}</span>
        {isTeacher && <span className="role">Teacher</span>}
        <svg className="account__caret" viewBox="0 0 12 8" aria-hidden="true" focusable="false">
          <path d="M1.5 1.5L6 6l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="visually-hidden"> account menu</span>
      </button>
      <div id={id} className="menu" hidden={!open}>
        <p className="menu__who">
          <strong>{name}</strong>
          {profile?.email && profile.email !== name && <span className="muted small">{profile.email}</span>}
        </p>
        <ul>
          {!isTeacher && (
            <li>
              <Link to="/join" onClick={() => setOpen(false)}>
                Join another class
              </Link>
            </li>
          )}
          <li>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              <SunMoon dark={theme === 'dark'} />
              {isTeacher ? 'Dark theme' : 'Dark chalkboard theme'}
              <span className="menu__state" aria-hidden="true">
                {theme === 'dark' ? 'On' : 'Off'}
              </span>
            </button>
          </li>
          <li>
            <button type="button" onClick={() => void signOut().then(() => navigate('/signin', { replace: true }))}>
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  )
}

/** Two-column sign-in layout reused by the auth pages. */
export function AuthLayout({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <main className="gate" id="main">
      <div className="gate__board">
        <DoodleField />
        <div className="mark">
          Chalk<span>line</span>
        </div>
        <div>
          <p className="gate__kicker">Before class</p>
          <h1 className="gate__title">
            Watch the short lessons. Come to class <span className="chalk-underline">ready.</span>
          </h1>
          <p className="gate__text">
            Your teacher assigns a few short videos before each class. Watch them here, check yourself, and tell your
            teacher what was confusing.
          </p>
        </div>
        <ol className="gate__steps" aria-label="How it works">
          <li>watch a few short videos</li>
          <li>check yourself</li>
          <li>come to class ready</li>
        </ol>
      </div>
      <div className="gate__form">
        <div className="form">
          <h2>{title}</h2>
          <div className="form__intro">{intro}</div>
          {children}
        </div>
      </div>
    </main>
  )
}
