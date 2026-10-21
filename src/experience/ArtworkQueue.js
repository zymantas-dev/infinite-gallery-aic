import { loadStaticArtworks } from '../api/staticGallery'

// Hands out the static artwork set forever. `init()` loads the manifest and
// shuffles it; `next()` walks the shuffled list and reshuffles at the end of
// each lap (never repeating the same artwork back-to-back), so the tunnel never
// ends and eras/media keep mixing.
class ArtworkQueue {
  constructor() {
    this.items = []
    this.cursor = 0
    this.last = null
  }

  async init() {
    this.items = await loadStaticArtworks()
    this.shuffle()
  }

  shuffle() {
    const items = this.items
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    // avoid the same piece appearing twice in a row across the lap boundary
    if (items.length > 1 && items[0] === this.last) {
      ;[items[0], items[items.length - 1]] = [items[items.length - 1], items[0]]
    }
    this.cursor = 0
  }

  next() {
    if (this.items.length === 0) return null
    if (this.cursor >= this.items.length) this.shuffle()

    const artwork = this.items[this.cursor]
    this.cursor += 1
    this.last = artwork
    return artwork
  }
}

export { ArtworkQueue }
