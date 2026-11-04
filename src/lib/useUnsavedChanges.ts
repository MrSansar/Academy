import { useEffect } from 'react'

const MESSAGE = 'You have unsaved changes. Leave without saving?'

/**
 * While `dirty`, warn before the tab closes or reloads, and before an in-app link (`#/…`) is
 * followed. The app uses a plain HashRouter, which has no navigation blocker, so links are
 * caught in the capture phase, before React Router sees the click.
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // older browsers need this to show their prompt
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as Element | null)?.closest?.('a[href^="#/"]')
      if (!link || link.getAttribute('target') === '_blank') return
      if (!window.confirm(MESSAGE)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])
}
