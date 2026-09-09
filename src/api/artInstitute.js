// =========================================================================
// Art Institute of Chicago API
//
// Zero-auth, open-CORS. We page through /artworks, keep only public-domain
// entries that have an image and a dominant colour, and turn each one into a
// gallery-ready record: an IIIF image URL plus a small mood palette derived
// from the artwork's own dominant HSL colour.
//
// Docs: https://api.artic.edu/docs/  ·  IIIF: https://iiif.io/api/image/2.0/
// =========================================================================

const API_BASE = 'https://api.artic.edu/api/v1'

// Same-origin path served by the Vite proxy (see vite.config.js). The IIIF
// image host itself sends no CORS headers, so WebGL textures must come through
// the proxy rather than straight from www.artic.edu.
const IIIF_BASE = '/iiif/2'

const ARTWORK_FIELDS = [
  'id',
  'title',
  'artist_title',
  'artist_display',
  'date_display',
  'medium_display',
  'department_title',
  'image_id',
  'color',
  'thumbnail',
].join(',')

// The catalogue is large; a random-ish starting page keeps repeat visits fresh.
const MAX_START_PAGE = 600

function iiifImageUrl(imageId, width) {
  return `${IIIF_BASE}/${imageId}/full/${Math.round(width)},/0/default.jpg`
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360
  const sat = clamp(s, 0, 100) / 100
  const lig = clamp(l, 0, 100) / 100

  const chroma = (1 - Math.abs(2 * lig - 1)) * sat
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const match = lig - chroma / 2

  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) [r, g, b] = [chroma, secondary, 0]
  else if (hue < 120) [r, g, b] = [secondary, chroma, 0]
  else if (hue < 180) [r, g, b] = [0, chroma, secondary]
  else if (hue < 240) [r, g, b] = [0, secondary, chroma]
  else if (hue < 300) [r, g, b] = [secondary, 0, chroma]
  else [r, g, b] = [chroma, 0, secondary]

  const toHex = (channel) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Turn the single dominant colour into a light editorial background + two
// blob colours the GLSL background can lerp between, plus an accent chip.
function buildPalette(color) {
  const hue = Number.isFinite(color?.h) ? color.h : 38
  const rawSat = Number.isFinite(color?.s) ? color.s : 12
  const rawLig = Number.isFinite(color?.l) ? color.l : 55

  const accentSat = clamp(rawSat, 22, 88)
  const accentLig = clamp(rawLig, 32, 62)

  return {
    accentColor: hslToHex(hue, accentSat, accentLig),
    backgroundColor: hslToHex(hue, clamp(rawSat * 0.4, 6, 30), 90),
    blob1Color: hslToHex(hue, clamp(rawSat * 1.15, 34, 82), 55),
    blob2Color: hslToHex(hue + 38, clamp(rawSat, 28, 70), 60),
    hue: Math.round(((hue % 360) + 360) % 360),
    saturation: Math.round(clamp(rawSat, 0, 100)),
    lightness: Math.round(clamp(rawLig, 0, 100)),
  }
}

function firstLine(text) {
  if (typeof text !== 'string') return ''
  return text.split('\n')[0].trim()
}

function normalizeArtwork(raw) {
  if (!raw || !raw.image_id) return null

  const palette = buildPalette(raw.color)
  const aspectRatio =
    raw.thumbnail && raw.thumbnail.width > 0 && raw.thumbnail.height > 0
      ? raw.thumbnail.width / raw.thumbnail.height
      : 1

  return {
    id: raw.id,
    title: firstLine(raw.title) || 'Untitled',
    artist: raw.artist_title || firstLine(raw.artist_display) || 'Unknown maker',
    date: raw.date_display || '',
    medium: firstLine(raw.medium_display) || '',
    department: raw.department_title || '',
    imageId: raw.image_id,
    thumbUrl: iiifImageUrl(raw.image_id, 400),
    fullUrl: iiifImageUrl(raw.image_id, 843),
    aspectRatio: clamp(aspectRatio, 0.5, 2.2),
    palette,
  }
}

async function fetchArtworkPage({ page, limit = 100, signal } = {}) {
  const url = `${API_BASE}/artworks?fields=${ARTWORK_FIELDS}&limit=${limit}&page=${page}`
  const response = await fetch(url, {
    signal,
    headers: { 'AIC-User-Agent': 'infinite-gallery-aic demo (experiments)' },
  })

  if (!response.ok) {
    throw new Error(`AIC request failed: ${response.status} ${response.statusText}`)
  }

  const payload = await response.json()
  const items = Array.isArray(payload?.data) ? payload.data : []
  const totalPages = payload?.pagination?.total_pages || null

  const artworks = items
    .filter((item) => item && item.image_id && item.color)
    .map((item) => normalizeArtwork(item))
    .filter(Boolean)

  // The catalogue is ID-ordered, so a raw page is often one artist / one
  // portfolio in a row. Shuffle so the tunnel mixes eras and media.
  for (let i = artworks.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[artworks[i], artworks[j]] = [artworks[j], artworks[i]]
  }

  return { artworks, totalPages }
}

function randomStartPage() {
  return 1 + Math.floor(Math.random() * MAX_START_PAGE)
}

export { fetchArtworkPage, randomStartPage, iiifImageUrl, hslToHex, buildPalette }
