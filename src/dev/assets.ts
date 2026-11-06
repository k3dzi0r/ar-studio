/**
 * Dev-only procedural asset generators used to author the built-in packs
 * (card artwork, GLB models, synthesized sounds). Not part of the shipped app.
 */
import {
  AnimationClip, CanvasTexture, ConeGeometry, DoubleSide, Euler, Group, Mesh,
  MeshStandardMaterial, QuaternionKeyframeTrack, Quaternion, RingGeometry, Scene, SphereGeometry,
  SRGBColorSpace, TextureLoader,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

export const W = 640
export const H = 800

const toBlob = (c: HTMLCanvasElement, type = 'image/png') =>
  new Promise<Blob>((res) => c.toBlob((b) => res(b!), type, 0.95))

// ───────────── card artwork ─────────────
export type Motif = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void

/** Dense multicolour pattern (great for feature tracking) + motif + title band. */
export async function cardImage(title: string, seed: number, hue: number, motif: Motif): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  const r = rng(seed)
  const g = x.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, `hsl(${hue},55%,16%)`)
  g.addColorStop(1, `hsl(${(hue + 60) % 360},55%,28%)`)
  x.fillStyle = g
  x.fillRect(0, 0, W, H)
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `hsla(${(hue + r() * 140 - 20 + 360) % 360},${55 + r() * 40}%,${30 + r() * 55}%,${0.55 + r() * 0.4})`
    const px = r() * W, py = r() * H, s = 6 + r() * 34
    x.beginPath()
    const k = i % 3
    if (k === 0) x.rect(px, py, s, s * (0.4 + r()))
    else if (k === 1) x.arc(px, py, s / 2, 0, 7)
    else { x.moveTo(px, py); x.lineTo(px + s, py + r() * s); x.lineTo(px - r() * s, py + s) }
    x.fill()
  }
  // motif on a ringed disc — every element is seed-dependent so cards share no
  // identical structure (identical decoration made the matcher confuse cards)
  const ringR = 228 + Math.floor(r() * 26)
  x.lineWidth = 8 + Math.floor(r() * 12)
  x.strokeStyle = `hsl(${(hue + 180 + r() * 60) % 360},80%,${70 + r() * 25}%)`
  x.beginPath(); x.arc(W / 2, 330, ringR, 0, 7); x.stroke()
  x.fillStyle = 'rgba(8,10,20,0.78)'
  x.beginPath(); x.arc(W / 2, 330, ringR - 6, 0, 7); x.fill()
  const dots = 40 + Math.floor(r() * 50)
  for (let i = 0; i < dots; i++) {
    const a = r() * Math.PI * 2
    const rad = ringR * (0.55 + r() * 0.42)
    x.fillStyle = `hsl(${r() * 360},85%,${55 + r() * 35}%)`
    x.beginPath(); x.arc(W / 2 + Math.cos(a) * rad, 330 + Math.sin(a) * rad, 2 + r() * 7, 0, 7); x.fill()
  }
  for (let i = 0; i < 14; i++) { // a few seeded strokes inside the disc
    x.strokeStyle = `hsla(${r() * 360},80%,70%,.8)`; x.lineWidth = 2 + r() * 4
    const a = r() * 6.28
    x.beginPath(); x.moveTo(W / 2 + Math.cos(a) * ringR * 0.9, 330 + Math.sin(a) * ringR * 0.9)
    x.lineTo(W / 2 + Math.cos(a + 0.25 + r() * 0.3) * ringR * 0.75, 330 + Math.sin(a + 0.25 + r() * 0.3) * ringR * 0.75); x.stroke()
  }
  motif(x, W / 2, 330, 190)
  // title band: position, width and colours vary per card
  const bx = 40 + Math.floor(r() * 40), by = 630 + Math.floor(r() * 30), bh = 90 + Math.floor(r() * 30)
  x.fillStyle = `hsl(${(hue + 30) % 360},30%,${88 + r() * 8}%)`
  x.beginPath(); x.roundRect(bx, by, W - bx * 2, bh, 10 + r() * 40); x.fill()
  x.strokeStyle = `hsl(${hue},80%,40%)`; x.lineWidth = 6; x.stroke()
  x.fillStyle = '#10131c'
  x.font = `${r() > 0.5 ? 700 : 600} ${58 + Math.floor(r() * 10)}px system-ui, sans-serif`
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText(title, W / 2, by + bh / 2 + 3)
  return toBlob(c, 'image/png')
}

const disc = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string | CanvasGradient) => {
  x.fillStyle = fill; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill()
}
const radial = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number, a: string, b: string) => {
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r)
  g.addColorStop(0, a); g.addColorStop(1, b); return g
}

export const motifs = {
  sun: ((x, cx, cy, r) => {
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8
      x.fillStyle = '#ffcf3f'; x.beginPath()
      x.moveTo(cx + Math.cos(a - 0.12) * r, cy + Math.sin(a - 0.12) * r)
      x.lineTo(cx + Math.cos(a) * (r + 40), cy + Math.sin(a) * (r + 40))
      x.lineTo(cx + Math.cos(a + 0.12) * r, cy + Math.sin(a + 0.12) * r); x.fill()
    }
    disc(x, cx, cy, r, radial(x, cx, cy, r, '#fff3a0', '#ff8a1f'))
  }) as Motif,
  earth: ((x, cx, cy, r) => {
    disc(x, cx, cy, r, radial(x, cx, cy, r, '#7fc4ff', '#0b4a9c'))
    x.fillStyle = '#3fae5a'
    for (const [dx, dy, s] of [[-50, -40, 60], [40, 20, 70], [-20, 70, 40], [70, -60, 35]] as const) {
      x.beginPath(); x.ellipse(cx + dx, cy + dy, s, s * 0.7, dx / 50, 0, 7); x.fill()
    }
  }) as Motif,
  moon: ((x, cx, cy, r) => {
    disc(x, cx, cy, r, radial(x, cx, cy, r, '#f1f1f1', '#8d8d96'))
    for (const [dx, dy, s] of [[-60, -40, 34], [50, -10, 24], [-10, 60, 42], [70, 70, 18], [-80, 40, 16]] as const)
      disc(x, cx + dx, cy + dy, s, 'rgba(90,90,100,.55)')
  }) as Motif,
  saturn: ((x, cx, cy, r) => {
    disc(x, cx, cy, r * 0.72, radial(x, cx, cy, r * 0.72, '#ffe3a1', '#c98d3a'))
    x.strokeStyle = '#e8c98a'; x.lineWidth = 16
    x.beginPath(); x.ellipse(cx, cy, r * 1.05, r * 0.32, -0.35, 0, 7); x.stroke()
    x.strokeStyle = '#b8924f'; x.lineWidth = 6
    x.beginPath(); x.ellipse(cx, cy, r * 0.88, r * 0.26, -0.35, 0, 7); x.stroke()
  }) as Motif,
  cube: ((x, cx, cy, r) => {
    const s = r * 0.7
    const p = (a: number, b: number) => [cx + a * s, cy + b * s] as const
    const face = (pts: Array<readonly [number, number]>, col: string) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(...pts[0]); pts.slice(1).forEach((q) => x.lineTo(...q)); x.fill()
    }
    face([p(0, -1.1), p(1, -0.55), p(0, 0), p(-1, -0.55)], '#ff9a76')
    face([p(-1, -0.55), p(0, 0), p(0, 1.1), p(-1, 0.55)], '#e0533a')
    face([p(1, -0.55), p(0, 0), p(0, 1.1), p(1, 0.55)], '#b73a28')
  }) as Motif,
  ball: ((x, cx, cy, r) => disc(x, cx, cy, r * 0.85, radial(x, cx, cy, r * 0.85, '#9fd1ff', '#2a62d9'))) as Motif,
  pyramid: ((x, cx, cy, r) => {
    x.fillStyle = '#ffd23f'; x.beginPath(); x.moveTo(cx, cy - r * 0.9); x.lineTo(cx - r * 0.95, cy + r * 0.7); x.lineTo(cx, cy + r * 0.45); x.fill()
    x.fillStyle = '#e6a800'; x.beginPath(); x.moveTo(cx, cy - r * 0.9); x.lineTo(cx + r * 0.95, cy + r * 0.7); x.lineTo(cx, cy + r * 0.45); x.fill()
    x.fillStyle = '#b97f00'; x.beginPath(); x.moveTo(cx - r * 0.95, cy + r * 0.7); x.lineTo(cx, cy + r * 0.45); x.lineTo(cx + r * 0.95, cy + r * 0.7); x.fill()
  }) as Motif,
}

export type Emotion = 'joy' | 'sad' | 'angry' | 'surprise'
export function face(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, e: Emotion) {
  const col = { joy: ['#fff176', '#ffb300'], sad: ['#a5d8ff', '#3b7ddd'], angry: ['#ff9e80', '#d32f2f'], surprise: ['#e1bee7', '#ab47bc'] }[e]
  disc(x, cx, cy, r, radial(x, cx, cy, r, col[0], col[1]))
  x.strokeStyle = '#2b1b00'; x.fillStyle = '#2b1b00'; x.lineWidth = r * 0.07; x.lineCap = 'round'
  const ey = cy - r * 0.2, ex = r * 0.36
  if (e === 'angry') {
    x.beginPath(); x.moveTo(cx - ex - r * 0.2, ey - r * 0.28); x.lineTo(cx - ex + r * 0.2, ey - r * 0.1); x.stroke()
    x.beginPath(); x.moveTo(cx + ex + r * 0.2, ey - r * 0.28); x.lineTo(cx + ex - r * 0.2, ey - r * 0.1); x.stroke()
  }
  if (e === 'sad') {
    x.beginPath(); x.moveTo(cx - ex - r * 0.2, ey - r * 0.1); x.lineTo(cx - ex + r * 0.2, ey - r * 0.25); x.stroke()
    x.beginPath(); x.moveTo(cx + ex + r * 0.2, ey - r * 0.1); x.lineTo(cx + ex - r * 0.2, ey - r * 0.25); x.stroke()
  }
  const eyeR = e === 'surprise' ? r * 0.15 : r * 0.1
  disc(x, cx - ex, ey, eyeR, '#2b1b00'); disc(x, cx + ex, ey, eyeR, '#2b1b00')
  x.beginPath()
  if (e === 'joy') x.arc(cx, cy + r * 0.05, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI)
  else if (e === 'sad') x.arc(cx, cy + r * 0.72, r * 0.42, 1.15 * Math.PI, 1.85 * Math.PI)
  else if (e === 'angry') { x.moveTo(cx - r * 0.4, cy + r * 0.5); x.lineTo(cx + r * 0.4, cy + r * 0.5) }
  else { x.ellipse(cx, cy + r * 0.5, r * 0.16, r * 0.24, 0, 0, 7) }
  e === 'surprise' ? x.fill() : x.stroke()
  if (e === 'sad') { x.fillStyle = '#7ec8ff'; x.beginPath(); x.ellipse(cx - ex, ey + r * 0.38, r * 0.06, r * 0.1, 0, 0, 7); x.fill() }
}
export async function faceImage(e: Emotion): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = c.height = 512
  face(c.getContext('2d')!, 256, 256, 240, e)
  return toBlob(c)
}

// ───────────── 3D (GLB) ─────────────
const spin = (name: string, secs = 8): AnimationClip => {
  const q = (a: number) => new Quaternion().setFromEuler(new Euler(0, a, 0)).toArray()
  return new AnimationClip('Obrót', secs, [
    new QuaternionKeyframeTrack(`${name}.quaternion`, [0, secs / 4, secs / 2, (secs * 3) / 4, secs],
      [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2, Math.PI * 2].flatMap(q)),
  ])
}

const planetTextures = {
  sun: new URL('./textures/sun.jpg', import.meta.url).href,
  earth: new URL('./textures/earth_daymap.jpg', import.meta.url).href,
  moon: new URL('./textures/moon.jpg', import.meta.url).href,
  saturn: new URL('./textures/saturn.jpg', import.meta.url).href,
}

export const planetCredit = {
  creator: 'Solar System Scope',
  license: 'CC BY 4.0',
  sourceUrl: 'https://www.solarsystemscope.com/textures/',
}

async function exportGlb(root: Group, clip: AnimationClip): Promise<Blob> {
  const scene = new Scene(); scene.add(root)
  const buf = (await new GLTFExporter().parseAsync(scene, { binary: true, animations: [clip] })) as ArrayBuffer
  return new Blob([buf], { type: 'model/gltf-binary' })
}

export type Model = 'sun' | 'earth' | 'moon' | 'saturn' | 'cube' | 'ball' | 'pyramid'
export async function modelGlb(kind: Model): Promise<Blob> {
  const root = new Group()
  root.name = 'Obiekt'
  const material = (options: ConstructorParameters<typeof MeshStandardMaterial>[0]) =>
    new MeshStandardMaterial({ roughness: 0.42, ...options })

  if (kind === 'sun' || kind === 'earth' || kind === 'moon' || kind === 'saturn') {
    const map = await new TextureLoader().loadAsync(planetTextures[kind])
    map.colorSpace = SRGBColorSpace
    map.userData.mimeType = 'image/jpeg'
    const surface = material({ map, roughness: kind === 'earth' ? 0.52 : 0.85 })
    if (kind === 'sun') {
      surface.emissive.set(0xffffff)
      surface.emissiveMap = map
      surface.emissiveIntensity = 0.7
      surface.color.set(0x806040)
    }
    const planet = new Mesh(new SphereGeometry(0.5, 64, 40), surface)
    root.add(planet)
    if (kind === 'saturn') {
      const tilt = new Group()
      tilt.rotation.z = 0.46
      tilt.add(planet)
      const bands = [
        [0.61, 0.66, 0x846f5d], [0.66, 0.72, 0xa5957c], [0.72, 0.82, 0xd7bd97],
        [0.82, 0.86, 0xe8cfa8], [0.885, 0.935, 0xaf9374], [0.935, 1, 0xc8ad86],
      ]
      for (const [inner, outer, color] of bands) {
        const ring = new Mesh(new RingGeometry(inner, outer, 96), material({ color, side: DoubleSide, roughness: 0.9 }))
        ring.rotation.x = -Math.PI / 2
        tilt.add(ring)
      }
      root.add(tilt)
    }
  } else if (kind === 'cube') {
    root.add(new Mesh(new RoundedBoxGeometry(0.84, 0.84, 0.84, 5, 0.045), material({ color: 0xbc493b })))
  } else if (kind === 'ball') {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const enamel = ctx.createLinearGradient(0, 0, 0, 256)
    enamel.addColorStop(0, '#5bb8d5')
    enamel.addColorStop(0.38, '#2565a6')
    enamel.addColorStop(0.39, '#d2eef4')
    enamel.addColorStop(0.43, '#d2eef4')
    enamel.addColorStop(0.44, '#2869ad')
    enamel.addColorStop(1, '#13345d')
    ctx.fillStyle = enamel
    ctx.fillRect(0, 0, 4, 256)
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    root.add(new Mesh(new SphereGeometry(0.5, 64, 40), material({ map })))
  } else {
    const pyramid = new Mesh(new ConeGeometry(0.62, 0.87, 4), material({ color: 0xcc8c28, flatShading: true }))
    pyramid.rotation.y = Math.PI / 4
    root.add(pyramid)
  }
  return exportGlb(root, spin('Obiekt', 10))
}

// ───────────── audio (WAV) ─────────────
const RATE = 32000
type Voice = 'bell' | 'felt' | 'pad'
type Note = [semitone: number, start: number, length: number, gain?: number]
const timbres = {
  bell: { attack: 0.012, overtone: 2.76, decay: 5 },
  felt: { attack: 0.023, overtone: 2, decay: 3.4 },
  pad: { attack: 0.15, overtone: 2.01, decay: 1.2 },
}

function wav(voice: Voice, notes: Note[]): Blob {
  const { attack, overtone, decay } = timbres[voice]
  const samples = Math.ceil((Math.max(...notes.map(([, start, length]) => start + length)) + 0.18) * RATE)
  const signal = new Float32Array(samples)
  for (const [semitone, start, length, gain = 0.25] of notes) {
    const f = 261.63 * Math.pow(2, semitone / 12)
    const offset = Math.round(start * RATE)
    const echo = Math.round(0.13 * RATE)
    for (let i = 0; i < Math.floor(length * RATE); i++) {
      const t = i / RATE
      const phase = 2 * Math.PI * f * t
      const envelope = Math.sin(Math.PI / 2 * Math.min(1, t / attack))
        * Math.exp(-decay * t) * Math.min(1, (length - t) / 0.09)
      const sample = gain * envelope * (
        0.72 * Math.sin(phase) + 0.17 * Math.sin(phase * overtone) * Math.exp(-4 * t)
        + 0.11 * Math.sin(phase * 1.003)
      )
      signal[offset + i] += sample
      signal[offset + i + echo] += sample * 0.16
    }
  }
  const buf = new ArrayBuffer(44 + samples * 2)
  const dv = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF'); dv.setUint32(4, 36 + samples * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, RATE, true); dv.setUint32(28, RATE * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  str(36, 'data'); dv.setUint32(40, samples * 2, true)
  signal.forEach((v, i) => dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true))
  return new Blob([buf], { type: 'audio/wav' })
}

export const sounds = {
  joy: () => wav('bell', [[4, 0, 0.55], [7, 0.12, 0.55], [12, 0.25, 0.72], [16, 0.25, 0.6, 0.15]]),
  sad: () => wav('felt', [[3, 0, 0.7], [0, 0.33, 0.77], [-5, 0.68, 0.88], [-12, 0.68, 0.88, 0.17]]),
  angry: () => wav('felt', [[-17, 0, 0.45], [-11, 0, 0.46, 0.19], [-19, 0.28, 0.67], [-13, 0.29, 0.62, 0.2]]),
  surprise: () => wav('bell', [[-2, 0, 0.35, 0.16], [10, 0.12, 0.5], [17, 0.22, 0.7], [22, 0.23, 0.65, 0.12]]),
  note: (semi: number) => wav('bell', [[semi, 0, 0.8], [semi + 12, 0.07, 0.63, 0.15]]),
  space: (semi: number) => wav('pad', [[semi - 12, 0, 1.55, 0.2], [semi, 0.1, 1.45], [semi + 7, 0.32, 1.23, 0.19], [semi + 14, 0.58, 0.95, 0.12]]),
}
