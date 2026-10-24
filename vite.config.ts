import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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

export default defineConfig({
  // GitHub Pages hosts project sites beneath /<repository>/, not /.
  // Local development and non-Pages deployments continue to use the root path.
  base: process.env.GITHUB_PAGES === 'true' ? '/synOUT/public/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    silentHmrClientPlugin(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: false,
    ws: false,
  },
});
