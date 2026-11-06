import { Compiler } from 'mind-ar/dist/mindar-image.prod.js'
import { canvasToBlob, greyPixels, loadImage, toCanvas } from './image'
import { assessQuality } from './quality'
import type { QualityReport } from '../types'

export interface CompiledTarget {
  /** downscaled image actually used for recognition (JPEG) */
  image: Blob
  /** MindAR .mind data */
  mind: Uint8Array
  aspect: number
  quality: QualityReport
}

interface Keyframe {
  maximaPoints?: Array<{ x: number; y: number }>
  minimaPoints?: Array<{ x: number; y: number }>
  width: number
  height: number
  scale: number
}

/**
 * Turns an arbitrary image into MindAR tracking data entirely in the browser
 * (feature extraction on the main thread via TF.js, tracking data in a worker).
 * Takes seconds, not minutes, for a ≤1024px image.
 */
export async function compileTarget(
  file: Blob,
  onProgress: (percent: number) => void,
): Promise<CompiledTarget> {
  const canvas = toCanvas(await loadImage(file))
  const compiler = new Compiler()
  const data = await compiler.compileImageTargets([canvas], (p) => onProgress(Math.min(100, p)))
  const mind = compiler.exportData()

  // Feature points of the full-resolution keyframe (scale 1) are the most
  // faithful measure of how much the detector "sees" in the image.
  const entry = data[0] as { matchingData: Keyframe[] }
  const frames = entry.matchingData
  const base = frames.reduce((a, b) => (b.scale > a.scale ? b : a))
  const points = [...(base.maximaPoints ?? []), ...(base.minimaPoints ?? [])]

  const quality = assessQuality({
    width: canvas.width,
    height: canvas.height,
    grey: greyPixels(canvas),
    points: points.map((p) => ({ x: p.x, y: p.y })),
  })

  return {
    image: await canvasToBlob(canvas),
    mind,
    aspect: canvas.height / canvas.width,
    quality,
  }
}

/**
 * Combines per-card .mind files into one without recompiling. The index of a
 * card inside the merged file is its position in `buffers`.
 */
export function mergeMind(buffers: Array<ArrayBuffer | Uint8Array>): Uint8Array {
  const all: unknown[] = []
  for (const b of buffers) {
    const part = new Compiler().importData(b)
    if (part.length === 0) throw new Error('Dane rozpoznawania są nieaktualne — zapisz kartę ponownie.')
    all.push(...part)
  }
  const out = new Compiler()
  out.data = all
  return out.exportData()
}
