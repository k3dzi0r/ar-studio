import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AmbientLight, Clock, DirectionalLight, HemisphereLight } from 'three'
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js'
import { mergeMind } from '../../core/recognition/compile'
import { getContentType, type ContentRuntime } from '../../core/render'
import { repo } from '../../core/storage/db'
import type { ARCard } from '../../core/types'

/** Practical ceiling for simultaneously *tracked* targets (detection is per frame). */
const MAX_TRACK = 3

interface CamChoice { facing: 'environment' | 'user'; deviceId?: string }
interface Problem { title: string; hint: string }

export function describeCameraError(e: unknown): Problem {
  const name = (e as { name?: string })?.name
  if (!window.isSecureContext)
    return { title: 'Kamera wymaga HTTPS', hint: 'Otwórz aplikację przez adres https:// (lub localhost).' }
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { title: 'Brak zgody na użycie kamery', hint: 'Zezwól na dostęp do kamery w ustawieniach przeglądarki dla tej strony, a następnie spróbuj ponownie.' }
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { title: 'Nie znaleziono kamery', hint: 'Podłącz kamerę lub wybierz inną.' }
    case 'NotReadableError':
    case 'AbortError':
      return { title: 'Kamera jest zajęta', hint: 'Zamknij inne aplikacje używające kamery i spróbuj ponownie.' }
    default:
      return { title: 'Nie udało się uruchomić kamery', hint: e instanceof Error ? e.message : 'Spróbuj ponownie.' }
  }
}

export default function ScannerPage() {
  const { id } = useParams()
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'scanning' | 'empty'>('loading')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [visible, setVisible] = useState<string[]>([])
  const [cam, setCam] = useState<CamChoice>({ facing: 'environment' })
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [menu, setMenu] = useState(false)
  const [retry, setRetry] = useState(0)
  const rts = useRef<ContentRuntime[]>([])
  const [hasSound, setHasSound] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)

  // Mobile browsers only allow sound after a user gesture: the first touch
  // (or the sound button) unlocks every media element.
  const unlock = async () => {
    await Promise.all(rts.current.map((r) => r.unlock()))
    rts.current.forEach((r) => r.setMuted(mutedRef.current))
    setUnlocked(true)
  }
  const toggleMute = async () => {
    const m = !mutedRef.current
    mutedRef.current = m
    setMuted(m)
    await unlock()
  }

  useEffect(() => {
    const container = host.current!
    let cancelled = false
    let mindar: MindARThree | null = null
    let started = false
    let url: string | null = null
    const runtimes: ContentRuntime[] = []
    rts.current = runtimes
    setUnlocked(false)
    setHasSound(false)
    setState('loading')
    setProblem(null)
    setVisible([])

    const cleanup = () => {
      cancelled = true
      if (mindar) {
        mindar.renderer.setAnimationLoop(null)
        if (started) { try { mindar.stop() } catch { /* already stopped */ } }
        mindar.renderer.dispose()
      }
      runtimes.forEach((r) => r.dispose())
      container.replaceChildren()
      if (url) URL.revokeObjectURL(url)
    }

    ;(async () => {
      // which cards
      let cards: ARCard[]
      if (id) {
        const c = await repo.getCard(id)
        cards = c ? [c] : []
      } else {
        const active = new Set((await repo.listCollections()).filter((c) => c.active).map((c) => c.id))
        cards = (await repo.listCards()).filter((c) => c.collectionIds.some((i) => active.has(i)))
      }
      if (cancelled) return
      if (cards.length === 0) return setState('empty')

      // pre-flight camera access: gives a *named* error (MindAR only rejects with undefined)
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Ta przeglądarka nie obsługuje dostępu do kamery.')
        const probe = await navigator.mediaDevices.getUserMedia({
          video: cam.deviceId ? { deviceId: { exact: cam.deviceId } } : { facingMode: cam.facing },
        })
        probe.getTracks().forEach((t) => t.stop())
        const all = await navigator.mediaDevices.enumerateDevices() // labels available after permission
        if (!cancelled) setDevices(all.filter((d) => d.kind === 'videoinput'))
      } catch (e) {
        if (!cancelled) setProblem(describeCameraError(e))
        return
      }
      if (cancelled) return

      // one merged .mind file for all active cards, index = position in `cards`
      const buffers: ArrayBuffer[] = []
      for (const c of cards) buffers.push(await (await repo.getAsset(c.mindAssetId))!.blob.arrayBuffer())
      url = URL.createObjectURL(new Blob([mergeMind(buffers) as BlobPart]))

      mindar = new MindARThree({
        container,
        imageTargetSrc: url,
        maxTrack: Math.min(cards.length, MAX_TRACK),
        uiLoading: 'no', uiScanning: 'no', uiError: 'no',
        userDeviceId: cam.facing === 'user' ? cam.deviceId ?? null : null,
        environmentDeviceId: cam.facing === 'environment' ? cam.deviceId ?? null : null,
      })
      mindar.shouldFaceUser = cam.facing === 'user'
      mindar.scene.add(new AmbientLight(0xffffff, 0.9), new HemisphereLight(0xffffff, 0x556677, 1.1))
      const sun = new DirectionalLight(0xffffff, 1.4)
      sun.position.set(0.5, 1, 2)
      mindar.scene.add(sun)

      const visibleSet = new Set<string>()
      const publish = () => setVisible([...visibleSet])

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        const anchor = mindar.addAnchor(i)
        const rts: ContentRuntime[] = []
        for (const item of card.contents) {
          const blob = item.assetId ? (await repo.getAsset(item.assetId))?.blob : undefined
          try {
            const rt = await getContentType(item.type).create(item, blob)
            rts.push(rt)
            runtimes.push(rt)
            anchor.group.add(rt.object)
          } catch (e) {
            console.error('content failed', item, e)
          }
        }
        anchor.onTargetFound = () => {
          rts.forEach((r) => r.onFound())
          visibleSet.add(card.name)
          publish()
          navigator.vibrate?.(30)
        }
        anchor.onTargetLost = () => {
          rts.forEach((r) => r.onLost())
          visibleSet.delete(card.name)
          publish()
        }
      }
      if (cancelled) return

      try {
        await mindar.start()
        started = true
      } catch (e) {
        if (!cancelled) setProblem(describeCameraError(e))
        return
      }
      if (cancelled) return

      const clock = new Clock()
      const m = mindar
      m.renderer.setAnimationLoop(() => {
        const dt = clock.getDelta()
        for (const r of runtimes) r.update(dt)
        m.renderer.render(m.scene, m.camera)
      })
      setHasSound(runtimes.some((r) => r.info.hasSound))
      runtimes.forEach((r) => r.setMuted(mutedRef.current))
      setState('scanning')
    })().catch((e) => {
      console.error(e)
      if (!cancelled) setProblem({ title: 'Błąd skanera', hint: e instanceof Error ? e.message : String(e) })
    })

    return cleanup
  }, [id, cam, retry])

  return (
    <div className="scanner" onPointerDown={() => { if (!unlocked) unlock() }}>
      <div className="scan-host" ref={host} />

      <div className="scan-top">
        <Link to="/" className="roundbtn" aria-label="Wróć">←</Link>
        <div className="row">
          <button className="roundbtn" aria-label="Przełącz kamerę"
            onClick={() => setCam((c) => ({ facing: c.facing === 'user' ? 'environment' : 'user' }))}>⟲</button>
          {hasSound && (
            <button className="roundbtn" aria-label={muted ? 'Włącz dźwięk' : 'Wyłącz dźwięk'}
              onClick={(e) => { e.stopPropagation(); toggleMute() }}>{muted ? '🔇' : '🔊'}</button>
          )}
          {devices.length > 1 && (
            <button className="roundbtn" aria-label="Wybierz kamerę" onClick={() => setMenu((m) => !m)}>▤</button>
          )}
        </div>
      </div>

      {menu && (
        <div className="cam-menu" role="menu">
          {devices.map((d, i) => (
            <button key={d.deviceId} role="menuitem"
              onClick={() => { setCam((c) => ({ ...c, deviceId: d.deviceId })); setMenu(false) }}>
              {d.label || `Kamera ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {state === 'loading' && !problem && <div className="scan-center"><div className="spinner" /><p>Uruchamiam kamerę…</p></div>}
      {state === 'scanning' && hasSound && !unlocked && !muted && (
        <div className="scan-sound">Dotknij ekranu, aby włączyć dźwięk</div>
      )}
      {state === 'scanning' && visible.length === 0 && (
        <div className="scan-hint"><span className="pulse" /> Skieruj kamerę na obraz</div>
      )}
      {state === 'scanning' && visible.length > 0 && <div className="scan-hint ok">✓ {visible.join(' · ')}</div>}

      {state === 'empty' && (
        <div className="scan-center">
          <h2>Brak kart do rozpoznania</h2>
          <p className="muted">Utwórz kartę albo włącz kolekcję w bibliotece.</p>
          <Link to="/" className="btn primary">Do biblioteki</Link>
        </div>
      )}
      {problem && (
        <div className="scan-center">
          <h2>{problem.title}</h2>
          <p className="muted">{problem.hint}</p>
          <div className="row">
            <button className="btn primary" onClick={() => setRetry((n) => n + 1)}>Spróbuj ponownie</button>
            <Link to="/" className="btn">Wróć</Link>
          </div>
        </div>
      )}
    </div>
  )
}
