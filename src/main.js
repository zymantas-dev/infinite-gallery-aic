import './style.css'
import { Engine } from './experience/Engine'

const canvas = document.querySelector('.webgl')

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing .webgl canvas element')
}

const engine = new Engine(canvas)

engine.init().catch((error) => {
  console.error('Engine initialization failed', error)
  const veil = document.querySelector('.boot-error')
  if (veil) {
    veil.hidden = false
    veil.textContent =
      'Could not reach the Art Institute of Chicago API. Check your connection and reload.'
  }
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => engine.dispose())
}

if (import.meta.env.DEV) {
  window.__engine = engine
}
