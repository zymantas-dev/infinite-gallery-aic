import * as THREE from 'three'
import { Trail } from './Trail'
import { TrailHeadParticles } from './TrailHeadParticles'

const TWO_PI = Math.PI * 2

// Drives a weaving glowing path just ahead of the camera. Adapted from the
// Depth Gallery element for an endless tunnel: the path parameter is the raw
// distance flown (no 0..1 clamp), and the wave uses whole-number cycles so the
// curve stays perfectly continuous no matter how far you travel. The head sits
// a fixed lead distance ahead of the camera instead of tracking a finish line.
class TrailController {
  constructor({ gallery } = {}) {
    this.trail = new Trail()
    this.trailHeadParticles = new TrailHeadParticles()
    this.gallery = gallery
    this.trailHeadPosition = new THREE.Vector3()
    this.timer = new THREE.Timer()

    this.config = {
      isEnabled: true,
      showHeadParticles: true,
      startXPosition: -0.96,
      startYPosition: -1.05,
      horizontalWidth: 2.6,
      horizontalCycles: 2, // whole numbers keep the weave continuous
      verticalAmplitude: 0.7,
      verticalCycles: 3,
      leadDistance: 3.1, // how far ahead of the camera the head rides
      pathScale: 0.05, // distance-flown -> path phase
      minPoints: 40,
      maxPoints: 150,
      reverseLengthScale: 0.55,
      trimPerFrameForward: 4,
      trimPerFrameReverse: 28,
      baseOpacity: 0.5,
      idleOpacity: 0.28,
      opacitySmoothing: 0.08,
      directionChangeEpsilon: 0.0004,
    }

    this.state = {
      hasSeeded: false,
      previousPhase: null,
      previousDirection: 0,
      currentOpacity: this.config.baseOpacity,
      movementEnergy: 0,
    }

    this.applyVisualSettings()
  }

  applyVisualSettings() {
    this.trail.material.color.set('#f6f9ff')
    this.trail.material.emissive.set('#8fdcff')
    this.trail.material.emissiveIntensity = 1.35
    this.trail.material.opacity = this.config.baseOpacity
    this.trail.material.needsUpdate = true
    this.trail.curveTension = 0.67
    this.trail.pointSmoothing = 0.5
  }

  init(scene, camera) {
    scene.add(this.trail.object)
    scene.add(this.trailHeadParticles.object)
    this.seedInitialPoints(camera)
  }

  phaseFromCamera(cameraZ) {
    // -cameraZ grows as the camera flies forward; scale it into wave phase.
    return -cameraZ * this.config.pathScale
  }

  computeHeadPosition(cameraZ, phase) {
    const c = this.config
    const isMobile =
      typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth <= 768
    const startX = c.startXPosition + (isMobile ? 0.35 : 0)
    const width = c.horizontalWidth * (isMobile ? 0.4 : 1)

    const x = startX + Math.sin(phase * TWO_PI * c.horizontalCycles) * width
    const y = c.startYPosition + Math.sin(phase * TWO_PI * c.verticalCycles + Math.PI / 2) * c.verticalAmplitude
    const z = cameraZ - c.leadDistance

    this.trailHeadPosition.set(x, y, z)
    return this.trailHeadPosition
  }

  seedInitialPoints(camera) {
    if (this.state.hasSeeded || !camera) return
    const start = this.computeHeadPosition(camera.position.z, this.phaseFromCamera(camera.position.z))
    for (let index = 10; index >= 0; index -= 1) {
      const seed = start.clone()
      seed.z -= index * 0.12
      this.trail.addPoint(seed)
    }
    this.state.hasSeeded = true
  }

  getDirection(phase) {
    if (this.state.previousPhase === null) return 0
    const delta = phase - this.state.previousPhase
    if (Math.abs(delta) <= this.config.directionChangeEpsilon) return 0
    return Math.sign(delta)
  }

  updateLength(direction) {
    const c = this.config
    const energy = THREE.MathUtils.clamp(this.state.movementEnergy, 0, 1)
    const lengthEnergy = direction < 0 ? energy * c.reverseLengthScale : energy
    this.trail.maxPoints = Math.round(
      THREE.MathUtils.lerp(c.minPoints, c.maxPoints, THREE.MathUtils.clamp(lengthEnergy, 0, 1))
    )
    this.trail.maxTrimPerFrame =
      direction < 0 ? c.trimPerFrameReverse : c.trimPerFrameForward
  }

  updateOpacity() {
    const c = this.config
    const energy = THREE.MathUtils.clamp(this.state.movementEnergy, 0, 1)
    const target = THREE.MathUtils.lerp(c.idleOpacity, c.baseOpacity, energy)
    this.state.currentOpacity = THREE.MathUtils.lerp(
      this.state.currentOpacity,
      target,
      c.opacitySmoothing
    )
    this.trail.material.opacity = this.state.currentOpacity
  }

  update(camera = null, scroll = null, time = null) {
    if (!camera) return
    if (Number.isFinite(time)) this.timer.update(time)
    else this.timer.update()
    const deltaSeconds = this.timer.getDelta()

    this.trail.object.visible = this.config.isEnabled
    const showParticles = this.config.isEnabled && this.config.showHeadParticles
    this.trailHeadParticles.setEnabled(showParticles)
    if (!this.config.isEnabled) return

    const velocityMax = Math.max(scroll?.velocityMax || 1, 0.0001)
    const velocityNormalized = THREE.MathUtils.clamp(
      Math.abs(scroll?.velocity || 0) / velocityMax,
      0,
      1
    )
    this.state.movementEnergy = THREE.MathUtils.lerp(
      this.state.movementEnergy,
      velocityNormalized,
      0.08
    )

    const phase = this.phaseFromCamera(camera.position.z)
    const direction = this.getDirection(phase)
    const reversed =
      direction !== 0 &&
      this.state.previousDirection !== 0 &&
      direction !== this.state.previousDirection

    this.updateLength(direction || this.state.previousDirection)
    const headPosition = this.computeHeadPosition(camera.position.z, phase)
    this.updateOpacity()

    if (reversed) {
      this.trail.reset()
      const lead = headPosition.clone()
      lead.z += direction * 0.12
      this.trail.addPoint(lead)
    }

    this.trail.addPoint(headPosition)

    if (direction !== 0) this.state.previousDirection = direction
    this.state.previousPhase = phase

    this.trailHeadParticles.update(
      deltaSeconds,
      headPosition,
      this.state.currentOpacity,
      this.state.movementEnergy > 0.02
    )
  }

  dispose() {
    this.trail.dispose()
    this.trailHeadParticles.dispose()
    this.state.hasSeeded = false
    this.state.previousPhase = null
    this.state.previousDirection = 0
  }
}

export { TrailController }
