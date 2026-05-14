import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: './', // Electron 需要相对路径
      publicDir: false, // Do not package public folder
      server: {
        port: 3001,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@braintree/sanitize-url': path.resolve(__dirname, 'utils/sanitizeUrlShim.ts'),
        }
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 10000,
        rollupOptions: {
          output: {
            manualChunks: undefined, // Avoid unstable vendor chunk cycles in Electron production builds.
          }
        }
      }
    };
});
