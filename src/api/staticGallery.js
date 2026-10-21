// Static gallery dataset, produced by `npm run snapshot` (scripts/snapshot.mjs).
//
// The AIC image host blocks serverless/datacenter IPs, so instead of proxying
// it live we ship a curated set of public-domain artworks as same-origin static
// files: /art/manifest.json plus /art/<imageId>-400.jpg and -843.jpg.

const ART_BASE = `${import.meta.env.BASE_URL}art`

async function loadStaticArtworks({ signal } = {}) {
  const response = await fetch(`${ART_BASE}/manifest.json`, { signal })
  if (!response.ok) {
    throw new Error(`Gallery manifest failed to load: ${response.status} ${response.statusText}`)
  }

  const { artworks } = await response.json()
  if (!Array.isArray(artworks) || artworks.length === 0) {
    throw new Error('Gallery manifest is empty')
  }

  return artworks.map((artwork) => ({
    ...artwork,
    thumbUrl: `${ART_BASE}/${artwork.imageId}-400.jpg`,
    fullUrl: `${ART_BASE}/${artwork.imageId}-843.jpg`,
  }))
}

export { loadStaticArtworks }
