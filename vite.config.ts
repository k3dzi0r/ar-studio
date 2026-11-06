import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Dev only: lets the library builder page (src/dev) write generated packs to public/library.
const devSave = () => ({
  name: 'dev-save-library',
  apply: 'serve' as const,
  configureServer(server: import('vite').ViteDevServer) {
    server.middlewares.use('/__dev/save', (req, res) => {
      const path = new URL(req.url ?? '', 'http://x').searchParams.get('path') ?? ''
      if (req.method !== 'POST' || !/^[a-z0-9._-]+$/.test(path)) { res.statusCode = 400; return res.end('bad') }
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const dir = resolve(process.cwd(), 'public/library')
        mkdirSync(dir, { recursive: true })
        writeFileSync(resolve(dir, path), Buffer.concat(chunks))
        res.end('ok')
      })
    })
  },
})

// HTTPS is required for camera access on phones (getUserMedia only works in
// secure contexts, except on localhost). `host: true` exposes the dev server
// on the LAN so a phone can open https://<lan-ip>:5173.
export default defineConfig({
  plugins: [
    react(),
    devSave(),
    ...(process.env.NO_SSL ? [] : [basicSsl()]),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'AR Studio',
        short_name: 'AR Studio',
        description: 'Zamień dowolny obraz w kartę rozszerzonej rzeczywistości.',
        lang: 'pl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0d12',
        theme_color: '#0b0d12',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the app bundle is ~2 MB (TensorFlow.js + MindAR + three.js)
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,glb,webmanifest}'],
        navigateFallback: 'index.html',
        // built-in packs are fetched on demand, then kept for offline use
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && url.pathname.endsWith('/library/index.json'),
            handler: 'NetworkFirst' as const,
            options: { cacheName: 'library', networkTimeoutSeconds: 3 },
          },
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.includes('/library/') && !url.pathname.endsWith('/index.json'),
            handler: 'CacheFirst' as const,
            options: { cacheName: 'library', expiration: { maxEntries: 40 } },
          },
        ],
      },
    }),
  ],
  server: { host: true },
  preview: { host: true },
  build: { chunkSizeWarningLimit: 4000 },
  test: { environment: 'node' },
})
