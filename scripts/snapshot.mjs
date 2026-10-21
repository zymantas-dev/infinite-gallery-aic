// Builds the static gallery dataset served from /art.
//
// Why: the AIC IIIF image host sits behind Cloudflare, which 403s requests from
// serverless/datacenter IPs, so a live image proxy on Vercel cannot work. Instead
// we snapshot a curated set of public-domain artworks once, from a machine the
// host accepts, and ship the images + metadata as static files.
//
// Usage: npm run snapshot [-- --count=240 --seed=1]

import { mkdir, writeFile, access, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { normalizeArtwork } from '../src/api/artInstitute.js'

const run = promisify(execFile)
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/art')
const API = 'https://api.artic.edu/api/v1'
const IIIF = 'https://www.artic.edu/iiif/2'
const HEADERS = {
  Referer: 'https://www.artic.edu/',
  'User-Agent': 'Mozilla/5.0 (compatible; infinite-gallery-aic snapshot)',
  'AIC-User-Agent': 'infinite-gallery-aic snapshot (portfolio experiment)',
}

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    return [key, value]
  })
)
const COUNT = Number(args.count || 240)
const PER_DEPARTMENT_CAP = Math.ceil(COUNT / 6)
const SIZES = [400, 843]

const FIELDS = [
  'id', 'title', 'artist_title', 'artist_display', 'date_display', 'medium_display',
  'department_title', 'image_id', 'color', 'thumbnail', 'is_public_domain',
].join(',')

// Small deterministic PRNG so a given --seed reproduces the same selection.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = mulberry32(Number(args.seed || 1))

// The search API refuses deep paging (page * limit > 1000), so to span the whole
// collection we sample a few pages from each department instead.
const DEPARTMENTS = [
  'Painting and Sculpture of Europe',
  'Arts of the Americas',
  'Asian Art',
  'Prints and Drawings',
  'Photography and Media',
  'Textiles',
  'Modern and Contemporary Art',
  'Arts of Africa',
  'Ancient and Byzantine Art',
  'Arms and Armor',
  'Applied Arts of Europe',
  'Contemporary Art',
]
const PAGES_PER_DEPARTMENT = 2
const MAX_SEARCH_PAGE = 10

async function searchPage(department, page) {
  const response = await fetch(`${API}/artworks/search`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: FIELDS.split(','),
      limit: 100,
      page,
      query: {
        bool: {
          must: [
            { term: { is_public_domain: true } },
            { match_phrase: { department_title: department } },
            { exists: { field: 'image_id' } },
            { exists: { field: 'color.h' } },
          ],
        },
      },
    }),
  })
  if (!response.ok) throw new Error(`search page ${page}: ${response.status}`)
  const payload = await response.json()
  return {
    items: payload.data || [],
    totalPages: Math.min(payload.pagination?.total_pages || 1, MAX_SEARCH_PAGE),
  }
}

// Shrinks the JPEGs ~3x so the whole set stays deploy-friendly. Best effort:
// skipped when ImageMagick isn't installed.
async function recompress(file) {
  try {
    await run('convert', [file, '-strip', '-interlace', 'Plane', '-quality', '76', file])
  } catch {
    /* ImageMagick not available — keep the original */
  }
}

async function download(url, file, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS })
      if (!response.ok) throw new Error(String(response.status))
      const type = response.headers.get('content-type') || ''
      if (!type.startsWith('image/')) throw new Error(`unexpected content-type ${type}`)
      await writeFile(file, Buffer.from(await response.arrayBuffer()))
      await recompress(file)
      return true
    } catch (error) {
      if (attempt === attempts) {
        console.warn(`  ! ${url}: ${error.message}`)
        return false
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt))
    }
  }
  return false
}

async function pool(items, size, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await worker(items[index], index)
      }
    })
  )
  return results
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  // 1. Sample random pages from every department so the selection spans eras and media.
  const candidates = []
  const seen = new Set()
  for (const department of DEPARTMENTS) {
    const { items: firstItems, totalPages } = await searchPage(department, 1).catch(() => ({ items: [], totalPages: 0 }))
    if (totalPages === 0) continue
    const pages = new Set([1])
    while (pages.size < Math.min(PAGES_PER_DEPARTMENT, totalPages)) pages.add(1 + Math.floor(random() * totalPages))
    let found = 0
    for (const page of pages) {
      const { items } = page === 1 ? { items: firstItems } : await searchPage(department, page)
      for (const item of items) {
        if (!item.is_public_domain || seen.has(item.id)) continue
        const artwork = normalizeArtwork(item)
        if (!artwork) continue
        seen.add(item.id)
        candidates.push(artwork)
        found += 1
      }
    }
    console.log(`  ${department}: ${found}`)
  }

  // 2. Shuffle, then cap per department so one collection can't dominate.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  const perDepartment = new Map()
  const picked = []
  for (const artwork of candidates) {
    const count = perDepartment.get(artwork.department) || 0
    if (count >= PER_DEPARTMENT_CAP) continue
    perDepartment.set(artwork.department, count + 1)
    picked.push(artwork)
    if (picked.length >= COUNT + 20) break // small surplus for failed downloads
  }
  console.log(`${candidates.length} candidates -> ${picked.length} picked`)

  // 3. Download every size, keep only artworks where all sizes succeeded.
  let done = 0
  const downloaded = await pool(picked, 6, async (artwork) => {
    let ok = true
    for (const size of SIZES) {
      const file = path.join(OUT_DIR, `${artwork.imageId}-${size}.jpg`)
      const exists = await access(file).then(() => true, () => false)
      if (!exists) ok = (await download(`${IIIF}/${artwork.imageId}/full/${size},/0/default.jpg`, file)) && ok
    }
    done += 1
    if (done % 20 === 0) console.log(`  ${done}/${picked.length}`)
    return ok ? artwork : null
  })

  const manifest = downloaded.filter(Boolean).slice(0, COUNT).map((artwork) => ({
    id: artwork.id,
    title: artwork.title,
    artist: artwork.artist,
    date: artwork.date,
    medium: artwork.medium,
    department: artwork.department,
    imageId: artwork.imageId,
    aspectRatio: Number(artwork.aspectRatio.toFixed(4)),
    palette: artwork.palette,
  }))

  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), sizes: SIZES, artworks: manifest }, null, 1)
  )

  // 4. Drop images that were downloaded but didn't make the final cut.
  const keep = new Set(manifest.flatMap((a) => SIZES.map((s) => `${a.imageId}-${s}.jpg`)))
  const { readdir } = await import('node:fs/promises')
  for (const file of await readdir(OUT_DIR)) {
    if (file.endsWith('.jpg') && !keep.has(file)) await rm(path.join(OUT_DIR, file))
  }

  console.log(`Wrote ${manifest.length} artworks to ${path.relative(process.cwd(), OUT_DIR)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
