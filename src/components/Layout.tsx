import { useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { classTint, initials } from '../lib/fun'
import { useTheme } from '../lib/theme'
import { DoodleField } from './Doodles'
import { Avatar } from './ui'

export function Layout({ children }: { children: ReactNode }) {
  const { profile, isTeacher, signOut } = useAuth()
  const [theme, setTheme] = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)

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
          <NavLink to={isTeacher ? '/teach' : '/'} className="mark" aria-label="Chalkline home">
            Chalk<span>line</span>
          </NavLink>
          <nav aria-label="Main" className="nav">
            {isTeacher ? (
              <NavLink to="/teach" end>Classes &amp; courses</NavLink>
            ) : (
              <>
                <NavLink to="/" end>Assignments</NavLink>
                <NavLink to="/progress">My progress</NavLink>
                <NavLink to="/join">Join a class</NavLink>
              </>
            )}
          </nav>
          <div className="account">
            <button
              type="button"
              className="themebtn"
              aria-label="Dark chalkboard theme"
              aria-pressed={theme === 'dark'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </button>
            <Avatar text={initials(profile?.full_name, profile?.email)} tint={classTint(profile?.id ?? '')} />
            <span className="who" title={profile?.email}>
              {profile?.full_name || profile?.email}
              {isTeacher && <span className="role">Teacher</span>}
            </span>
            <button
              type="button"
              className="linkish"
              onClick={() => void signOut().then(() => navigate('/signin', { replace: true }))}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        {children}
      </main>
    </>
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
        <ul className="gate__perks">
          <li>
            <span aria-hidden="true">🎬</span> Bite-sized videos
          </li>
          <li>
            <span aria-hidden="true">🧠</span> Quick self-checks
          </li>
          <li>
            <span aria-hidden="true">💬</span> Ask what confused you
          </li>
        </ul>
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
