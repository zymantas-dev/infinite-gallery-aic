import { defineConfig } from 'vite'

// The AIC JSON API (api.artic.edu) is open-CORS, but the IIIF image host
// (www.artic.edu/iiif/2) sends no Access-Control-Allow-Origin header AND 403s
// any request without a matching Referer. Proxy it through the dev server so
// texture loads are same-origin, and inject the headers it wants.
export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5300,
    open: true,
    strictPort: false,
    proxy: {
      '/iiif': {
        target: 'https://www.artic.edu',
        changeOrigin: true,
        headers: {
          Referer: 'https://www.artic.edu/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
        },
      },
    },
  },
})
