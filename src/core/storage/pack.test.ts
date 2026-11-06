import { describe, expect, it } from 'vitest'
import { validateManifest } from './pack'

const card = { name: 'a', imageAssetId: 'i', mindAssetId: 'm', aspect: 1, contents: [] }

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest({ format: 'ar-studio-pack', version: 1, cards: [card], assets: [] }).cards).toHaveLength(1)
  })
  it('rejects foreign files, newer versions and broken cards', () => {
    expect(() => validateManifest({ format: 'x' })).toThrow(/nie jest paczka/)
    expect(() => validateManifest({ format: 'ar-studio-pack', version: 99, cards: [], assets: [] })).toThrow(/nowszej/)
    expect(() => validateManifest({ format: 'ar-studio-pack', version: 1, cards: [{}], assets: [] })).toThrow(/Uszkodzona/)
    expect(() => validateManifest(null)).toThrow()
  })
})
