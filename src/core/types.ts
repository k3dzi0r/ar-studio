/** Domain model. Everything persisted goes through these types. */

export interface Transform {
  /** position in "target widths": x/y along the image, z out of the image */
  position: [number, number, number]
  /** degrees, XYZ order, applied on top of the type's default orientation */
  rotation: [number, number, number]
  /** uniform scale multiplier */
  scale: number
}

export const defaultTransform = (): Transform => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1,
})

export interface AssetCredit {
  creator?: string
  license: string
  sourceUrl: string
}

/**
 * A piece of AR content attached to a card. `type` selects a ContentType in
 * the render registry; `props` is type specific data (e.g. animation clip).
 * New content types only need a registry entry, not storage changes.
 */
export interface ContentItem {
  id: string
  type: string
  name: string
  /** id of the blob in the `assets` store */
  assetId?: string
  credit?: AssetCredit
  props: Record<string, unknown>
  transform: Transform
}

export interface QualityReport {
  /** 0..100 */
  score: number
  level: 'poor' | 'fair' | 'good' | 'excellent'
  featureCount: number
  /** share of the image area (6x6 grid) that contains feature points, 0..1 */
  coverage: number
  width: number
  height: number
  /** human readable (Polish) findings */
  messages: string[]
}

export interface ARCard {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  collectionIds: string[]
  /** recognised image (downscaled copy used for compilation + preview) */
  imageAssetId: string
  /** compiled MindAR target data (.mind) */
  mindAssetId: string
  /** height / width of the target */
  aspect: number
  quality: QualityReport
  contents: ContentItem[]
}

export interface Collection {
  id: string
  name: string
  /** only cards from active collections are loaded into the scanner */
  active: boolean
  createdAt: number
}

export interface StoredAsset {
  id: string
  blob: Blob
  name: string
  mime: string
  size: number
}

export const DEFAULT_COLLECTION_ID = 'default'
