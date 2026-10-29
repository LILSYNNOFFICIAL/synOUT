import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Prevents @vite/client from opening failing WebSocket connections (and throwing
 * unhandled "WebSocket closed without opened" rejections at @vite/client:225)
 * in proxied Cloud Run preview environments where HMR WebSockets are disabled,
 * while keeping CSS style injection (updateStyle/removeStyle) intact.
 */
function silentHmrClientPlugin(): Plugin {
  return {
    name: 'synout-silent-hmr-client',
    enforce: 'post',
    transform(code, id) {
      if (process.env.ENABLE_HMR === 'true') return null;
      if (!id.includes('vite/dist/client/')) return null;

      const updated = code
        .replace(
          /const createWebSocketModuleRunnerTransport\s*=\s*\(options\)\s*=>\s*\{[\s\S]*?\n\};\n\/\/#endregion/,
          'const createWebSocketModuleRunnerTransport = () => ({ async connect() {}, disconnect() {}, send() {} });\n//#endregion'
        )
        .replace('console.debug("[vite] connecting...");', '');

      return updated !== code ? { code: updated, map: null } : null;
    },
  };
}

const isGithubPages = process.env.GITHUB_PAGES === 'true';
const appBase = isGithubPages ? '/synOUT/public/' : '/';
const VIRTUAL_EMPTY_FIREBASE_ID = '\0virtual:empty-firebase-applet-config';

/**
 * Keeps branch-published GitHub Pages bundles in /public free of local provisioned
 * firebase-applet-config.json keys while loading full Firebase config in dev and Cloud Run builds.
 */
function githubPagesFirebaseConfigIsolationPlugin(): Plugin {
  return {
    name: 'synout-gh-pages-firebase-isolation',
    enforce: 'pre',
    resolveId(id) {
      if (isGithubPages && id.endsWith('firebase-applet-config.json')) {
        return VIRTUAL_EMPTY_FIREBASE_ID;
      }
      return null;
    },
    load(id) {
      if (id === VIRTUAL_EMPTY_FIREBASE_ID) {
        return 'export default null;';
      }
      return null;
    },
  };
}

export default defineConfig({
  // GitHub Pages hosts project sites beneath /<repository>/, not /.
  // Local development and non-Pages deployments continue to use the root path.
  base: appBase,
  // Source static assets live in /static so branch-published GitHub Pages bundles in /public
  // never collide with Vite dev middleware or overwrite dist/index.html during builds.
  publicDir: 'static',
  plugins: [
    githubPagesFirebaseConfigIsolationPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'site.webmanifest',
      injectRegister: 'auto',
      includeAssets: [
        'synout-logo.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
      ],
      manifest: {
        id: appBase,
        name: 'synOUT',
        short_name: 'synOUT',
        description:
          'Scan 700+ data brokers, purge dark web exposures, and send verified statutory deletion notices from your own email with synOUT.',
        theme_color: '#10b981',
        background_color: '#020617',
        display: 'standalone',
        start_url: appBase,
        scope: appBase,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'synout-logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
    silentHmrClientPlugin(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: false,
    ws: false,
  },
});
