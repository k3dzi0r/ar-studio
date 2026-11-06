import { useEffect, useState } from 'react'
import { repo } from '../core/storage/db'

/** Object URL for a stored asset (revoked on change/unmount). */
export function useAssetUrl(assetId: string | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!assetId) return setUrl(null)
    let revoked = false
    let made: string | null = null
    repo.getAsset(assetId).then((a) => {
      if (revoked || !a) return
      made = URL.createObjectURL(a.blob)
      setUrl(made)
    })
    return () => {
      revoked = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [assetId])
  return url
}

export function useBlobUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return setUrl(null)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}
