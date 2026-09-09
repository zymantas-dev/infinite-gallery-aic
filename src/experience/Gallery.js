import * as THREE from 'three'

// A fixed pool of planes stacked along -z. Each plane owns a "station" index
// (its slot in the endless tunnel). As the camera flies forward the planes it
// has passed are recycled to the far end and re-bound to the next artwork from
// the queue, so the gallery never ends and memory stays flat.
class Gallery {
  constructor({ queue, poolSize = 14 } = {}) {
    this.queue = queue
    this.poolSize = poolSize
    this.isInitialized = false

    this.planes = []
    this.planeGeometry = new THREE.PlaneGeometry(3, 3)
    this.textureLoader = new THREE.TextureLoader()

    this.planeGap = 7.5
    this.desktopPlaneScale = 1.5
    this.mobilePlaneScale = 0.98
    this.mobileXSpreadFactor = 0.32
    this.mobileBreakpoint = 768

    // Curated horizontal rhythm (station -> x offset), clearly alternating
    // left/right with varied magnitude, jittered per recycle.
    this.xRhythm = [-0.58, 0.5, -0.42, 0.64, -0.6, 0.46]

    // Where the "active" plane sits ahead of the camera, in stations. Planes
    // fade out before the camera reaches them (never fly through an opaque
    // plane) while 2-3 stay visible receding into the distance. The gap +
    // wide opacity plateau give each artwork a long dwell as you scroll.
    this.activeStationOffset = 2.2
    this.moodSampleOffset = 2.2
    this.behindCount = 1
    this.maxRecyclesPerFrame = 3
    this.hiResRange = 3.5

    // Opacity curve (see opacityForStationDelta). A linear tent between the two
    // planes straddling the active point, remapped through smoothstep: holds
    // one image full across a plateau, then a clean hand-off. The window is
    // symmetric about 0.5 so the pair always sums to ~1 — no pop, no
    // double-bright, no dark gap.
    this.crossfadeLow = 0.26
    this.crossfadeHigh = 0.74

    this.planeFadeSmoothing = 0.14

    this.tailStation = 0
    this.headStation = 0

    // Parallax
    this.parallaxEnabled = true
    this.parallaxAmountX = 0.16
    this.parallaxAmountY = 0.08
    this.parallaxSmoothing = 0.08
    this.pointerTarget = new THREE.Vector2(0, 0)
    this.pointerCurrent = new THREE.Vector2(0, 0)

    // Breath (scroll-velocity driven tilt + scale pulse)
    this.breathEnabled = true
    this.breathTiltAmount = 0.045
    this.breathScaleAmount = 0.03
    this.breathSmoothing = 0.14
    this.breathGain = 1.1
    this.breathIntensity = 0
    this.targetBreathIntensity = 0

    // Gesture drift
    this.gestureParallaxEnabled = true
    this.gestureParallaxAmountY = 0.05
    this.gestureParallaxSmoothing = 0.05
    this.driftCurrent = 0
    this.driftTarget = 0

    this.onPointerMove = (event) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1
      const y = (event.clientY / window.innerHeight) * 2 - 1
      this.pointerTarget.set(x, -y)
    }
    this.onPointerLeave = () => {
      this.pointerTarget.set(0, 0)
    }
  }

  async init(scene) {
    if (this.isInitialized) return

    for (let index = 0; index < this.poolSize; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: '#c9c4bb',
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      })
      const mesh = new THREE.Mesh(this.planeGeometry, material)
      mesh.userData = {
        station: index,
        artwork: null,
        loadToken: 0,
        lowResTexture: null,
        hiResTexture: null,
        hiResRequested: false,
        baseX: 0,
        aspectRatio: 1,
        palette: null,
      }
      scene.add(mesh)
      this.planes.push(mesh)
      this.assignArtwork(mesh)
    }

    this.tailStation = 0
    this.headStation = this.poolSize - 1

    this.updatePlaneScale()
    this.layoutPlanes()
    this.bindPointerEvents()

    // Give the nearest planes their sharp textures up front.
    await this.preloadInitialTextures()

    this.isInitialized = true
  }

  async preloadInitialTextures() {
    const nearest = this.planes.slice(0, Math.min(6, this.planes.length))
    await Promise.all(
      nearest.map(
        (plane) =>
          new Promise((resolve) => {
            const artwork = plane.userData.artwork
            if (!artwork) return resolve()
            this.textureLoader.load(
              artwork.thumbUrl,
              (texture) => {
                this.applyTexture(plane, texture, plane.userData.loadToken)
                resolve()
              },
              undefined,
              () => resolve()
            )
          })
      )
    )
  }

  assignArtwork(plane) {
    const artwork = this.queue.next() || plane.userData.artwork
    if (!artwork) return

    const rhythmIndex =
      ((plane.userData.station % this.xRhythm.length) + this.xRhythm.length) % this.xRhythm.length

    plane.userData.loadToken += 1
    plane.userData.artwork = artwork
    plane.userData.palette = artwork.palette
    plane.userData.aspectRatio = artwork.aspectRatio
    plane.userData.baseX = this.xRhythm[rhythmIndex] + (Math.random() * 2 - 1) * 0.1
    plane.userData.hiResRequested = false

    this.disposePlaneTextures(plane)
    plane.material.map = null
    plane.material.color.set('#cdc7bd')
    plane.material.opacity = 0
    plane.material.needsUpdate = true

    this.requestTexture(plane, artwork.thumbUrl, false)
  }

  requestTexture(plane, url, isHiRes) {
    const token = plane.userData.loadToken
    if (isHiRes) plane.userData.hiResRequested = true

    this.textureLoader.load(
      url,
      (texture) => this.applyTexture(plane, texture, token, isHiRes),
      undefined,
      () => {
        if (isHiRes) plane.userData.hiResRequested = false
      }
    )
  }

  applyTexture(plane, texture, token, isHiRes = false) {
    if (token !== plane.userData.loadToken) {
      texture.dispose()
      return
    }

    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4

    if (isHiRes) {
      this.disposeTexture(plane.userData.hiResTexture)
      plane.userData.hiResTexture = texture
    } else {
      this.disposeTexture(plane.userData.lowResTexture)
      plane.userData.lowResTexture = texture
      if (plane.userData.hiResTexture) {
        texture.dispose()
        return
      }
    }

    const image = texture.image
    if (image && image.width > 0 && image.height > 0) {
      plane.userData.aspectRatio = THREE.MathUtils.clamp(image.width / image.height, 0.5, 2.2)
    }

    plane.material.map = texture
    plane.material.color.set('#ffffff')
    plane.material.needsUpdate = true
  }

  disposeTexture(texture) {
    if (texture) texture.dispose()
  }

  disposePlaneTextures(plane) {
    this.disposeTexture(plane.userData.lowResTexture)
    this.disposeTexture(plane.userData.hiResTexture)
    plane.userData.lowResTexture = null
    plane.userData.hiResTexture = null
  }

  isMobileViewport() {
    // Guard against a 0-width viewport (hidden tab) collapsing to mobile.
    const width = window.innerWidth
    return width > 0 && width <= this.mobileBreakpoint
  }

  getXSpreadFactor() {
    return this.isMobileViewport() ? this.mobileXSpreadFactor : 1
  }

  getBaseScale() {
    return this.isMobileViewport() ? this.mobilePlaneScale : this.desktopPlaneScale
  }

  updatePlaneScale() {
    const scale = this.getBaseScale()
    this.planes.forEach((plane) => {
      const aspectRatio = plane.userData.aspectRatio || 1
      plane.scale.set(scale * aspectRatio, scale, 1)
    })
  }

  layoutPlanes() {
    const xSpread = this.getXSpreadFactor()
    this.planes.forEach((plane) => {
      plane.position.set(
        plane.userData.baseX * xSpread,
        0,
        -plane.userData.station * this.planeGap
      )
    })
  }

  planeAtStation(station) {
    return this.planes.find((plane) => plane.userData.station === station) || null
  }

  recycleForward() {
    const plane = this.planeAtStation(this.tailStation)
    if (!plane) return
    plane.userData.station = this.headStation + 1
    this.headStation += 1
    this.tailStation += 1
    this.assignArtwork(plane)
    this.positionPlane(plane)
  }

  recycleBackward() {
    const plane = this.planeAtStation(this.headStation)
    if (!plane) return
    plane.userData.station = this.tailStation - 1
    this.tailStation -= 1
    this.headStation -= 1
    this.assignArtwork(plane)
    this.positionPlane(plane)
  }

  positionPlane(plane) {
    const xSpread = this.getXSpreadFactor()
    const scale = this.getBaseScale()
    const aspectRatio = plane.userData.aspectRatio || 1
    plane.position.set(plane.userData.baseX * xSpread, 0, -plane.userData.station * this.planeGap)
    plane.scale.set(scale * aspectRatio, scale, 1)
  }

  cameraStationFloat(cameraZ) {
    return -cameraZ / this.planeGap
  }

  recycle(cameraZ) {
    const desiredTail = Math.floor(this.cameraStationFloat(cameraZ)) - this.behindCount

    let budget = this.maxRecyclesPerFrame
    while (this.tailStation < desiredTail && budget > 0) {
      this.recycleForward()
      budget -= 1
    }
    while (this.tailStation > desiredTail && budget > 0) {
      this.recycleBackward()
      budget -= 1
    }
  }

  paletteForStation(station) {
    const clamped = THREE.MathUtils.clamp(station, this.tailStation, this.headStation)
    const plane = this.planeAtStation(clamped)
    return plane?.userData.palette || null
  }

  moodFromPalette(palette) {
    if (!palette) return null
    return {
      background: palette.backgroundColor,
      blob1: palette.blob1Color,
      blob2: palette.blob2Color,
    }
  }

  getMoodBlendData(cameraZ) {
    const sampleFloat = -cameraZ / this.planeGap + this.moodSampleOffset
    const currentStation = Math.floor(sampleFloat)
    // Same plateau remap as the plane crossfade so the background hue holds
    // with the active artwork and hands off with it.
    const blend = THREE.MathUtils.smoothstep(sampleFloat - currentStation, 0.38, 0.62)

    const currentMood = this.moodFromPalette(this.paletteForStation(currentStation))
    const nextMood =
      this.moodFromPalette(this.paletteForStation(currentStation + 1)) || currentMood
    if (!currentMood) return null

    return { currentMood, nextMood, blend }
  }

  getDepthProgress(cameraZ) {
    // No start/end in an endless tunnel — a slow drift keeps the background
    // blobs gently breathing as the camera advances.
    return 0.5 + 0.5 * Math.sin(-cameraZ * 0.025)
  }

  activeStationFloat(cameraZ) {
    return -cameraZ / this.planeGap + this.activeStationOffset
  }

  getActiveArtwork() {
    // Whichever plane is currently most present on screen — keeps the label
    // and the dominant image in sync regardless of the fade curve.
    let best = null
    let bestScore = 0.05
    this.planes.forEach((plane) => {
      const score = Number.isFinite(plane.material.opacity) ? plane.material.opacity : 0
      if (score > bestScore && plane.userData.artwork) {
        bestScore = score
        best = plane
      }
    })
    if (!best) return null
    return {
      artwork: best.userData.artwork,
      palette: best.userData.palette,
      station: best.userData.station,
    }
  }

  // One continuous function of `delta` = (plane station) - (fractional active
  // station). No Math.floor, no separate layers — just the two planes
  // straddling the active point cross-fading. Holds one image full across a
  // plateau (|delta| small), hands off over ~0.5 station, nothing else visible.
  opacityForStationDelta(delta) {
    const window = Math.max(0, 1 - Math.abs(delta))
    return THREE.MathUtils.smoothstep(window, this.crossfadeLow, this.crossfadeHigh)
  }

  updatePlaneVisibility(cameraZ) {
    const activeStation = -cameraZ / this.planeGap + this.activeStationOffset

    this.planes.forEach((plane) => {
      const delta = plane.userData.station - activeStation
      const target = this.opacityForStationDelta(delta)
      const current = Number.isFinite(plane.material.opacity) ? plane.material.opacity : 0
      plane.material.opacity = THREE.MathUtils.lerp(current, target, this.planeFadeSmoothing)
    })
  }

  updateTextureQuality(cameraZ) {
    const activeStation = this.activeStationFloat(cameraZ)
    this.planes.forEach((plane) => {
      if (plane.userData.hiResRequested || !plane.userData.artwork) return
      if (Math.abs(plane.userData.station - activeStation) <= this.hiResRange) {
        this.requestTexture(plane, plane.userData.artwork.fullUrl, true)
      }
    })
  }

  bindPointerEvents() {
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('pointerleave', this.onPointerLeave, { passive: true })
  }

  updatePlaneMotion(scroll) {
    this.pointerCurrent.lerp(this.pointerTarget, this.parallaxSmoothing)

    const velocityMax = Math.max(scroll?.velocityMax || 1, 0.0001)
    const velocityNormalized = THREE.MathUtils.clamp(
      Math.abs(scroll?.velocity || 0) / velocityMax,
      0,
      1
    )
    const scrollDrift = THREE.MathUtils.clamp((scroll?.velocity || 0) / velocityMax, -1, 1)

    this.targetBreathIntensity = this.breathEnabled
      ? THREE.MathUtils.clamp(velocityNormalized * this.breathGain, 0, 1)
      : 0
    this.breathIntensity = THREE.MathUtils.lerp(
      this.breathIntensity,
      this.targetBreathIntensity,
      this.breathSmoothing
    )
    this.driftTarget = this.gestureParallaxEnabled ? scrollDrift : 0
    this.driftCurrent = THREE.MathUtils.lerp(
      this.driftCurrent,
      this.driftTarget,
      this.gestureParallaxSmoothing
    )

    const xSpread = this.getXSpreadFactor()
    const baseScale = this.getBaseScale()

    this.planes.forEach((plane) => {
      const opacity = Number.isFinite(plane.material.opacity) ? plane.material.opacity : 0
      const depthInfluence = 1 + Math.max(plane.userData.station - this.tailStation, 0) * 0.03
      const parallaxInfluence = this.parallaxEnabled ? opacity * depthInfluence : 0

      const parallaxOffsetX = this.pointerCurrent.x * this.parallaxAmountX * parallaxInfluence
      const parallaxOffsetY = this.pointerCurrent.y * this.parallaxAmountY * parallaxInfluence
      const gestureOffsetY = this.driftCurrent * this.gestureParallaxAmountY

      plane.position.x = plane.userData.baseX * xSpread + parallaxOffsetX
      plane.position.y = parallaxOffsetY + gestureOffsetY
      plane.position.z = -plane.userData.station * this.planeGap

      const breathInfluence = this.breathEnabled ? this.breathIntensity * opacity : 0
      plane.rotation.x = -this.pointerCurrent.y * this.breathTiltAmount * breathInfluence
      plane.rotation.y = this.pointerCurrent.x * this.breathTiltAmount * breathInfluence

      const aspectRatio = plane.userData.aspectRatio || 1
      const scalePulse = 1 + this.breathScaleAmount * breathInfluence
      plane.scale.set(baseScale * aspectRatio * scalePulse, baseScale * scalePulse, 1)
    })
  }

  update(camera, scroll) {
    if (!camera) return
    const cameraZ = camera.position.z
    this.recycle(cameraZ)
    this.updatePlaneVisibility(cameraZ)
    this.updateTextureQuality(cameraZ)
    this.updatePlaneMotion(scroll)
  }

  dispose() {
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerleave', this.onPointerLeave)
    this.planes.forEach((plane) => {
      this.disposePlaneTextures(plane)
      plane.material.dispose()
    })
    this.planeGeometry.dispose()
    this.planes = []
  }
}

export { Gallery }
