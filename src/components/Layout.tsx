import { useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'

export function Layout({ children }: { children: ReactNode }) {
  const { profile, isTeacher, signOut } = useAuth()
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
        <div className="mark">
          Chalk<span>line</span>
        </div>
        <div>
          <p className="gate__kicker">Before class</p>
          <h1 className="gate__title">Watch the short lessons. Come to class ready.</h1>
          <p className="gate__text">
            Your teacher assigns a few short videos before each class. Watch them here, check yourself, and tell your
            teacher what was confusing.
          </p>
        </div>
        <div />
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
