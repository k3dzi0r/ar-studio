import { importPack } from './pack'

export interface CatalogPack {
  id: string
  name: string
  description: string
  file: string
  cover: string
  size: number
  cards: Array<{ name: string; score: number }>
}

const base = () => `${import.meta.env.BASE_URL}library/`

/** Built-in packs shipped with the app (public/library). Missing catalog → no packs. */
export async function fetchCatalog(): Promise<CatalogPack[]> {
  try {
    const r = await fetch(`${base()}index.json`)
    if (!r.ok) return []
    return ((await r.json()) as { packs: CatalogPack[] }).packs
  } catch {
    return []
  }
}

export const coverUrl = (p: CatalogPack) => `${base()}${p.cover}`

/** Adds the pack to the user's library as an active collection. */
export async function addBuiltIn(p: CatalogPack) {
  const r = await fetch(`${base()}${p.file}`)
  if (!r.ok) throw new Error('Nie udało się pobrać kolekcji. Sprawdź połączenie z internetem (pobierasz ją tylko raz).')
  return importPack(await r.blob(), { activate: true })
}
