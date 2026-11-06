import type { AssetCredit } from '../types'

export type AssetKind = 'model3d' | 'image2d' | 'audio'

export interface CatalogAsset {
  id: string
  title: string
  kind: AssetKind
  url: string
  preview?: string
  credit: AssetCredit
}

const modelNames = [
  ['vehicle-racer', 'Wyścigówka', 'samochód auto race car'],
  ['vehicle-monster-truck', 'Monster truck', 'samochód auto truck'],
  ['vehicle-suv', 'SUV', 'samochód auto terenowy car'],
  ['vehicle-speedster', 'Roadster', 'samochód auto kabriolet car'],
  ['vehicle-truck', 'Ciężarówka', 'samochód auto truck'],
  ['item-banana', 'Banan', 'owoc banana fruit'],
  ['item-coin-gold', 'Złota moneta', 'pieniądze gold coin'],
  ['gate-finish', 'Brama mety', 'wyścig tor finish gate'],
]

export function normalizeSearch(value: string) {
  return value.toLowerCase().replaceAll('ł', 'l').normalize('NFD').replace(/\p{M}/gu, '').trim()
}

export function searchModels(query: string): CatalogAsset[] {
  const base = `${import.meta.env.BASE_URL}assets/kenney/`
  return modelNames.filter((model) => normalizeSearch(model.join(' ')).includes(normalizeSearch(query)))
    .map(([id, title]) => ({
      id, title, kind: 'model3d', url: `${base}${id}.glb`, preview: `${base}${id}.png`,
      credit: { creator: 'Kenney', license: 'CC0', sourceUrl: 'https://kenney.nl/assets/toy-car-kit' },
    }))
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return url.href
  } catch {
    return
  }
}

interface OpenverseResult {
  id: string
  title?: string
  url?: string
  thumbnail?: string
  creator?: string
  license?: string
  foreign_landing_url?: string
}

export async function searchOpenverse(kind: 'image2d' | 'audio', query: string, signal: AbortSignal) {
  const params = new URLSearchParams({ q: query, license: 'cc0,pdm', page_size: '20' })
  const endpoint = kind === 'image2d' ? 'images' : 'audio'
  const response = await fetch(`https://api.openverse.org/v1/${endpoint}/?${params}`, { signal })
  if (response.status === 429) throw new Error('Limit wyszukiwań Openverse został osiągnięty. Spróbuj za chwilę.')
  if (!response.ok) throw new Error('Openverse jest chwilowo niedostępne.')
  const { results } = await response.json() as { results: OpenverseResult[] }
  return results.flatMap((item): CatalogAsset[] => {
    const url = httpsUrl(item.url)
    const sourceUrl = httpsUrl(item.foreign_landing_url)
    if (!url || !sourceUrl || (item.license !== 'cc0' && item.license !== 'pdm')) return []
    return [{
      id: item.id, title: item.title?.trim() || 'Bez tytułu', url, kind,
      preview: kind === 'image2d' ? httpsUrl(item.thumbnail) : url,
      credit: { creator: item.creator, license: item.license === 'cc0' ? 'CC0' : 'Domena publiczna', sourceUrl },
    }]
  })
}

const extensions: Record<AssetKind, Record<string, string>> = {
  model3d: { 'model/gltf-binary': 'glb' },
  image2d: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  audio: { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'application/ogg': 'ogg' },
}

export async function downloadAsset(asset: CatalogAsset, signal: AbortSignal) {
  const response = await fetch(asset.url, { signal, credentials: 'omit' })
  if (!response.ok || !response.body) throw new Error('Nie udało się pobrać pliku.')
  const mime = asset.kind === 'model3d' ? 'model/gltf-binary' : response.headers.get('content-type')?.split(';')[0].trim() ?? ''
  const extension = extensions[asset.kind][mime]
  if (!extension) throw new Error('Plik źródłowy ma format nieobsługiwany przez kreator.')

  const maxBytes = 15 * 1024 * 1024
  const reader = response.body.getReader()
  const chunks: BlobPart[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error('Plik przekracza limit 15 MB.')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  return new File(chunks, `${asset.title}.${extension}`, { type: mime })
}
