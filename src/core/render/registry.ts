import type { Object3D } from 'three'
import type { ContentItem, Transform } from '../types'

/** Live instance of a content item inside a three.js scene. */
export interface ContentRuntime {
  object: Object3D
  /** type specific facts shown by the editor */
  info: { clips?: string[]; hasSound?: boolean }
  update(dt: number): void
  setTransform(t: Transform): void
  setProps(props: Record<string, unknown>): void
  /** target (re)detected / lost in the scanner; also used by editor "play" preview */
  onFound(): void
  onLost(): void
  /** must be called from a user gesture to allow sound later (mobile autoplay rules) */
  unlock(): Promise<void>
  setMuted(muted: boolean): void
  dispose(): void
}

export type Field =
  | { key: string; label: string; kind: 'text' | 'textarea' | 'color' | 'bool' }
  | { key: string; label: string; kind: 'number'; min: number; max: number; step: number }

/**
 * A content type plugs into the editor and the scanner through this contract.
 * Add a new kind of content by implementing it and calling `registerContentType`.
 */
export interface ContentType {
  type: string
  label: string
  /** file input `accept`; null = no file (e.g. text) */
  accept: string | null
  /** false = no position in space (audio) → editor hides transform sliders */
  spatial: boolean
  /** type specific editable props rendered generically by the editor */
  fields: Field[]
  /** shows play/stop preview in the editor */
  playable?: boolean
  defaultProps(): Record<string, unknown>
  defaultTransform(): Transform
  create(item: ContentItem, blob: Blob | undefined): Promise<ContentRuntime>
}

const types = new Map<string, ContentType>()

export function registerContentType(t: ContentType) {
  types.set(t.type, t)
}
export function getContentType(type: string): ContentType {
  const t = types.get(type)
  if (!t) throw new Error(`Nieznany typ zawartości: ${type}`)
  return t
}
export const listContentTypes = () => [...types.values()]

/** Fills the optional parts of ContentRuntime with no-ops. */
export function makeRuntime(
  object: Object3D,
  impl: Partial<ContentRuntime> & Pick<ContentRuntime, 'setTransform' | 'dispose'>,
): ContentRuntime {
  return {
    object,
    info: {},
    update() {},
    setProps() {},
    onFound() {},
    onLost() {},
    async unlock() {},
    setMuted() {},
    ...impl,
  }
}
