export const MAX_TARGET_SIDE = 1024

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Nie udało się odczytać obrazu. Użyj PNG, JPG lub WebP.'))
    }
    img.src = url
  })
}

/** Draws the image on white (flattens transparency) at a bounded size. */
export function toCanvas(img: HTMLImageElement, maxSide = MAX_TARGET_SIDE): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * k))
  const h = Math.max(1, Math.round(img.naturalHeight * k))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return c
}

export const canvasToBlob = (c: HTMLCanvasElement, type = 'image/jpeg', q = 0.92) =>
  new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('Kodowanie obrazu nie powiodło się'))), type, q),
  )

/** Grey-scale luminance of a canvas (0..255), used for the quality estimate. */
export function greyPixels(c: HTMLCanvasElement): Uint8Array {
  const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  const g = new Uint8Array(c.width * c.height)
  for (let i = 0; i < g.length; i++) {
    g[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8
  }
  return g
}
