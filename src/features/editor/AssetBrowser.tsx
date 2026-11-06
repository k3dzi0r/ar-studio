import { useEffect, useRef, useState } from 'react'
import { downloadAsset, searchModels, searchOpenverse, type AssetKind, type CatalogAsset } from '../../core/assets/search'
import type { AssetCredit } from '../../core/types'

export default function AssetBrowser({ onAdd, onBusy, onClose }: {
  onAdd: (kind: AssetKind, file: File, credit: AssetCredit) => void
  onBusy: (busy: boolean) => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<AssetKind>('model3d')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogAsset[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const searchRequest = useRef<AbortController | null>(null)
  const downloadRequest = useRef<AbortController | null>(null)
  useEffect(() => () => {
    searchRequest.current?.abort()
    downloadRequest.current?.abort()
  }, [])

  const reset = () => {
    searchRequest.current?.abort()
    setResults(null)
    setSearching(false)
    setError('')
  }
  const search = async () => {
    if (kind === 'model3d' || !query.trim()) return
    reset()
    const request = new AbortController()
    searchRequest.current = request
    setSearching(true)
    try {
      const found = await searchOpenverse(kind, query.trim(), request.signal)
      if (!request.signal.aborted) setResults(found)
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof TypeError ? 'Nie można połączyć się z Openverse.' : (e as Error).message)
    } finally {
      if (!request.signal.aborted) setSearching(false)
    }
  }

  const add = async (asset: CatalogAsset) => {
    if (downloadRequest.current) return
    const request = new AbortController()
    downloadRequest.current = request
    setDownloading(asset.id)
    onBusy(true)
    setError('')
    try {
      const file = await downloadAsset(asset, request.signal)
      if (!request.signal.aborted) {
        onAdd(asset.kind, file, asset.credit)
        onClose()
      }
    } catch (e) {
      if (!request.signal.aborted) {
        const message = e instanceof TypeError ? 'Przeglądarka nie mogła pobrać pliku.' : (e as Error).message
        setError(asset.kind === 'model3d' ? message : `${message} Możesz pobrać plik ze strony źródłowej i wgrać go ręcznie.`)
      }
    } finally {
      downloadRequest.current = null
      if (!request.signal.aborted) {
        setDownloading(null)
        onBusy(false)
      }
    }
  }

  const shown = kind === 'model3d' ? searchModels(query) : results
  return (
    <div className="asset-browser" role="region" aria-label="Katalog zasobów">
      <form className="field" onSubmit={(e) => { e.preventDefault(); void search() }}>
        <label htmlFor="asset-kind">Rodzaj zasobu</label>
        <select id="asset-kind" value={kind} disabled={downloading !== null}
          onChange={(e) => { reset(); setQuery(''); setKind(e.target.value as AssetKind) }}>
          <option value="model3d">Modele 3D · Kenney</option>
          <option value="image2d">Obrazy · Openverse</option>
          <option value="audio">Dźwięki · Openverse</option>
        </select>
        <label htmlFor="asset-query">Szukaj zasobu</label>
        <div className="row wrap">
          <input id="asset-query" className="search" type="search" value={query} disabled={downloading !== null}
            onChange={(e) => { reset(); setQuery(e.target.value) }} />
          {kind !== 'model3d' && <button className="btn small" disabled={searching || downloading !== null || !query.trim()}>Szukaj</button>}
        </div>
      </form>
      <p className="muted small">{kind === 'model3d' ? 'Modele dostępne offline.' : 'Wyszukiwanie online · CC0 i domena publiczna.'}</p>
      {searching && <p role="status">Wyszukiwanie…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {shown?.length === 0 && <p role="status">Brak pasujących zasobów.</p>}
      {shown && shown.length > 0 && (
        <ul className="asset-results" aria-label="Wyniki wyszukiwania">
          {shown.map((asset) => (
            <li key={asset.id}>
              {asset.preview && (asset.kind === 'audio' ? (
                <audio controls preload="none" src={asset.preview} aria-label={asset.title} />
              ) : (
                <img src={asset.preview} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ))}
              <b>{asset.title}</b>
              <div className="row wrap small">
                <span className="muted">{[asset.credit.creator, asset.credit.license].filter(Boolean).join(' · ')}</span>
                <a href={asset.credit.sourceUrl} target="_blank" rel="noreferrer">Źródło ↗</a>
              </div>
              <button type="button" className="btn small" disabled={downloading !== null}
                onClick={() => void add(asset)}>{downloading === asset.id ? 'Pobieranie…' : 'Dodaj do karty'}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
