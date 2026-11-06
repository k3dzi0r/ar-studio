import {
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  VideoTexture,
} from 'three'
import { defaultTransform, type Transform } from '../types'
import { makeRuntime, registerContentType } from './registry'

function applyTransform(g: Group, t: Transform) {
  g.position.set(...t.position)
  g.rotation.set(...(t.rotation.map((d) => (d * Math.PI) / 180) as [number, number, number]))
  g.scale.setScalar(t.scale)
}

/** flat content lies on the picture, slightly above it to avoid z-fighting */
const flatTransform = (scale = 1): Transform => ({ ...defaultTransform(), scale, position: [0, 0, 0.01] })

const blobUrl = (b: Blob) => URL.createObjectURL(b)

function planeMesh(map: CanvasTexture | VideoTexture | import('three').Texture, aspect: number) {
  const mesh = new Mesh(
    new PlaneGeometry(1, aspect),
    new MeshBasicMaterial({ map, transparent: true, side: DoubleSide, toneMapped: false }),
  )
  return mesh
}

// ───────────────────────── image 2D ─────────────────────────
registerContentType({
  type: 'image2d',
  label: 'Obraz 2D',
  accept: 'image/png,image/jpeg,image/webp',
  spatial: true,
  fields: [],
  defaultProps: () => ({}),
  defaultTransform: () => flatTransform(1),
  async create(item, blob) {
    if (!blob) throw new Error('Brak pliku obrazu.')
    const url = blobUrl(blob)
    const tex = await new TextureLoader().loadAsync(url)
    URL.revokeObjectURL(url)
    tex.colorSpace = SRGBColorSpace
    const img = tex.image as { width: number; height: number }
    const mesh = planeMesh(tex, img.height / img.width)
    const g = new Group()
    g.add(mesh)
    applyTransform(g, item.transform)
    return makeRuntime(g, {
      setTransform: (t) => applyTransform(g, t),
      dispose: () => {
        mesh.geometry.dispose()
        mesh.material.dispose()
        tex.dispose()
      },
    })
  },
})

// ───────────────────────── text ─────────────────────────
interface TextProps { text: string; color: string; background: string; hasBackground: boolean; fontSize: number; bold: boolean }

function drawText(canvas: HTMLCanvasElement, p: TextProps) {
  const W = 1024
  const pad = 48
  const font = `${p.bold ? '700' : '500'} ${p.fontSize}px system-ui, -apple-system, 'Segoe UI', sans-serif`
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  const lines: string[] = []
  for (const para of (p.text || ' ').split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word
      if (line && ctx.measureText(test).width > W - pad * 2) {
        lines.push(line)
        line = word
      } else line = test
    }
    lines.push(line)
  }
  const lh = p.fontSize * 1.25
  const H = Math.max(64, Math.ceil(lines.length * lh + pad * 2))
  canvas.width = W
  canvas.height = H
  ctx.clearRect(0, 0, W, H)
  if (p.hasBackground) {
    ctx.fillStyle = p.background
    ctx.beginPath()
    ctx.roundRect(0, 0, W, H, 36)
    ctx.fill()
  }
  ctx.font = font
  ctx.fillStyle = p.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((l, i) => ctx.fillText(l, W / 2, pad + lh * i + lh / 2))
  return H / W
}

registerContentType({
  type: 'text',
  label: 'Tekst',
  accept: null,
  spatial: true,
  fields: [
    { key: 'text', label: 'Treść', kind: 'textarea' },
    { key: 'fontSize', label: 'Wielkość liter', kind: 'number', min: 32, max: 200, step: 2 },
    { key: 'bold', label: 'Pogrubienie', kind: 'bool' },
    { key: 'color', label: 'Kolor tekstu', kind: 'color' },
    { key: 'hasBackground', label: 'Tło pod tekstem', kind: 'bool' },
    { key: 'background', label: 'Kolor tła', kind: 'color' },
  ],
  defaultProps: (): Record<string, unknown> => ({
    text: 'Napis', color: '#ffffff', background: '#1c2230', hasBackground: true, fontSize: 120, bold: true,
  }) satisfies TextProps,
  defaultTransform: () => flatTransform(0.8),
  async create(item) {
    const canvas = document.createElement('canvas')
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    const mesh = planeMesh(tex, 1)
    const g = new Group()
    g.add(mesh)
    const redraw = (p: Record<string, unknown>) => {
      const aspect = drawText(canvas, p as unknown as TextProps)
      tex.needsUpdate = true
      mesh.geometry.dispose()
      mesh.geometry = new PlaneGeometry(1, aspect)
    }
    redraw(item.props)
    applyTransform(g, item.transform)
    let last = JSON.stringify(item.props)
    return makeRuntime(g, {
      setTransform: (t) => applyTransform(g, t),
      setProps: (p) => {
        const s = JSON.stringify(p)
        if (s !== last) { last = s; redraw(p) }
      },
      dispose: () => {
        mesh.geometry.dispose()
        mesh.material.dispose()
        tex.dispose()
      },
    })
  },
})

// ───────────────── shared <audio>/<video> behaviour ─────────────────
function mediaControl(el: HTMLMediaElement) {
  let unlocked = false
  let muted = false
  let wanted = false // should be playing (target visible)
  const apply = () => {
    el.muted = !unlocked || muted
  }
  return {
    get unlocked() { return unlocked },
    async unlock() {
      if (unlocked) return
      try {
        el.muted = false
        // inside a user gesture this grants the element sound; without one the
        // promise may reject or stay pending, so never wait on it indefinitely
        await Promise.race([
          el.play(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
        ])
        if (!wanted) { el.pause(); el.currentTime = 0 }
        unlocked = true
      } catch {
        el.muted = true // autoplay blocked: stay silent (video still shows)
      }
      apply()
    },
    setMuted(m: boolean) { muted = m; apply() },
    play() {
      wanted = true
      apply()
      el.play().catch(() => { el.muted = true; el.play().catch(() => {}) })
    },
    stop(reset: boolean) {
      wanted = false
      el.pause()
      if (reset) el.currentTime = 0
    },
  }
}

function makeEl<K extends 'audio' | 'video'>(tag: K, blob: Blob) {
  const el = document.createElement(tag)
  el.preload = 'auto'
  el.setAttribute('playsinline', '')
  el.src = blobUrl(blob)
  return el
}

const waitMeta = (el: HTMLMediaElement) =>
  new Promise<void>((res, rej) => {
    if (el.readyState >= 1) return res()
    const t = setTimeout(res, 6000)
    el.onloadedmetadata = () => { clearTimeout(t); res() }
    el.onerror = () => { clearTimeout(t); rej(new Error('Nie udało się odczytać pliku multimedialnego.')) }
  })

// ───────────────────────── audio ─────────────────────────
registerContentType({
  type: 'audio',
  label: 'Dźwięk',
  accept: 'audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg',
  spatial: false,
  playable: true,
  fields: [
    { key: 'loop', label: 'Zapętl', kind: 'bool' },
    { key: 'restart', label: 'Odtwarzaj od początku po każdym rozpoznaniu', kind: 'bool' },
  ],
  defaultProps: () => ({ loop: false, restart: true }),
  defaultTransform: () => defaultTransform(),
  async create(item, blob) {
    if (!blob) throw new Error('Brak pliku dźwiękowego.')
    const el = makeEl('audio', blob)
    await waitMeta(el)
    const ctl = mediaControl(el)
    let restart = true
    const setProps = (p: Record<string, unknown>) => {
      el.loop = Boolean(p.loop)
      restart = p.restart !== false
    }
    setProps(item.props)
    return makeRuntime(new Group(), {
      info: { hasSound: true },
      setTransform() {},
      setProps,
      onFound: () => { if (restart) el.currentTime = 0; ctl.play() },
      onLost: () => ctl.stop(false),
      unlock: () => ctl.unlock(),
      setMuted: ctl.setMuted,
      dispose: () => { ctl.stop(true); URL.revokeObjectURL(el.src); el.removeAttribute('src'); el.load() },
    })
  },
})

// ───────────────────────── video ─────────────────────────
registerContentType({
  type: 'video',
  label: 'Wideo',
  accept: 'video/mp4,video/webm,.mp4,.webm',
  spatial: true,
  playable: true,
  fields: [
    { key: 'loop', label: 'Zapętl', kind: 'bool' },
    { key: 'sound', label: 'Odtwarzaj dźwięk', kind: 'bool' },
  ],
  defaultProps: () => ({ loop: true, sound: true }),
  // width 1 = exactly covers the picture; raise z / rotate for a floating "screen"
  defaultTransform: () => flatTransform(1),
  async create(item, blob) {
    if (!blob) throw new Error('Brak pliku wideo.')
    const el = makeEl('video', blob)
    await waitMeta(el)
    const aspect = el.videoWidth ? el.videoHeight / el.videoWidth : 9 / 16
    const tex = new VideoTexture(el)
    tex.colorSpace = SRGBColorSpace
    const mesh = planeMesh(tex, aspect)
    const g = new Group()
    g.add(mesh)
    applyTransform(g, item.transform)
    const ctl = mediaControl(el)
    let sound = true
    const setProps = (p: Record<string, unknown>) => {
      el.loop = Boolean(p.loop)
      sound = p.sound !== false
      ctl.setMuted(!sound)
    }
    setProps(item.props)
    el.muted = true
    return makeRuntime(g, {
      info: { hasSound: true },
      setTransform: (t) => applyTransform(g, t),
      setProps,
      onFound: () => ctl.play(),
      onLost: () => ctl.stop(false),
      unlock: () => ctl.unlock(),
      setMuted: (m) => ctl.setMuted(m || !sound),
      dispose: () => {
        ctl.stop(true)
        URL.revokeObjectURL(el.src)
        el.removeAttribute('src')
        el.load()
        mesh.geometry.dispose()
        mesh.material.dispose()
        tex.dispose()
      },
    })
  },
})
