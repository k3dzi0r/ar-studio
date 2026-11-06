import JSZip from 'jszip'
import { repo, uid } from './db'
import type { ARCard, Collection, ContentItem } from '../types'

/**
 * Portable ".arpack" (a zip): manifest.json + assets/<id>. Carries the
 * compiled recognition data too, so importing never recompiles anything and
 * works fully offline — this is also the way to move cards between devices.
 */
const FORMAT = 'ar-studio-pack'
const VERSION = 1
const MAX_CARDS = 500

interface Manifest {
  format: typeof FORMAT
  version: number
  name: string
  exportedAt: number
  cards: ARCard[]
  assets: Array<{ id: string; name: string; mime: string }>
}

export function assetIdsOf(card: ARCard): string[] {
  return [card.imageAssetId, card.mindAssetId, ...card.contents.map((c) => c.assetId)].filter(
    (x): x is string => !!x,
  )
}

export async function exportPack(cards: ARCard[], name: string): Promise<Blob> {
  const zip = new JSZip()
  const assets: Manifest['assets'] = []
  const seen = new Set<string>()
  for (const card of cards) {
    for (const id of assetIdsOf(card)) {
      if (seen.has(id)) continue
      seen.add(id)
      const a = await repo.getAsset(id)
      if (!a) throw new Error(`Brakuje pliku w karcie „${card.name}”.`)
      assets.push({ id, name: a.name, mime: a.mime })
      zip.file(`assets/${id}`, a.blob, { binary: true, compression: 'STORE' }) // media is already compressed
    }
  }
  const manifest: Manifest = { format: FORMAT, version: VERSION, name, exportedAt: Date.now(), cards, assets }
  zip.file('manifest.json', JSON.stringify(manifest))
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

export function validateManifest(m: unknown): Manifest {
  const x = m as Partial<Manifest> | null
  if (!x || x.format !== FORMAT) throw new Error('To nie jest paczka AR Studio.')
  if (typeof x.version !== 'number' || x.version > VERSION)
    throw new Error('Paczka pochodzi z nowszej wersji aplikacji — zaktualizuj AR Studio.')
  if (!Array.isArray(x.cards) || !Array.isArray(x.assets)) throw new Error('Uszkodzona paczka (brak danych).')
  if (x.cards.length > MAX_CARDS) throw new Error('Paczka zawiera zbyt wiele kart.')
  for (const c of x.cards) {
    if (!c || typeof c.name !== 'string' || typeof c.imageAssetId !== 'string' ||
        typeof c.mindAssetId !== 'string' || typeof c.aspect !== 'number' || !Array.isArray(c.contents))
      throw new Error('Uszkodzona paczka (niepoprawna karta).')
  }
  return x as Manifest
}

/** Imports into a NEW collection; all ids are regenerated so nothing is overwritten. */
export async function importPack(
  file: Blob,
  opts: { activate?: boolean; builtIn?: Collection['builtIn'] } = {},
): Promise<{ collectionName: string; collectionId: string; cards: number }> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('Nie udało się otworzyć pliku — to nie jest poprawna paczka.')
  }
  const mf = zip.file('manifest.json')
  if (!mf) throw new Error('To nie jest paczka AR Studio.')
  let raw: unknown
  try {
    raw = JSON.parse(await mf.async('string'))
  } catch {
    throw new Error('Uszkodzony plik manifest.json.')
  }
  const manifest = validateManifest(raw)
  const meta = new Map(manifest.assets.map((a) => [a.id, a]))

  // verify every referenced asset exists before writing anything
  for (const card of manifest.cards)
    for (const id of assetIdsOf(card))
      if (!zip.file(`assets/${id}`) || !meta.has(id)) throw new Error(`Uszkodzona paczka: brak pliku w karcie „${card.name}”.`)

  const colId = uid()
  const existing = (await repo.listCollections()).map((c) => c.name)
  let colName = manifest.name || 'Import'
  for (let n = 2; existing.includes(colName); n++) colName = `${manifest.name || 'Import'} (${n})`
  await repo.saveCollection({ id: colId, name: colName, active: opts.activate ?? false, builtIn: opts.builtIn, createdAt: Date.now() })

  const idMap = new Map<string, string>()
  const remember = async (oldId: string) => {
    const known = idMap.get(oldId)
    if (known) return known
    const m = meta.get(oldId)!
    const blob = await zip.file(`assets/${oldId}`)!.async('blob')
    const newId = await repo.putAsset(new Blob([blob], { type: m.mime }), m.name)
    idMap.set(oldId, newId)
    return newId
  }

  for (const card of manifest.cards) {
    const contents: ContentItem[] = []
    for (const c of card.contents)
      contents.push({ ...c, id: uid(), assetId: c.assetId ? await remember(c.assetId) : undefined })
    await repo.saveCard({
      ...card,
      id: uid(),
      collectionIds: [colId],
      imageAssetId: await remember(card.imageAssetId),
      mindAssetId: await remember(card.mindAssetId),
      contents,
      createdAt: Date.now(),
    })
  }
  return { collectionName: colName, collectionId: colId, cards: manifest.cards.length }
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const safeName = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'pakiet'
