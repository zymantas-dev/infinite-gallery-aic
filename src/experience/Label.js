// Fixed DOM overlay tracking the active artwork. Replaces the Depth Gallery
// element's CMYK/RGB/PMS colour card with the artwork's own catalogue data
// (title, artist, date, medium) plus the dominant HSL colour that drives the
// mood background.
class Label {
  constructor(gallery) {
    this.gallery = gallery
    this.overlayElement = null
    this.nodes = {}
    this.activeArtworkId = null
  }

  init() {
    if (this.overlayElement) return

    const element = document.createElement('section')
    element.className = 'art-label'
    element.innerHTML = `
      <div class="art-label__aside">
        <span class="art-label__chip"></span>
        <p class="art-label__index"></p>
      </div>
      <article class="art-label__card">
        <h2 class="art-label__title"></h2>
        <p class="art-label__artist"></p>
        <dl class="art-label__specs">
          <div class="art-label__row">
            <dt>Date</dt><dd class="art-label__date"></dd>
          </div>
          <div class="art-label__row">
            <dt>Medium</dt><dd class="art-label__medium"></dd>
          </div>
          <div class="art-label__row">
            <dt>Colour</dt><dd class="art-label__color"></dd>
          </div>
        </dl>
        <p class="art-label__credit">Art Institute of Chicago &middot; Public domain (CC0)</p>
      </article>
    `

    this.overlayElement = element
    this.nodes = {
      chip: element.querySelector('.art-label__chip'),
      index: element.querySelector('.art-label__index'),
      title: element.querySelector('.art-label__title'),
      artist: element.querySelector('.art-label__artist'),
      date: element.querySelector('.art-label__date'),
      medium: element.querySelector('.art-label__medium'),
      color: element.querySelector('.art-label__color'),
    }
    element.style.opacity = '0'
    document.body.append(element)
  }

  applyContent({ artwork, palette, station }) {
    if (!artwork || artwork.id === this.activeArtworkId) return

    this.nodes.index.textContent = `NO. ${String(Math.abs(station)).padStart(3, '0')}`
    this.nodes.title.textContent = artwork.title
    this.nodes.artist.textContent = artwork.artist
    this.nodes.date.textContent = artwork.date || '—'
    this.nodes.medium.textContent = artwork.medium || '—'

    if (palette) {
      this.nodes.chip.style.backgroundColor = palette.accentColor
      this.nodes.color.textContent =
        `${palette.accentColor.toUpperCase()} · HSL ${palette.hue} ${palette.saturation} ${palette.lightness}`
    }

    this.activeArtworkId = artwork.id
  }

  update(camera) {
    if (!camera || !this.overlayElement) return

    const active = this.gallery.getActiveArtwork(camera.position.z)
    if (!active) {
      this.overlayElement.style.opacity = '0'
      return
    }

    this.applyContent(active)
    this.overlayElement.style.opacity = '1'
  }

  dispose() {
    this.overlayElement?.remove()
    this.overlayElement = null
    this.nodes = {}
    this.activeArtworkId = null
  }
}

export { Label }
