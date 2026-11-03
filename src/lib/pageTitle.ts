import { useEffect } from 'react'

/** Sets the browser tab title, e.g. "Notes · Chalkline", so open tabs say where they are. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Chalkline` : 'Chalkline'
  }, [title])
}
