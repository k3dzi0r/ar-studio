import { useEffect, useState } from 'react'

interface InstallEvent extends Event {
  prompt(): Promise<void>
}

/** Asks the browser not to evict IndexedDB (the user's whole library) under storage pressure. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch { /* best effort */ }
}

export function useInstallPrompt() {
  const [ev, setEv] = useState<InstallEvent | null>(null)
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent) }
    const done = () => setEv(null)
    window.addEventListener('beforeinstallprompt', on)
    window.addEventListener('appinstalled', done)
    return () => {
      window.removeEventListener('beforeinstallprompt', on)
      window.removeEventListener('appinstalled', done)
    }
  }, [])
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  const iosSafari = /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone
  return { canInstall: !!ev, install: () => ev?.prompt().then(() => setEv(null)), iosSafari, standalone }
}
