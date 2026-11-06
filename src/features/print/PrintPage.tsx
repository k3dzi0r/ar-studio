import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { repo } from '../../core/storage/db'
import type { ARCard } from '../../core/types'
import { useAssetUrl } from '../../ui/hooks'

/** Printable sheet of the images the scanner recognises (?card=ID or ?collection=ID). */
export default function PrintPage() {
  const [q] = useSearchParams()
  const [cards, setCards] = useState<ARCard[] | null>(null)
  useEffect(() => {
    ;(async () => {
      const all = await repo.listCards()
      const card = q.get('card')
      const col = q.get('collection')
      setCards(card ? all.filter((c) => c.id === card) : col ? all.filter((c) => c.collectionIds.includes(col)) : all)
    })()
  }, [q])
  return (
    <div className="print-page">
      <div className="print-bar no-print">
        <Link to="/" className="btn ghost">← Biblioteka</Link>
        <p className="muted small">Drukuj w jak największym rozmiarze, na papierze matowym. Każda karta zajmuje osobną stronę.</p>
        <button className="btn primary" onClick={() => window.print()}>Drukuj</button>
      </div>
      {cards === null ? <p className="muted">Wczytywanie…</p> : cards.map((c) => <Sheet key={c.id} card={c} />)}
    </div>
  )
}

function Sheet({ card }: { card: ARCard }) {
  const url = useAssetUrl(card.imageAssetId)
  return (
    <figure className="sheet">
      {url && <img src={url} alt={card.name} />}
      <figcaption>{card.name}</figcaption>
    </figure>
  )
}
