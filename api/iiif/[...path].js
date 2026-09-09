// Vercel serverless function — production stand-in for the Vite dev proxy.
//
// The AIC IIIF host (www.artic.edu/iiif) sends `Access-Control-Allow-Origin: *`
// ONLY when the request carries `Referer: https://www.artic.edu/`; without it
// every request is 403. A plain `vercel.json` rewrite can't inject that header,
// so the image path is routed here, we refetch with the header it wants, and
// stream the bytes back with permissive CORS + long cache.
//
// vercel.json rewrites /iiif/* -> /api/iiif/* so the client keeps using the
// same `/iiif/2/{id}/full/{size}/0/default.jpg` paths in dev and prod.

const IIIF_ORIGIN = 'https://www.artic.edu/iiif'
const ALLOWED_PATH = /^2\/[\w-]+\/[\w:,!.%-]+\/[\w,!.%-]+\/[\w!.-]+\/[\w-]+\.(jpg|jpeg|png|webp)$/i

function getImagePath(request) {
  const raw = request.query?.path
  if (raw) return Array.isArray(raw) ? raw.join('/') : String(raw)

  // Rewrites can expose either the original `/iiif/...` URL or the internal
  // `/api/iiif/...` URL to a Node function. Accept both when the catch-all
  // parameter is unavailable.
  const pathname = new URL(request.url, 'http://localhost').pathname
  return pathname.replace(/^\/(?:api\/)?iiif\//, '')
}

export default async function handler(request, response) {
  const path = getImagePath(request)

  if (!ALLOWED_PATH.test(path)) {
    response.status(400).json({ error: 'Unsupported IIIF path' })
    return
  }

  let upstream
  try {
    upstream = await fetch(`${IIIF_ORIGIN}/${path}`, {
      headers: {
        Referer: 'https://www.artic.edu/',
        'User-Agent': 'Mozilla/5.0 (compatible; infinite-gallery-aic)',
      },
    })
  } catch (error) {
    response.status(502).json({ error: 'Upstream fetch failed' })
    return
  }

  if (!upstream.ok) {
    response.status(upstream.status).json({ error: `Upstream ${upstream.status}` })
    return
  }

  const body = Buffer.from(await upstream.arrayBuffer())
  response.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, immutable')
  response.status(200).send(body)
}
