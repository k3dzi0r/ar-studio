import { useEffect, useRef } from 'react'
import {
  AmbientLight,
  Clock,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ContentRuntime } from '../../core/render'

interface Props {
  imageUrl: string | undefined
  aspect: number
  runtimes: ContentRuntime[]
}

/**
 * Editor preview. Uses the same anchor-space convention as the scanner
 * (target width 1, z out of the picture), so what you see here is what the
 * scanner shows over the printed image.
 */
export default function Stage({ imageUrl, aspect, runtimes }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const planeRef = useRef<Mesh | null>(null)
  const rtsRef = useRef<ContentRuntime[]>([])
  rtsRef.current = runtimes

  useEffect(() => {
    const el = host.current!
    const renderer = new WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    const scene = new Scene()
    sceneRef.current = scene
    scene.add(new AmbientLight(0xffffff, 0.8), new HemisphereLight(0xffffff, 0x445566, 1.2))
    const sun = new DirectionalLight(0xffffff, 1.6)
    sun.position.set(1, -1, 2)
    scene.add(sun)

    const camera = new PerspectiveCamera(40, 1, 0.01, 50)
    camera.up.set(0, 0, 1)
    camera.position.set(0, -1.7, 1.3)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0.25)
    controls.maxPolarAngle = Math.PI * 0.49

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const clock = new Clock()
    renderer.setAnimationLoop(() => {
      const dt = clock.getDelta()
      for (const r of rtsRef.current) r.update(dt)
      controls.update()
      renderer.render(scene, camera)
    })

    return () => {
      ro.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
    }
  }, [])

  // target image plane
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    if (planeRef.current) {
      scene.remove(planeRef.current)
      planeRef.current.geometry.dispose()
      ;(planeRef.current.material as MeshBasicMaterial).map?.dispose()
      planeRef.current = null
    }
    if (!imageUrl) return
    const tex = new TextureLoader().load(imageUrl)
    tex.colorSpace = SRGBColorSpace
    const mesh = new Mesh(
      new PlaneGeometry(1, aspect),
      new MeshBasicMaterial({ map: tex }),
    )
    scene.add(mesh)
    planeRef.current = mesh
  }, [imageUrl, aspect])

  // content objects
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const objs: Object3D[] = runtimes.map((r) => r.object)
    objs.forEach((o) => scene.add(o))
    return () => objs.forEach((o) => scene.remove(o))
  }, [runtimes])

  return <div className="stage" ref={host} />
}
