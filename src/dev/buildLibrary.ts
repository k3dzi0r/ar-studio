import { getContentType } from '../core/render'
import { compileTarget } from '../core/recognition/compile'
import { repo, uid } from '../core/storage/db'
import { exportPack } from '../core/storage/pack'
import { DEFAULT_COLLECTION_ID, type ARCard, type AssetCredit, type ContentItem } from '../core/types'
import { cardImage, face as drawFace, faceImage, modelGlb, motifs, planetCredit, sounds, type Emotion, type Model, type Motif } from './assets'

interface CardSpec {
  name: string
  hue: number
  motif: () => Motif | Promise<Motif>
  imageCredit?: AssetCredit
  content: (put: (b: Blob, n: string) => Promise<string>) => Promise<ContentItem[]>
}
interface PackSpec { id: string; revision?: number; name: string; description: string; cards: CardSpec[] }

const item = (type: string, name: string, assetId: string | undefined, over: Partial<ContentItem> = {}): ContentItem => {
  const ct = getContentType(type)
  return { id: uid(), type, name, assetId, props: ct.defaultProps(), transform: ct.defaultTransform(), ...over }
}

const modelCard = (name: string, hue: number, kind: Model, sound: () => Blob): CardSpec => ({
  name, hue, motif: () => motifs[kind],
  content: async (put) => [
    item('model3d', `${name}.glb`, await put(await modelGlb(kind), `${name}.glb`), {
      credit: kind === 'cube' || kind === 'ball' || kind === 'pyramid' ? undefined : planetCredit,
    }),
    item('audio', `${name}.wav`, await put(sound(), `${name}.wav`), { props: { loop: false, restart: true } }),
  ],
})

const emotionCard = (name: string, hue: number, e: Emotion): CardSpec => ({
  name, hue, motif: () => (x, cx, cy, r) => drawFace(x, cx, cy, r, e),
  content: async (put) => [
    item('image2d', `${name}.png`, await put(await faceImage(e), `${name}.png`), {
      transform: { position: [0, 0, 0.35], rotation: [0, 0, 0], scale: 0.7 },
    }),
    item('audio', `${name}.wav`, await put(sounds[e](), `${name}.wav`)),
  ],
})

const animalCard = (name: string, hue: number, key: string, photo: AssetCredit, sound: AssetCredit): CardSpec => {
  const photoUrl = new URL(`./animals/${key}.jpg`, import.meta.url).href
  const soundUrl = new URL(`./animals/${key}.mp3`, import.meta.url).href
  const load = async (url: string) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Brakuje pliku karty „${name}”.`)
    return response.blob()
  }
  return {
    name, hue, imageCredit: photo,
    motif: async () => {
      const bitmap = await createImageBitmap(await load(photoUrl))
      return (ctx, x, y, radius) => {
        ctx.save()
        ctx.beginPath()
        ctx.arc(x, y, radius + 12, 0, 2 * Math.PI)
        ctx.clip()
        const scale = (radius + 12) * 2 / Math.min(bitmap.width, bitmap.height)
        const width = bitmap.width * scale
        const height = bitmap.height * scale
        ctx.drawImage(bitmap, x - width / 2, y - height / 2, width, height)
        ctx.restore()
        bitmap.close()
      }
    },
    content: async (put) => [
      item('image2d', `${name}.jpg`, await put(await load(photoUrl), `${name}.jpg`), {
        credit: photo,
        transform: { position: [0, 0, 0.32], rotation: [0, 0, 0], scale: 0.65 },
      }),
      item('audio', `${name}.mp3`, await put(await load(soundUrl), `${name}.mp3`), {
        credit: sound, props: { loop: false, restart: true },
      }),
    ],
  }
}

const cc0 = (creator: string, sourceUrl: string): AssetCredit => ({ creator, sourceUrl, license: 'CC0' })

export const PACKS: PackSpec[] = [
  {
    id: 'kosmos', name: 'Kosmos', description: 'Słońce, Ziemia, Księżyc i Saturn jako obracające się modele 3D z dźwiękiem.',
    cards: [
      modelCard('Słońce', 35, 'sun', () => sounds.space(-5)),
      modelCard('Ziemia', 210, 'earth', () => sounds.space(0)),
      modelCard('Księżyc', 250, 'moon', () => sounds.space(4)),
      modelCard('Saturn', 30, 'saturn', () => sounds.space(7)),
    ],
  },
  {
    id: 'ksztalty', name: 'Kształty', description: 'Sześcian, kula i piramida — obracające się bryły, każda z innym dźwiękiem.',
    cards: [
      modelCard('Sześcian', 10, 'cube', () => sounds.note(0)),
      modelCard('Kula', 215, 'ball', () => sounds.note(4)),
      modelCard('Piramida', 45, 'pyramid', () => sounds.note(7)),
    ],
  },
  {
    id: 'emocje', name: 'Emocje', description: 'Radość, smutek, złość i zdziwienie: unosząca się buźka i dźwięk pasujący do emocji.',
    cards: [
      emotionCard('Radość', 50, 'joy'),
      emotionCard('Smutek', 215, 'sad'),
      emotionCard('Złość', 5, 'angry'),
      emotionCard('Zdziwienie', 285, 'surprise'),
    ],
  },
  {
    id: 'zwierzeta', revision: 1, name: 'Zwierzęta',
    description: 'Pies, kot, krowa i koń. Wydrukuj karty, zeskanuj zdjęcia i posłuchaj prawdziwych odgłosów.',
    cards: [
      animalCard('Pies', 155, 'dog',
        cc0('roman.schurte', 'https://www.flickr.com/photos/131705628@N06/16120825474'),
        cc0('LittleBigSounds', 'https://freesound.org/people/LittleBigSounds/sounds/163459/')),
      animalCard('Kot', 280, 'cat',
        cc0('Burnt Pineapple Productions', 'https://www.flickr.com/photos/51686021@N07/42700002412'),
        cc0('lextrack', 'https://freesound.org/people/lextrack/sounds/333916/')),
      animalCard('Krowa', 38, 'cow',
        cc0('Philippe Vieux-Jeanton', 'https://www.flickr.com/photos/11234074@N05/19805268310'),
        cc0('JarredGibb', 'https://freesound.org/people/JarredGibb/sounds/233146/')),
      animalCard('Koń', 210, 'horse',
        cc0('mnsc', 'https://www.flickr.com/photos/49976053@N00/1053024318'),
        cc0('Kubuzz', 'https://freesound.org/people/Kubuzz/sounds/347036/')),
    ],
  },
]

/** Distinct seed per card (FNV-1a) — identical artwork across cards makes the matcher confuse them. */
const hash = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261)

async function post(path: string, body: Blob | string) {
  const r = await fetch(`/__dev/save?path=${encodeURIComponent(path)}`, { method: 'POST', body })
  if (!r.ok) throw new Error(`save ${path}: ${r.status}`)
}

export async function buildPack(id: string, log: (s: string) => void) {
  const spec = PACKS.find((p) => p.id === id)!
  const cards: ARCard[] = []
  let cover: Blob | null = null
  for (const cs of spec.cards) {
    log(`${spec.name}: ${cs.name} — kompiluję…`)
    const img = await cardImage(cs.name, hash(`${id}/${cs.name}`), cs.hue, await cs.motif())
    const t = await compileTarget(img, () => {})
    log(`  jakość ${t.quality.score}/100, punkty ${t.quality.featureCount}, pokrycie ${Math.round(t.quality.coverage * 100)}%`)
    const put = (b: Blob, n: string) => repo.putAsset(b, n)
    const contents = await cs.content(put)
    const card: ARCard = {
      id: uid(), name: cs.name, createdAt: Date.now(), updatedAt: Date.now(), collectionIds: [DEFAULT_COLLECTION_ID],
      imageCredit: cs.imageCredit, imageAssetId: await put(t.image, 'target.jpg'), mindAssetId: await put(new Blob([t.mind as BlobPart]), 'target.mind'),
      aspect: t.aspect, quality: t.quality, contents,
    }
    await repo.saveCard(card)
    cards.push(card)
    cover ??= t.image
  }
  const pack = await exportPack(cards, spec.name)
  await post(`${id}.arpack`, pack)
  await post(`${id}.jpg`, cover!)
  for (const c of cards) await repo.deleteCard(c.id) // keep the dev DB clean
  log(`${spec.name}: gotowe (${Math.round(pack.size / 1024)} KB)`)
  return { id, revision: spec.revision ?? 2, name: spec.name, description: spec.description, file: `${id}.arpack`, cover: `${id}.jpg`, size: pack.size, cards: cards.map((c) => ({ name: c.name, score: c.quality.score })) }
}

export async function buildAll(log: (s: string) => void) {
  const index = []
  for (const p of PACKS) index.push(await buildPack(p.id, log))
  await post('index.json', JSON.stringify({ version: 1, packs: index }, null, 2))
  log('index.json zapisany')
}
