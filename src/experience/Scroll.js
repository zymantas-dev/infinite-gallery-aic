import * as THREE from 'three'

// Wheel / touch add to scrollTarget; scrollCurrent lerps toward it; the camera
// z is driven straight off it. Adapted from the Depth Gallery element: the
// plane-range clamp is gone (the tunnel is endless) but the damped velocity
// model stays — it's the single input to every velocity-reactive effect.
class Scroll {
  constructor(camera) {
    this.camera = camera
    this.isInitialized = false

    this.scrollTarget = 0
    this.scrollCurrent = 0
    this.scrollSmoothing = 0.08
    // Lower factor = more scroll distance per artwork (longer dwell).
    this.scrollToWorldFactor = 0.0072
    this.wheelScrollSpeed = 1
    this.touchScrollSpeed = 1.8
    this.previousScrollCurrent = 0
    this.invertScroll = false

    this.rawVelocity = 0
    this.velocity = 0
    this.velocityDamping = 0.12
    this.velocityMax = 1.5
    this.velocityStopThreshold = 0.0001

    this.cameraStartZ = this.camera.position.z
    this.touchY = 0

    this.onWheel = (event) => {
      event.preventDefault()
      this.addScrollInput(this.normalizeWheelDelta(event) * this.wheelScrollSpeed)
    }
    this.onTouchStart = (event) => {
      this.touchY = event.touches[0]?.clientY ?? 0
    }
    this.onTouchMove = (event) => {
      event.preventDefault()
      const currentTouchY = event.touches[0]?.clientY ?? this.touchY
      this.addScrollInput((this.touchY - currentTouchY) * this.touchScrollSpeed)
      this.touchY = currentTouchY
    }
  }

  init() {
    if (this.isInitialized) return
    this.cameraStartZ = this.camera.position.z
    this.scrollTarget = 0
    this.scrollCurrent = 0
    this.previousScrollCurrent = 0
    this.rawVelocity = 0
    this.velocity = 0
    this.isInitialized = true
  }

  bindEvents() {
    window.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('touchstart', this.onTouchStart, { passive: true })
    window.addEventListener('touchmove', this.onTouchMove, { passive: false })
  }

  cameraZFromScroll(scrollAmount) {
    return this.cameraStartZ - scrollAmount * this.scrollToWorldFactor
  }

  normalizeWheelDelta(event) {
    if (event.deltaMode === 1) return event.deltaY * 16
    if (event.deltaMode === 2) return event.deltaY * window.innerHeight
    return event.deltaY
  }

  addScrollInput(deltaY) {
    this.scrollTarget += deltaY * (this.invertScroll ? -1 : 1)
  }

  updateVelocity() {
    this.rawVelocity = this.scrollCurrent - this.previousScrollCurrent
    this.velocity = THREE.MathUtils.lerp(this.velocity, this.rawVelocity, this.velocityDamping)
    this.velocity = THREE.MathUtils.clamp(this.velocity, -this.velocityMax, this.velocityMax)
    if (Math.abs(this.velocity) < this.velocityStopThreshold) this.velocity = 0
    this.previousScrollCurrent = this.scrollCurrent
  }

  update() {
    this.scrollCurrent = THREE.MathUtils.lerp(
      this.scrollCurrent,
      this.scrollTarget,
      this.scrollSmoothing
    )
    this.updateVelocity()
    this.camera.position.z = this.cameraZFromScroll(this.scrollCurrent)
  }

  dispose() {
    window.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('touchstart', this.onTouchStart)
    window.removeEventListener('touchmove', this.onTouchMove)
  }
}

export { Scroll }
