import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getContentType, listContentTypes, type ContentRuntime } from '../../core/render'
import { compileTarget } from '../../core/recognition/compile'
import { repo, uid } from '../../core/storage/db'
import {
  DEFAULT_COLLECTION_ID,
  type ARCard,
  type AssetCredit,
  type ContentItem,
  type QualityReport,
} from '../../core/types'
import { QualityBadge } from '../../ui/QualityBadge'
import { useBlobUrl } from '../../ui/hooks'
import Stage from './Stage'
import AssetBrowser from './AssetBrowser'

type Draft = ContentItem & { blob?: Blob }

interface Target {
  image: Blob
  mind: Uint8Array | null // null = unchanged, keep stored mind
  aspect: number
  quality: QualityReport
}

export default function EditorPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [cardId] = useState(() => id ?? uid())
  const isNew = !id

  const [name, setName] = useState('')
  const [target, setTarget] = useState<Target | null>(null)
  const [contents, setContents] = useState<Draft[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAssets, setShowAssets] = useState(false)
  const [assetBusy, setAssetBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(isNew)
  const orig = useRef<ARCard | null>(null)
  const [runtimes, setRuntimes] = useState<Map<string, ContentRuntime>>(new Map())
  const building = useRef(new Set<string>())

  // ---- load existing card
  useEffect(() => {
    if (!id) return
    ;(async () => {
      const card = await repo.getCard(id)
      if (!card) return nav('/', { replace: true })
      orig.current = card
      const image = (await repo.getAsset(card.imageAssetId))!.blob
      setName(card.name)
      setTarget({ image, mind: null, aspect: card.aspect, quality: card.quality })
      const drafts: Draft[] = []
      for (const c of card.contents) {
        drafts.push({ ...c, blob: c.assetId ? (await repo.getAsset(c.assetId))?.blob : undefined })
      }
      setContents(drafts)
      setSelected(drafts[0]?.id ?? null)
      setLoaded(true)
    })()
  }, [id, nav])

  const imageUrl = useBlobUrl(target?.image) ?? undefined

  // ---- keep runtimes in sync with the draft list
  useEffect(() => {
    setRuntimes((prev) => {
      const next = new Map(prev)
      for (const [rid, rt] of prev)
        if (!contents.some((c) => c.id === rid)) {
          rt.dispose()
          next.delete(rid)
        }
      return next.size === prev.size ? prev : next
    })
    for (const c of contents) {
      if (runtimes.has(c.id) || building.current.has(c.id)) continue
      building.current.add(c.id)
      getContentType(c.type)
        .create(c, c.blob)
        .then((rt) => setRuntimes((m) => new Map(m).set(c.id, rt)))
        .catch((e) => {
          setError(`Nie udało się wczytać „${c.name}”: ${e instanceof Error ? e.message : e}`)
          setContents((cs) => cs.filter((x) => x.id !== c.id))
        })
        .finally(() => building.current.delete(c.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contents])

  // push edited transform / props into the live objects
  useEffect(() => {
    for (const c of contents) {
      const rt = runtimes.get(c.id)
      rt?.setTransform(c.transform)
      rt?.setProps(c.props)
    }
  }, [contents, runtimes])

  const runtimeList = useMemo(() => [...runtimes.values()], [runtimes])
  const rtLatest = useRef(runtimes)
  rtLatest.current = runtimes
  useEffect(() => () => rtLatest.current.forEach((r) => r.dispose()), [])

  // ---- step 1: image → target
  const onImage = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      setError(null)
      setProgress(0)
      try {
        const t = await compileTarget(file, setProgress)
        setTarget({ image: t.image, mind: t.mind, aspect: t.aspect, quality: t.quality })
        setName((n) => n || file.name.replace(/\.[^.]+$/, ''))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Nie udało się przygotować obrazu.')
      } finally {
        setProgress(null)
      }
    },
    [],
  )

  // ---- step 2: content
  const addContent = (type: string, file?: File, credit?: AssetCredit) => {
    const ct = getContentType(type)
    if (ct.accept && !file) return
    const item: Draft = {
      id: uid(),
      type,
      name: file?.name ?? ct.label,
      props: ct.defaultProps(),
      transform: ct.defaultTransform(),
      blob: file,
      credit,
    }
    // stack flat items (image/video/text) slightly apart so they don't z-fight
    if (ct.spatial && item.transform.position[2] > 0 && item.transform.position[2] < 0.1)
      item.transform.position[2] += 0.006 * contents.length
    setError(null)
    setContents((cs) => [...cs, item])
    setSelected(item.id)
  }
  const patch = (cid: string, fn: (c: Draft) => Draft) =>
    setContents((cs) => cs.map((c) => (c.id === cid ? fn(c) : c)))

  const [previewing, setPreviewing] = useState<Set<string>>(new Set())
  const togglePreview = async (cid: string, rt: ContentRuntime) => {
    const on = !previewing.has(cid)
    if (on) { await rt.unlock(); rt.onFound() } else rt.onLost()
    setPreviewing((p) => { const n = new Set(p); if (on) n.add(cid); else n.delete(cid); return n })
  }
  const sel = contents.find((c) => c.id === selected) ?? null
  const selRt = sel ? runtimes.get(sel.id) : undefined

  // ---- save
  const save = async (thenTest: boolean) => {
    if (!target) return setError('Najpierw wgraj obraz, który ma być rozpoznawany.')
    if (contents.length === 0) return setError('Dodaj przynajmniej jedną zawartość AR.')
    setSaving(true)
    setError(null)
    try {
      const old = orig.current
      let imageAssetId = old?.imageAssetId
      let mindAssetId = old?.mindAssetId
      if (target.mind) {
        imageAssetId = await repo.putAsset(target.image, 'target.jpg')
        mindAssetId = await repo.putAsset(new Blob([target.mind as BlobPart]), 'target.mind')
        if (old) {
          await repo.deleteAsset(old.imageAssetId)
          await repo.deleteAsset(old.mindAssetId)
        }
      }
      const saved: ContentItem[] = []
      for (const { blob, ...c } of contents) {
        let assetId = c.assetId
        if (blob && !assetId) assetId = await repo.putAsset(blob, c.name)
        saved.push({ ...c, assetId })
      }
      if (old) {
        for (const oc of old.contents)
          if (oc.assetId && !saved.some((s) => s.assetId === oc.assetId)) await repo.deleteAsset(oc.assetId)
      }
      const card: ARCard = {
        id: cardId,
        name: name.trim() || 'Bez nazwy',
        createdAt: old?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        collectionIds: old?.collectionIds ?? [DEFAULT_COLLECTION_ID],
        imageAssetId: imageAssetId!,
        mindAssetId: mindAssetId!,
        aspect: target.aspect,
        quality: target.quality,
        contents: saved,
      }
      await repo.saveCard(card)
      nav(thenTest ? `/scan/${cardId}` : '/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Zapis nie powiódł się.')
      setSaving(false)
    }
  }

  if (!loaded) return <div className="center muted">Wczytywanie…</div>

  return (
    <div className="editor">
      <header className="bar">
        <Link to="/" className="btn ghost">← Biblioteka</Link>
        <h1>{isNew ? 'Nowa karta AR' : 'Edycja karty'}</h1>
      </header>

      <div className="editor-grid">
        <section className="preview">
          {imageUrl ? (
            <Stage imageUrl={imageUrl} aspect={target!.aspect} runtimes={runtimeList} />
          ) : (
            <div className="stage empty">
              <p>Tu zobaczysz podgląd karty z zawartością AR.</p>
            </div>
          )}
          <p className="muted small hint">Przeciągnij, aby obracać widok · scroll/szczypanie, aby przybliżać.</p>
        </section>

        <aside className="panel">
          {/* 1 — image */}
          <div className="step">
            <h2><span>1</span> Obraz do rozpoznawania</h2>
            <label className="btn">
              {target ? 'Zmień obraz' : 'Wgraj obraz (PNG, JPG, WebP)'}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden
                onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            {progress !== null && (
              <div className="progress" role="progressbar" aria-valuenow={Math.round(progress)}>
                <i style={{ width: `${progress}%` }} />
                <span>Przygotowuję dane rozpoznawania… {Math.round(progress)}%</span>
              </div>
            )}
            {target && progress === null && <QualityBadge q={target.quality} detailed />}
          </div>

          {/* 2 — content */}
          <div className={`step ${target ? '' : 'disabled'}`}>
            <h2><span>2</span> Zawartość AR</h2>
            <div className="row wrap">
              {listContentTypes().map((t) => (
                t.accept ? (
                  <label key={t.type} className={`btn ${target ? '' : 'disabled'}`}>
                    + {t.label}
                    <input type="file" accept={t.accept} hidden disabled={!target}
                      onChange={(e) => { addContent(t.type, e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                ) : (
                  <button key={t.type} className="btn" disabled={!target} onClick={() => addContent(t.type)}>
                    + {t.label}
                  </button>
                )
              ))}
            </div>
            <button className="btn" disabled={!target || assetBusy || saving} aria-expanded={showAssets}
              onClick={() => setShowAssets((open) => !open)}>
              {showAssets ? 'Zamknij katalog' : 'Szukaj w katalogu'}
            </button>
            {showAssets && <AssetBrowser onAdd={addContent} onBusy={setAssetBusy} onClose={() => setShowAssets(false)} />}
            <p className="muted small">Model: GLB (jeden plik z teksturami) · dźwięk: MP3/WAV/OGG · wideo: MP4/WebM · obraz: PNG/JPG/WebP. Można łączyć kilka zawartości na jednej karcie.</p>
            {contents.length > 0 && (
              <ul className="items">
                {contents.map((c) => (
                  <li key={c.id} className={c.id === selected ? 'on' : ''}>
                    <button className="item-main" onClick={() => setSelected(c.id)}>
                      <b>{getContentType(c.type).label}</b>
                      <span>{c.name}</span>
                      {c.credit && <span className="muted small">{[c.credit.creator, c.credit.license].filter(Boolean).join(' · ')}</span>}
                      {!runtimes.has(c.id) && <em>wczytywanie…</em>}
                    </button>
                    <button className="icon" aria-label="Usuń zawartość"
                      onClick={() => { setContents((cs) => cs.filter((x) => x.id !== c.id)); if (selected === c.id) setSelected(null) }}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 3 — adjust */}
          {sel && (
            <div className="step">
              <h2><span>3</span> Dopasuj</h2>
              {getContentType(sel.type).spatial && <>
              <Slider label="Wielkość" value={sel.transform.scale} min={0.05} max={3} step={0.01}
                onChange={(v) => patch(sel.id, (c) => ({ ...c, transform: { ...c.transform, scale: v } }))} />
              {(['Pozycja X', 'Pozycja Y', 'Wysokość nad obrazem'] as const).map((l, i) => (
                <Slider key={l} label={l} value={sel.transform.position[i]}
                  min={i === 2 ? -0.5 : -1} max={i === 2 ? 1.5 : 1} step={0.01}
                  onChange={(v) => patch(sel.id, (c) => {
                    const p = [...c.transform.position] as [number, number, number]
                    p[i] = v
                    return { ...c, transform: { ...c.transform, position: p } }
                  })} />
              ))}
              {(['Obrót X', 'Obrót Y', 'Obrót Z'] as const).map((l, i) => (
                <Slider key={l} label={l} unit="°" value={sel.transform.rotation[i]} min={-180} max={180} step={1}
                  onChange={(v) => patch(sel.id, (c) => {
                    const r = [...c.transform.rotation] as [number, number, number]
                    r[i] = v
                    return { ...c, transform: { ...c.transform, rotation: r } }
                  })} />
              ))}
              </>}
              <TypeFields sel={sel} patch={patch} />
              {getContentType(sel.type).playable && selRt && (
                <button className="btn small" onClick={() => togglePreview(sel.id, selRt)}>
                  {previewing.has(sel.id) ? '■ Zatrzymaj podgląd' : '▶ Odtwórz podgląd'}
                </button>
              )}
              {sel.type === 'model3d' && selRt?.info.clips && selRt.info.clips.length > 0 && (
                <div className="field">
                  <label>Animacja</label>
                  <select value={String(sel.props.clip)}
                    onChange={(e) => patch(sel.id, (c) => ({ ...c, props: { ...c.props, clip: Number(e.target.value) } }))}>
                    <option value="-1">Brak</option>
                    {selRt.info.clips.map((n, i) => <option key={i} value={i}>{n}</option>)}
                  </select>
                  <label className="check">
                    <input type="checkbox" checked={Boolean(sel.props.loop)}
                      onChange={(e) => patch(sel.id, (c) => ({ ...c, props: { ...c.props, loop: e.target.checked } }))} />
                    Zapętl
                  </label>
                </div>
              )}
              {sel.type === 'model3d' && selRt && selRt.info.clips?.length === 0 && (
                <p className="muted small">Ten model nie zawiera animacji.</p>
              )}
              {getContentType(sel.type).spatial && (
                <button className="btn ghost small"
                  onClick={() => patch(sel.id, (c) => ({ ...c, transform: getContentType(c.type).defaultTransform() }))}>
                  Przywróć domyślne
                </button>
              )}
            </div>
          )}

          {/* 4 — save */}
          <div className="step">
            <h2><span>4</span> Zapisz</h2>
            <div className="field">
              <label htmlFor="nm">Nazwa karty</label>
              <input id="nm" value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Tyranozaur" />
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row">
              <button className="btn primary" disabled={saving || assetBusy || progress !== null || contents.some((c) => !runtimes.has(c.id))} onClick={() => save(true)}>
                Zapisz i przetestuj
              </button>
              <button className="btn" disabled={saving || assetBusy || progress !== null || contents.some((c) => !runtimes.has(c.id))} onClick={() => save(false)}>Zapisz</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Slider(p: {
  label: string; value: number; min: number; max: number; step: number; unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="slider">
      <label>{p.label}<output>{p.value.toFixed(p.step < 1 ? 2 : 0)}{p.unit ?? ''}</output></label>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value}
        onChange={(e) => p.onChange(Number(e.target.value))} />
    </div>
  )
}

function TypeFields({ sel, patch }: { sel: Draft; patch: (id: string, fn: (c: Draft) => Draft) => void }) {
  const fields = getContentType(sel.type).fields
  const set = (key: string, v: unknown) => patch(sel.id, (c) => ({ ...c, props: { ...c.props, [key]: v } }))
  return (
    <>
      {fields.map((f) => {
        const v = sel.props[f.key]
        if (f.kind === 'bool')
          return (
            <label key={f.key} className="check">
              <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(f.key, e.target.checked)} />
              {f.label}
            </label>
          )
        if (f.kind === 'number')
          return <Slider key={f.key} label={f.label} value={Number(v)} min={f.min} max={f.max} step={f.step} onChange={(x) => set(f.key, x)} />
        return (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            {f.kind === 'textarea' ? (
              <textarea rows={3} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />
            ) : f.kind === 'color' ? (
              <input type="color" value={String(v)} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </div>
        )
      })}
    </>
  )
}
