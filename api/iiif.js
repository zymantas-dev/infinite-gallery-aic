// Vercel serverless function — production stand-in for the Vite dev proxy.
//
// The rewrite in vercel.json sends /iiif/:path* here as request.query.path.
// Keeping the function at a fixed route avoids Vite deployments resolving the
// image request as a missing static nested API route.

const IIIF_ORIGIN = 'https://www.artic.edu/iiif'
const ALLOWED_PATH = /^2\/[\w-]+\/[\w:,!.%-]+\/[\w,!.%-]+\/[\w!.-]+\/[\w-]+\.(jpg|jpeg|png|webp)$/i

export default async function handler(request, response) {
  const raw = request.query?.path
  const path = Array.isArray(raw) ? raw.join('/') : String(raw || '')

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
