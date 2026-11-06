declare module 'mind-ar/dist/mindar-image.prod.js' {
  export class Compiler {
    data: unknown[] | null
    compileImageTargets(
      images: Array<HTMLImageElement | HTMLCanvasElement>,
      progress: (percent: number) => void,
    ): Promise<unknown[]>
    exportData(): Uint8Array
    importData(buffer: ArrayBuffer | Uint8Array): unknown[]
  }
}

declare module 'mind-ar/dist/mindar-image-three.prod.js' {
  import type { Group, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
  export interface MindARAnchor {
    group: Group
    targetIndex: number
    onTargetFound: (() => void) | null
    onTargetLost: (() => void) | null
    onTargetUpdate: (() => void) | null
    visible: boolean
  }
  export class MindARThree {
    constructor(opts: {
      container: HTMLElement
      imageTargetSrc: string
      maxTrack?: number
      uiLoading?: string
      uiScanning?: string
      uiError?: string
      filterMinCF?: number | null
      filterBeta?: number | null
      warmupTolerance?: number | null
      missTolerance?: number | null
      userDeviceId?: string | null
      environmentDeviceId?: string | null
    })
    renderer: WebGLRenderer
    scene: Scene
    camera: PerspectiveCamera
    shouldFaceUser: boolean
    video: HTMLVideoElement
    addAnchor(targetIndex: number): MindARAnchor
    start(): Promise<void>
    stop(): void
  }
}
