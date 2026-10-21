// =========================================================================
// Art Institute of Chicago artwork normalisation
//
// Turns a raw AIC API record into a gallery-ready one: display metadata plus a
// small mood palette derived from the artwork's own dominant HSL colour. Used
// by scripts/snapshot.mjs when building the static dataset in public/art.
//
// Docs: https://api.artic.edu/docs/
// =========================================================================

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
    aspectRatio: clamp(aspectRatio, 0.5, 2.2),
    palette,
  }
}

export { normalizeArtwork, hslToHex, buildPalette }
