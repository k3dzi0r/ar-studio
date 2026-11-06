import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { normalizeSearch } from '../../core/assets/search'
import { repo, uid } from '../../core/storage/db'
import { addBuiltIn, coverUrl, fetchCatalog, type CatalogPack } from '../../core/storage/catalog'
import { download, exportPack, importPack, safeName } from '../../core/storage/pack'
import { DEFAULT_COLLECTION_ID, type ARCard, type Collection } from '../../core/types'
import { QualityBadge } from '../../ui/QualityBadge'
import { useAssetUrl } from '../../ui/hooks'
import { useInstallPrompt } from '../../pwa/pwa'

const plural = (n: number) => `${n} ${n === 1 ? 'karta' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'karty' : 'kart'}`

export default function LibraryPage() {
  const [cards, setCards] = useState<ARCard[] | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [query, setQuery] = useState('')
  const [collectionFilter, setCollectionFilter] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  const pwa = useInstallPrompt()
  const nav = useNavigate()
  const [catalog, setCatalog] = useState<CatalogPack[]>([])
  const [adding, setAdding] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const reload = useCallback(async () => {
    const [nextCollections, nextCards] = await Promise.all([repo.listCollections(), repo.listCards()])
    setCollections(nextCollections)
    setCards(nextCards)
  }, [])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => {
    let current = true
    void fetchCatalog().then((packs) => { if (current) setCatalog(packs) })
    return () => { current = false }
  }, [])

  const activeIds = useMemo(() => new Set(collections.filter((c) => c.active).map((c) => c.id)), [collections])
  const activeCount = (cards ?? []).filter((c) => c.collectionIds.some((i) => activeIds.has(i))).length
  const term = normalizeSearch(query)
  const shown = (cards ?? []).filter((card) => {
    if (collectionFilter && !card.collectionIds.includes(collectionFilter)) return false
    const names = [card.name, ...card.contents.map((item) => item.name),
      ...collections.filter((c) => card.collectionIds.includes(c.id)).map((c) => c.name)]
    return names.some((name) => normalizeSearch(name).includes(term))
  })

  const toggle = async (c: Collection) => {
    await repo.saveCollection({ ...c, active: !c.active })
    reload()
  }
  const addCollection = async () => {
    const name = prompt('Nazwa nowej kolekcji')?.trim()
    if (!name) return
    await repo.saveCollection({ id: uid(), name, active: true, createdAt: Date.now() })
    reload()
  }
  const exportCards = async (list: ARCard[], name: string) => {
    try {
      download(await exportPack(list, name), `${safeName(name)}.arpack`)
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Eksport nie powiódł się.' })
    }
  }
  const exportCollection = (c: Collection) =>
    exportCards((cards ?? []).filter((x) => x.collectionIds.includes(c.id)), c.name)
  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const r = await importPack(file)
      setNotice({ ok: true, text: `Zaimportowano ${plural(r.cards)} do kolekcji „${r.collectionName}”. Włącz ją, aby skaner jej używał.` })
      reload()
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Import nie powiódł się.' })
    }
  }
  const addPack = async (p: CatalogPack, thenScan: boolean, previous?: Collection) => {
    setAdding(p.id)
    try {
      const r = await addBuiltIn(p)
      if (previous?.active) await repo.saveCollection({ ...previous, active: false })
      if (thenScan) return nav('/scan')
      setNotice({ ok: true, text: previous
        ? `Dodano „${r.collectionName}”. Poprzednia kolekcja jest zachowana i wyłączona.`
        : `Dodano „${r.collectionName}” (${plural(r.cards)}). Kolekcja jest aktywna.` })
      await reload()
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Nie udało się dodać kolekcji.' })
    } finally {
      setAdding(null)
    }
  }
  const removeCollection = async (c: Collection) => {
    if (!confirm(`Usunąć kolekcję „${c.name}” wraz z kartami, które są tylko w niej? Tej operacji nie można cofnąć.`)) return
    await repo.deleteCollection(c.id)
    if (collectionFilter === c.id) setCollectionFilter('')
    reload()
  }
  const remove = async (c: ARCard) => {
    if (!confirm(`Usunąć kartę „${c.name}”? Tej operacji nie można cofnąć.`)) return
    await repo.deleteCard(c.id)
    reload()
  }
  const moveTo = async (c: ARCard, colId: string, on: boolean) => {
    const ids = on ? [...new Set([...c.collectionIds, colId])] : c.collectionIds.filter((i) => i !== colId)
    if (!ids.length) return
    await repo.saveCard({ ...c, collectionIds: ids })
    reload()
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <h1>AR Studio</h1>
          <p className="muted">Zamień dowolny obraz w kartę rozszerzonej rzeczywistości.</p>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => importInput.current?.click()}>Importuj karty (.arpack)</button>
          <input ref={importInput} type="file" accept=".arpack,.zip,application/zip" hidden
            onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = '' }} />
          <Link to="/edit" className="btn">+ Nowa karta</Link>
          <Link to="/scan" className={`btn primary big ${activeCount ? '' : 'disabled'}`}
            aria-disabled={!activeCount}
            onClick={(e) => { if (!activeCount) e.preventDefault() }}>
            ◉ Skanuj{activeCount ? ` (${activeCount})` : ''}
          </Link>
        </div>
      </header>

      {pwa.canInstall && (
        <p className="notice ok"><button className="btn small" onClick={() => pwa.install()}>Zainstaluj aplikację</button> {' '}
          Działa wtedy jak zwykła aplikacja, także bez internetu.</p>
      )}
      {pwa.iosSafari && (
        <p className="notice ok">Aby zainstalować: dotknij „Udostępnij” i wybierz „Dodaj do ekranu głównego”.</p>
      )}
      {notice && (
        <p className={notice.ok ? 'notice ok' : 'notice bad'} role="status" onClick={() => setNotice(null)}>{notice.text}</p>
      )}

      <section className="collections">
        <h2>Aktywne kolekcje</h2>
        <p className="muted small">
          Skaner rozpoznaje tylko karty z włączonych kolekcji — dzięki temu działa szybko i stabilnie.
        </p>
        <div className="chips">
          {collections.map((c) => (
            <span key={c.id} className="chipgroup">
              <button className={`chip ${c.active ? 'on' : ''}`} onClick={() => toggle(c)} aria-pressed={c.active}>
                {c.active ? '● ' : '○ '}{c.name}
              </button>
              <Link className="chip export" to={`/print?collection=${c.id}`} aria-label={`Drukuj kolekcję ${c.name}`} title="Drukuj karty kolekcji">🖶</Link>
              <button className="chip export" aria-label={`Eksportuj kolekcję ${c.name}`} title="Eksportuj kolekcję"
                onClick={() => exportCollection(c)}>⤓</button>
              {c.id !== DEFAULT_COLLECTION_ID && (
                <button className="chip export" aria-label={`Usuń kolekcję ${c.name}`} title="Usuń kolekcję"
                  onClick={() => removeCollection(c)}>✕</button>
              )}
            </span>
          ))}
          <button className="chip ghost" onClick={addCollection}>+ Kolekcja</button>
        </div>
        {activeCount > 12 && (
          <p className="warn small">Aktywnych jest {activeCount} kart. Przy dużej liczbie rozpoznawanie zwalnia — rozważ wyłączenie części kolekcji.</p>
        )}
      </section>

      {catalog.length > 0 && (
        <section>
          <h2 style={{ marginBottom: '.2rem' }}>Gotowe kolekcje</h2>
          <p className="muted small">Dodaj kolekcję, wydrukuj karty i skieruj na nie kamerę. Wszystko działa później bez internetu.</p>
          <div className="packs" style={{ marginTop: '.8rem' }}>
            {catalog.map((p) => {
              const revision = p.revision ?? 1
              const installed = collections.find((c) => c.builtIn?.id === p.id && c.builtIn.revision === revision)
              const previous = collections.find((c) => {
                if (c.builtIn) return c.builtIn.id === p.id && c.builtIn.revision < revision
                if (c.name !== p.name && !c.name.startsWith(`${p.name} (`)) return false
                const members = cards?.filter((card) => card.collectionIds.includes(c.id)) ?? []
                return p.cards.every((entry) => members.some((card) => card.name === entry.name))
              })
              return (
                <article className="pack" key={p.id}>
                  <img src={coverUrl(p)} alt="" loading="lazy" />
                  <div className="pack-body">
                    <h3>{p.name}</h3>
                    <p className="muted small">{p.description}</p>
                    <p className="muted small">{plural(p.cards.length)} · {p.cards.map((c) => c.name).join(' · ')}</p>
                    {p.id === 'kosmos' && revision >= 2 && (
                      <p className="muted small">Tekstury: <a className="credit-link" href="https://www.solarsystemscope.com/textures/"
                        target="_blank" rel="noreferrer">Solar System Scope</a> · <a className="credit-link"
                        href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · zmniejszone i osadzone w modelach</p>
                    )}
                    <div className="row">
                      {installed ? (
                        <>
                          <span className="muted small">✓ Dodano</span>
                          <Link className="btn small" to={`/print?collection=${installed.id}`}>Drukuj karty</Link>
                        </>
                      ) : previous ? (
                        <button className="btn primary small" disabled={adding !== null} onClick={() => addPack(p, false, previous)}>
                          {adding === p.id ? 'Pobieranie…' : 'Dodaj odświeżoną wersję'}
                        </button>
                      ) : (
                        <>
                          <button className="btn primary small" disabled={adding !== null} onClick={() => addPack(p, true)}>
                            {adding === p.id ? 'Pobieranie…' : 'Dodaj i skanuj'}
                          </button>
                          <button className="btn small" disabled={adding !== null} onClick={() => addPack(p, false)}>Dodaj</button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <div className="row between wrap">
          <h2>Moje karty {cards && <span className="muted small">{shown.length} / {cards.length}</span>}</h2>
          <div className="row wrap library-filters">
            <input className="search" type="search" aria-label="Szukaj kart" placeholder="Nazwa lub zawartość…" value={query}
              onChange={(e) => setQuery(e.target.value)} />
            <select className="search" aria-label="Filtruj według kolekcji" value={collectionFilter}
              onChange={(e) => setCollectionFilter(e.target.value)}>
              <option value="">Wszystkie kolekcje</option>
              {collections.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}
            </select>
            <button className="btn small" disabled={!shown.length}
              onClick={() => exportCards(shown, collections.find((c) => c.id === collectionFilter)?.name ?? 'Moje karty')}>
              Eksportuj widoczne ({shown.length})
            </button>
          </div>
        </div>
        {cards === null ? (
          <p className="muted">Wczytywanie…</p>
        ) : cards.length === 0 ? (
          <div className="emptystate">
            <h3>Brak kart</h3>
            <p className="muted">Wgraj obraz, dodaj model 3D i zobacz go na wydrukowanej kartce.</p>
            <Link to="/edit" className="btn primary">Utwórz pierwszą kartę</Link>
          </div>
        ) : (
          <div className="grid">
            {shown.map((c) => (
              <CardTile key={c.id} card={c} collections={collections} onDelete={() => remove(c)} onMove={moveTo} onExport={() => exportCards([c], c.name)} />
            ))}
            {shown.length === 0 && (
              <div className="emptystate">
                <p className="muted">Brak kart pasujących do filtrów.</p>
                <button className="btn small" onClick={() => { setQuery(''); setCollectionFilter('') }}>Wyczyść filtry</button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function CardTile({ card, collections, onDelete, onMove, onExport }: {
  card: ARCard
  collections: Collection[]
  onDelete: () => void
  onMove: (c: ARCard, colId: string, on: boolean) => void
  onExport: () => void
}) {
  const url = useAssetUrl(card.imageAssetId)
  return (
    <article className="tile">
      <div className="thumb">{url && <img src={url} alt={card.name} />}</div>
      <div className="tile-body">
        <h3>{card.name}</h3>
        <QualityBadge q={card.quality} />
        <p className="muted small">{card.contents.map((c) => c.name).join(', ')}</p>
        <details className="small">
          <summary>Kolekcje</summary>
          {collections.map((col) => (
            <label key={col.id} className="check">
              <input type="checkbox" checked={card.collectionIds.includes(col.id)}
                disabled={card.collectionIds.length === 1 && card.collectionIds[0] === col.id}
                onChange={(e) => onMove(card, col.id, e.target.checked)} />
              {col.name}
            </label>
          ))}
        </details>
        <div className="row wrap">
          <Link to={`/scan/${card.id}`} className="btn primary small">Testuj</Link>
          <Link to={`/edit/${card.id}`} className="btn small">Edytuj</Link>
          <Link to={`/print?card=${card.id}`} className="btn ghost small">Drukuj</Link>
          <button className="btn ghost small" onClick={onExport}>Eksportuj kartę</button>
          <button className="btn ghost small danger" onClick={onDelete}>Usuń</button>
        </div>
      </div>
    </article>
  )
}
