import {
  AnimationMixer,
  Box3,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  Vector3,
  type AnimationAction,
  type Material,
  type Texture,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { makeRuntime, registerContentType } from './registry'
import { defaultTransform, type Transform } from '../types'

export interface Model3DProps {
  /** animation clip index, -1 = none */
  clip: number
  loop: boolean
}

function applyTransform(g: Group, t: Transform) {
  g.position.set(...t.position)
  g.rotation.set(...(t.rotation.map((d) => (d * Math.PI) / 180) as [number, number, number]))
  g.scale.setScalar(t.scale)
}

function disposeTree(root: Group) {
  root.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    const mats: Material[] = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v && (v as Texture).isTexture) (v as Texture).dispose()
      mat.dispose()
    }
  })
}

/**
 * Scene-graph layout (anchor space: target width = 1, +x right, +y up along
 * the image, +z out of the image toward the viewer):
 *   user(transform) → stand(rotX 90°: model "up" becomes +z) → model(normalised)
 * The model is normalised to a 1-unit bounding box sitting on the image plane,
 * so `scale` 0.5 means "half the width of the picture".
 */
registerContentType({
  type: 'model3d',
  label: 'Model 3D',
  accept: '.glb,.gltf,model/gltf-binary,model/gltf+json',
  spatial: true,
  fields: [],
  defaultTransform: () => ({ ...defaultTransform(), scale: 0.6 }),
  defaultProps: (): Record<string, unknown> => ({ clip: 0, loop: true }) satisfies Model3DProps,

  async create(item, blob) {
    if (!blob) throw new Error('Brak pliku modelu.')
    const gltf = await new GLTFLoader().parseAsync(await blob.arrayBuffer(), '')
    const model = gltf.scene

    const box = new Box3().setFromObject(model)
    const size = box.getSize(new Vector3())
    const k = 1 / Math.max(size.x, size.y, size.z, 1e-6)
    model.scale.multiplyScalar(k)
    const b2 = new Box3().setFromObject(model)
    const c = b2.getCenter(new Vector3())
    model.position.set(-c.x, -b2.min.y, -c.z)

    const stand = new Group()
    stand.rotation.x = Math.PI / 2
    stand.add(model)
    const user = new Group()
    user.add(stand)

    const mixer = gltf.animations.length ? new AnimationMixer(model) : null
    let action: AnimationAction | null = null
    let playing = true

    const setProps = (p: Record<string, unknown>) => {
      const props = p as unknown as Model3DProps
      action?.stop()
      action = null
      if (mixer && props.clip >= 0 && gltf.animations[props.clip]) {
        action = mixer.clipAction(gltf.animations[props.clip])
        action.setLoop(props.loop ? LoopRepeat : LoopOnce, Infinity)
        action.clampWhenFinished = true
        action.reset().play()
        action.paused = !playing
      }
    }

    applyTransform(user, item.transform)
    setProps(item.props)

    return makeRuntime(user, {
      info: { clips: gltf.animations.map((a, i) => a.name || `Animacja ${i + 1}`) },
      update: (dt) => {
        if (playing) mixer?.update(dt)
      },
      setTransform: (t) => applyTransform(user, t),
      setProps,
      onFound: () => {
        playing = true
        if (action) {
          action.paused = false
          action.reset().play() // restart one-shot animations on re-detection
        }
      },
      onLost: () => {
        playing = false // freeze while the target is not visible
      },
      dispose: () => {
        mixer?.stopAllAction()
        disposeTree(user)
      },
    })
  },
})
