import { fetchArtworkPage, randomStartPage } from '../api/artInstitute'

// Streams normalized artworks out of the AIC API. `init()` primes a buffer,
// `next()` hands them out forever (cycling the buffer if the network can't
// keep up) and quietly fetches the next page whenever the buffer runs low.
class ArtworkQueue {
  constructor({ minBuffer = 28, refetchThreshold = 16 } = {}) {
    this.items = []
    this.seenIds = new Set()
    this.cursor = 0
    this.page = randomStartPage()
    this.totalPages = null
    this.minBuffer = minBuffer
    this.refetchThreshold = refetchThreshold
    this.isFetching = false
    this.pendingFetch = null
  }

  async init() {
    while (this.items.length < this.minBuffer) {
      const gained = await this.fetchNextPage()
      if (gained === 0 && this.items.length === 0) {
        // one retry from a different page before giving up
        this.page = randomStartPage()
        const retry = await this.fetchNextPage()
        if (retry === 0) break
      }
      if (gained === 0) break
    }

    if (this.items.length === 0) {
      throw new Error('No artworks returned from the Art Institute of Chicago API')
    }
  }

  async fetchNextPage() {
    if (this.totalPages && this.page > this.totalPages) {
      this.page = 1
    }

    let batch = []
    try {
      const { artworks, totalPages } = await fetchArtworkPage({ page: this.page })
      this.totalPages = totalPages || this.totalPages
      batch = artworks
    } catch (error) {
      console.warn('Artwork page fetch failed', error)
      return 0
    } finally {
      this.page += 1
    }

    let added = 0
    for (const artwork of batch) {
      if (this.seenIds.has(artwork.id)) continue
      this.seenIds.add(artwork.id)
      this.items.push(artwork)
      added += 1
    }
    return added
  }

  maybePrefetch() {
    const remaining = this.items.length - this.cursor
    if (remaining > this.refetchThreshold || this.isFetching) return

    this.isFetching = true
    this.pendingFetch = this.fetchNextPage().finally(() => {
      this.isFetching = false
      this.pendingFetch = null
    })
  }

  next() {
    if (this.items.length === 0) return null

    if (this.cursor >= this.items.length) {
      // network hasn't caught up — recycle what we have so the tunnel never stalls
      this.cursor = 0
    }

    const artwork = this.items[this.cursor]
    this.cursor += 1
    this.maybePrefetch()
    return artwork
  }
}

export { ArtworkQueue }
