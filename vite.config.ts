import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 4200,
    host: true,
  },
  preview: {
    port: 4200,
    host: true,
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon/favicon.svg', 'favicon/favicon.ico', 'favicon/apple-touch-icon.png'],
      manifest: {
        name: 'SmaPlot',
        short_name: 'SmaPlot',
        description: 'Sma4Win-style scientific data analysis and plotting',
        lang: 'en',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'fullscreen',
        display_override: ['window-controls-overlay'],
        start_url: '/',
        icons: [
          {
            src: '/favicon/web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/favicon/web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,txt,smp}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
