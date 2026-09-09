import * as THREE from 'three'
import { Experience } from './index'
import { Scroll } from './Scroll'

class Engine {
  constructor(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Engine requires a valid canvas element')
    }

    this.canvas = canvas
    this.experience = new Experience()
    this.isInitialized = false
    this.isRunning = false
    this.animationFrameRequestId = null

    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    this.camera.position.set(0, 0, 5)

    this.scroll = new Scroll(this.camera)

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.autoClear = false

    this.onResize = () => this.resize()
    this.animate = this.update.bind(this)
  }

  async init() {
    if (this.isInitialized) return

    document.body.classList.add('loading')

    try {
      await this.experience.init(this.scene, this.camera)
      this.scroll.init()

      this.resize()
      window.addEventListener('resize', this.onResize)
      // Catches the canvas going from 0 -> real size (e.g. loaded in a hidden
      // tab), which a plain resize event can miss.
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.resize())
        this.resizeObserver.observe(this.canvas)
      }
      this.scroll.bindEvents()

      this.isInitialized = true
      this.start()
    } finally {
      document.body.classList.remove('loading')
    }
  }

  start() {
    if (!this.isInitialized || this.isRunning) return
    this.isRunning = true
    this.update()
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth || 1
    const height = this.canvas.clientHeight || window.innerHeight || 1
    if (width <= 0 || height <= 0) return

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)

    if (this.experience.gallery.isInitialized) {
      this.experience.gallery.updatePlaneScale()
      this.experience.gallery.layoutPlanes()
    }
  }

  update() {
    if (!this.isRunning) return

    this.animationFrameRequestId = requestAnimationFrame(this.animate)

    const time = performance.now()

    this.scroll.update()
    this.experience.update(time, this.camera, this.scroll)

    this.renderer.clear(true, true, true)
    this.experience.background.render(this.renderer)
    this.renderer.clearDepth()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.isRunning = false

    if (this.animationFrameRequestId !== null) {
      cancelAnimationFrame(this.animationFrameRequestId)
      this.animationFrameRequestId = null
    }

    window.removeEventListener('resize', this.onResize)
    this.resizeObserver?.disconnect()
    this.scroll.dispose()
    this.experience.dispose()
    this.renderer.dispose()
  }
}

export { Engine }
