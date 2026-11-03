import { useEffect, useState } from 'react'

/**
 * Light ("paper") or dark ("chalkboard") theme. index.html sets `data-theme` on <html> before the
 * app loads (stored choice, else the OS setting) so the first paint is already right.
 */
export type Theme = 'light' | 'dark'

const KEY = 'chalkline:theme'

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function system(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0a2a1f' : '#0F3D2E')
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? system())

  useEffect(() => apply(theme), [theme])

  // Follow the OS until the student picks a theme themselves.
  useEffect(() => {
    let mq: MediaQueryList
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return
    }
    const onChange = () => {
      if (!stored()) setTheme(mq.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return [
    theme,
    (t) => {
      try {
        localStorage.setItem(KEY, t)
      } catch {
        // still applied for this visit
      }
      setTheme(t)
    },
  ]
}
