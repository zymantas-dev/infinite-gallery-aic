import * as THREE from 'three'
import { ArtworkQueue } from './ArtworkQueue'
import { Gallery } from './Gallery'
import { Background } from './background'
import { Label } from './Label'
import { TrailController } from './TrailController'

class Experience {
  constructor() {
    this.queue = new ArtworkQueue()
    this.gallery = new Gallery({ queue: this.queue })
    this.label = new Label(this.gallery)
    this.background = new Background()
    this.trailController = new TrailController({ gallery: this.gallery })

    this.isInitialized = false
    this.isDisposed = false
  }

  async init(scene, camera) {
    if (this.isInitialized) return

    await this.queue.init()
    await this.gallery.init(scene)
    this.label.init()
    this.background.init()
    this.trailController.init(scene, camera)

    // The generated palettes are all light tints — keep the overlay text dark.
    document.body.classList.add('frame-text-dark')

    this.isInitialized = true
  }

  update(time, camera = null, scroll = null) {
    this.trailController.update(camera, scroll, time)
    this.gallery.update(camera, scroll)
    this.label.update(camera)

    if (camera) {
      const moodBlend = this.gallery.getMoodBlendData(camera.position.z)
      if (moodBlend) this.background.setMoodBlend(moodBlend)

      const depthProgress = this.gallery.getDepthProgress(camera.position.z)
      const velocityMax = scroll?.velocityMax || 1
      const velocityIntensity = THREE.MathUtils.clamp(
        Math.abs(scroll?.velocity || 0) / Math.max(velocityMax, 0.0001),
        0,
        1
      )
      this.background.setMotionResponse({ depthProgress, velocityIntensity })
    }

    this.background.update(time)
  }

  dispose() {
    if (this.isDisposed) return
    this.trailController.dispose()
    this.gallery.dispose()
    this.label.dispose()
    this.background.dispose()
    this.isDisposed = true
  }
}

export { Experience }
