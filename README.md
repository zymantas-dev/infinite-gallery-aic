# Infinite Gallery — Art Institute of Chicago
an **endless depth gallery** flown through public-domain artworks from the
Art Institute of Chicago's free API. Built on the **Depth Gallery** UI element
(`ui-elements/components/webgl/depth-gallery`, a port of the Codrops
"Atmospheric Depth Gallery" tutorial).

```bash
npm install
npm run dev        # http://localhost:5300
```

Scroll / drag to fly forward. It never ends, in either direction.

## How it works

| Piece | Role |
| --- | --- |
| `api/artInstitute.js` | Pages `GET /artworks`, keeps public-domain items with an image + dominant colour, builds an IIIF URL and a mood palette (light background + two blob colours + accent) from the artwork's own HSL colour. |
| `experience/ArtworkQueue.js` | Streams normalized artworks; primes a buffer, hands them out forever, prefetches the next page when the buffer runs low, shuffles each page so eras/media mix. |
| `experience/Gallery.js` | **Recycled pool of 14 planes.** Each owns a "station" index in the endless tunnel; planes the camera has passed are recycled to the far end and rebound to the next artwork, so memory stays flat. Low-res texture (`400,`) on recycle, upgraded to `843,` within ~3.5 stations of the active one. **Opacity is one continuous function** (`opacityForStationDelta`) — a linear tent between the two planes straddling the active point, smoothstep-remapped: one image holds full across a plateau (~12 wheel-ticks of dwell), then a clean dissolve to the next where the pair sums to ~1. No `Math.floor`, no third layer, so nothing pops. `xRhythm` alternates each artwork left/right of centre. |
| `experience/Scroll.js` | Wheel/touch → damped camera-z velocity. Plane-range clamp removed (endless); `scrollToWorldFactor` + `planeGap` tuned so each artwork gets real scroll distance before it hands off. Velocity still drives every reactive effect. |
| `experience/background/` | Full-screen GLSL quad; blob colours lerp toward the active artwork's mood palette. Unchanged shader from the element. |
| `experience/TrailController.js` | Glowing weaving trail + sparkle particles ahead of the camera. Adapted for an endless path: phase = raw distance flown, whole-number wave cycles so the curve never breaks. |
| `experience/Label.js` | DOM overlay — title / artist / date / medium + the dominant HSL colour, tracking whichever plane is most on-screen. |

## The CORS catch (and why a static deploy isn't enough)

The AIC **JSON API** (`api.artic.edu`) is open-CORS — the browser calls it
directly. The **IIIF image host** (`www.artic.edu/iiif`) is trickier: it returns
`Access-Control-Allow-Origin: *` **only** when the request carries
`Referer: https://www.artic.edu/`; without it, every request is `403`. WebGL
textures must be same-origin *and* untainted, so the images can't be loaded
straight from `www.artic.edu`.

- **Dev:** `vite.config.js` proxies `/iiif/*` and injects the `Referer` /
  `User-Agent` the host wants.
- **Prod:** `vite build` is a static bundle — the dev proxy is gone, and a plain
  `vercel.json` rewrite can't add the `Referer` header, so it would 403. The
  fix is the serverless function in **`api/iiif/[...path].js`**: `vercel.json`
  rewrites `/iiif/*` → `/api/iiif/*`, the function refetches with the header and
  streams the bytes back with permissive CORS + a long cache. The client uses
  the same `/iiif/...` paths in both modes.

### Deploying to Vercel

Import the repo, set **Root Directory** to `experiments/infinite-gallery-aic`.
Vercel auto-detects Vite (build `vite build`, output `dist`) and picks up
`api/` + `vercel.json`. No env vars. (Any host with a small proxy — Netlify
function, Cloudflare Worker, a Node server — works the same way.)

## Credits

- Base element: Codrops "Atmospheric Depth Gallery" by Houmahani Kane (MIT).
- Data + images: [Art Institute of Chicago API](https://api.artic.edu/docs/),
  metadata CC0, images public domain.
