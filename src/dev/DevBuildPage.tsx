import { useState } from 'react'
import { buildAll } from './buildLibrary'

/** Dev only (/#/dev/build-library): regenerates public/library/*.arpack. */
export default function DevBuildPage() {
  const [lines, setLines] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { await buildAll((s) => setLines((l) => [...l, s])) }
    catch (e) { setLines((l) => [...l, `BŁĄD: ${e instanceof Error ? e.stack : e}`]) }
    setBusy(false)
  }
  return (
    <div className="page">
      <h1>Build library</h1>
      <button className="btn primary" disabled={busy} onClick={run}>Generuj paczki</button>
      <pre id="log">{lines.join('\n')}</pre>
    </div>
  )
}
