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
(Artworks come from a static snapshot - see below.)

## How it works

| Piece | Role |
| --- | --- |
| `api/artInstitute.js` | Normalises an AIC record and builds a mood palette (light background + two blob colours + accent) from the artwork's own HSL colour. Used by the snapshot script. |
| `api/staticGallery.js` | Loads `public/art/manifest.json` and maps each entry to its same-origin image URLs. |
| `experience/ArtworkQueue.js` | Hands out the static set forever, reshuffling each lap. |
| `experience/Gallery.js` | **Recycled pool of 14 planes.** Each owns a "station" index in the endless tunnel; planes the camera has passed are recycled to the far end and rebound to the next artwork, so memory stays flat. Low-res texture (`400,`) on recycle, upgraded to `843,` within ~3.5 stations of the active one. **Opacity is one continuous function** (`opacityForStationDelta`) — a linear tent between the two planes straddling the active point, smoothstep-remapped: one image holds full across a plateau (~12 wheel-ticks of dwell), then a clean dissolve to the next where the pair sums to ~1. No `Math.floor`, no third layer, so nothing pops. `xRhythm` alternates each artwork left/right of centre. |
| `experience/Scroll.js` | Wheel/touch → damped camera-z velocity. Plane-range clamp removed (endless); `scrollToWorldFactor` + `planeGap` tuned so each artwork gets real scroll distance before it hands off. Velocity still drives every reactive effect. |
| `experience/background/` | Full-screen GLSL quad; blob colours lerp toward the active artwork's mood palette. Unchanged shader from the element. |
| `experience/TrailController.js` | Glowing weaving trail + sparkle particles ahead of the camera. Adapted for an endless path: phase = raw distance flown, whole-number wave cycles so the curve never breaks. |
| `experience/Label.js` | DOM overlay — title / artist / date / medium + the dominant HSL colour, tracking whichever plane is most on-screen. |

## Static dataset (why there is no image proxy)

Textures must be same-origin *and* untainted, and the AIC IIIF image host
(`www.artic.edu/iiif`) is awkward: no CORS without a matching `Referer`, and
its Cloudflare layer now answers requests from serverless/datacenter IPs
(Vercel included) with a `403` challenge. A live proxy therefore works locally
but not in production.

So the gallery ships a **curated static snapshot** instead:

- `npm run snapshot` (`scripts/snapshot.mjs`) samples public-domain artworks
  across AIC departments, downloads 400px + 843px JPEGs (recompressed with
  ImageMagick when available) and writes `public/art/manifest.json`.
- `experience/ArtworkQueue.js` loads the manifest, shuffles it and laps it
  forever, so the tunnel still never ends.
- Run the snapshot from a normal (non-datacenter) network. Options:
  `-- --count=240 --seed=1`.

### Deploying

Any static host works: `npm run build` -> `dist/` (~33MB, mostly `dist/art`).
`vercel.json` only adds long-lived cache headers for `/art/*.jpg`.

## Credits

- Base element: Codrops "Atmospheric Depth Gallery" by Houmahani Kane (MIT).
- Data + images: [Art Institute of Chicago API](https://api.artic.edu/docs/),
  metadata CC0, images public domain.
