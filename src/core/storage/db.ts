import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  DEFAULT_COLLECTION_ID,
  type ARCard,
  type Collection,
  type StoredAsset,
} from '../types'

interface Schema extends DBSchema {
  cards: { key: string; value: ARCard }
  assets: { key: string; value: StoredAsset }
  collections: { key: string; value: Collection }
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null

function db() {
  dbPromise ??= openDB<Schema>('ar-studio', 1, {
    upgrade(d) {
      d.createObjectStore('cards', { keyPath: 'id' })
      d.createObjectStore('assets', { keyPath: 'id' })
      d.createObjectStore('collections', { keyPath: 'id' })
    },
  })
  return dbPromise
}

export const uid = () => crypto.randomUUID()

/**
 * Storage layer. Everything is local (IndexedDB) so the app works offline and
 * privately. A future sync layer (Firebase etc.) can wrap this same interface.
 */
export const repo = {
  async ensureDefaults() {
    const d = await db()
    if (!(await d.get('collections', DEFAULT_COLLECTION_ID))) {
      await d.put('collections', {
        id: DEFAULT_COLLECTION_ID,
        name: 'Moje karty',
        active: true,
        createdAt: Date.now(),
      })
    }
  },

  async listCards(): Promise<ARCard[]> {
    const all = await (await db()).getAll('cards')
    return all.sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async getCard(id: string) {
    return (await db()).get('cards', id)
  },
  async saveCard(card: ARCard) {
    await (await db()).put('cards', { ...card, updatedAt: Date.now() })
  },
  /** Deletes the card and every asset only it referenced. */
  async deleteCard(id: string) {
    const d = await db()
    const card = await d.get('cards', id)
    if (!card) return
    const ids = [card.imageAssetId, card.mindAssetId, ...card.contents.map((c) => c.assetId)]
    await d.delete('cards', id)
    for (const a of ids) if (a) await d.delete('assets', a)
  },

  async putAsset(blob: Blob, name: string): Promise<string> {
    const id = uid()
    await (await db()).put('assets', { id, blob, name, mime: blob.type, size: blob.size })
    return id
  },
  async getAsset(id: string) {
    return (await db()).get('assets', id)
  },
  async deleteAsset(id: string) {
    await (await db()).delete('assets', id)
  },

  async listCollections(): Promise<Collection[]> {
    await this.ensureDefaults()
    const all = await (await db()).getAll('collections')
    return all.sort((a, b) => a.createdAt - b.createdAt)
  },
  async saveCollection(c: Collection) {
    await (await db()).put('collections', c)
  },
  /** Removes the collection; cards that belonged only to it are deleted too. */
  async deleteCollection(id: string) {
    if (id === DEFAULT_COLLECTION_ID) return
    for (const card of await this.listCards()) {
      if (!card.collectionIds.includes(id)) continue
      const rest = card.collectionIds.filter((i) => i !== id)
      if (rest.length) await this.saveCard({ ...card, collectionIds: rest })
      else await this.deleteCard(card.id)
    }
    await (await db()).delete('collections', id)
  },
}
