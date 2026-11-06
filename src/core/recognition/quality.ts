import type { QualityReport } from '../types'

export interface QualityInput {
  width: number
  height: number
  /** luminance 0..255, row major */
  grey: Uint8Array
  /** feature points found by the MindAR compiler, in image pixel coordinates */
  points: Array<{ x: number; y: number }>
}

const GRID = 6

/** Std-dev of luminance, 0..~128. Flat/low-contrast images track badly. */
export function contrast(grey: Uint8Array): number {
  let sum = 0
  for (const v of grey) sum += v
  const mean = sum / grey.length
  let sq = 0
  for (const v of grey) sq += (v - mean) ** 2
  return Math.sqrt(sq / grey.length)
}

/** Share of GRID×GRID cells holding at least one feature point. */
export function coverage(points: QualityInput['points'], w: number, h: number): number {
  const cells = new Set<number>()
  for (const p of points) {
    const cx = Math.min(GRID - 1, Math.max(0, Math.floor((p.x / w) * GRID)))
    const cy = Math.min(GRID - 1, Math.max(0, Math.floor((p.y / h) * GRID)))
    cells.add(cy * GRID + cx)
  }
  return cells.size / (GRID * GRID)
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Heuristic suitability score. Inputs are real measurements (feature points
 * from MindAR's own detector, contrast, spatial spread), the weights/thresholds
 * are tuned heuristics, not guarantees.
 */
export function assessQuality(input: QualityInput): QualityReport {
  const { width, height, grey, points } = input
  const featureCount = points.length
  const cov = coverage(points, width, height)
  const con = contrast(grey)
  const minSide = Math.min(width, height)
  const aspect = Math.max(width, height) / Math.min(width, height)

  const sFeatures = clamp01(featureCount / 600) // 600+ points ~ plenty
  const sCoverage = clamp01(cov / 0.8)
  const sContrast = clamp01(con / 55)
  const sSize = clamp01(minSide / 400)
  const score = Math.round(100 * (0.45 * sFeatures + 0.3 * sCoverage + 0.15 * sContrast + 0.1 * sSize))

  const messages: string[] = []
  if (featureCount < 150)
    messages.push('Za mało szczegółów — obraz jest zbyt prosty. Użyj ilustracji z wieloma drobnymi elementami lub fakturą.')
  else if (featureCount < 350) messages.push('Dość mało szczegółów; rozpoznawanie może być wolniejsze lub gubić się.')
  if (cov < 0.4)
    messages.push('Szczegóły skupiają się w małym fragmencie obrazu. Lepiej, gdy są rozłożone na całej powierzchni.')
  if (con < 25) messages.push('Niski kontrast — blade lub jednolite kolory utrudniają śledzenie.')
  if (minSide < 300) messages.push('Mała rozdzielczość obrazu. Wgraj większy plik (min. ok. 500 px).')
  if (aspect > 3) messages.push('Bardzo wąski obraz — trudniej go utrzymać w kadrze.')
  if (!messages.length) messages.push('Obraz ma dużo szczegółów rozłożonych równomiernie — dobry znacznik.')
  messages.push('Wskazówka: drukuj matowo (bez połysku) i oświetlaj równomiernie.')

  const level = score >= 75 ? 'excellent' : score >= 55 ? 'good' : score >= 35 ? 'fair' : 'poor'
  return { score, level, featureCount, coverage: cov, width, height, messages }
}
