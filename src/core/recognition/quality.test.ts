import { describe, expect, it } from 'vitest'
import { assessQuality, contrast, coverage } from './quality'

const grid = (n: number, w: number, h: number) =>
  Array.from({ length: n }, (_, i) => ({ x: ((i * 37) % w), y: ((i * 91) % h) }))

describe('quality', () => {
  it('contrast of flat image is 0', () => {
    expect(contrast(new Uint8Array(100).fill(128))).toBe(0)
  })
  it('coverage counts occupied grid cells', () => {
    expect(coverage([{ x: 1, y: 1 }], 600, 600)).toBeCloseTo(1 / 36)
    expect(coverage([], 600, 600)).toBe(0)
  })
  it('rates a detailed, well-spread image as good', () => {
    const g = new Uint8Array(800 * 600).map((_, i) => (i * 7919) % 256)
    const q = assessQuality({ width: 800, height: 600, grey: g, points: grid(600, 800, 600) })
    expect(q.level === 'good' || q.level === 'excellent').toBe(true)
  })
  it('flags a simple image', () => {
    const q = assessQuality({
      width: 800, height: 600, grey: new Uint8Array(800 * 600).fill(200),
      points: [{ x: 10, y: 10 }],
    })
    expect(q.level).toBe('poor')
    expect(q.messages.join(' ')).toMatch(/za mało szczegółów/i)
  })
})
