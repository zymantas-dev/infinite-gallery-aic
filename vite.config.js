import { defineConfig } from 'vite'

// Artwork images and metadata are static files in public/art (see
// scripts/snapshot.mjs), so no dev proxy is needed.
export default defineConfig({
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5300,
    open: true,
    strictPort: false,
  },
})
