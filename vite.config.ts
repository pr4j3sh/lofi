import { cpSync, mkdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/** Manifest and icons are static extension assets; Vite only knows about the JS/HTML entries. */
function copyExtensionAssets(): Plugin {
  return {
    name: 'lofi-copy-extension-assets',
    apply: 'build',
    closeBundle() {
      mkdirSync('dist/icons', { recursive: true });
      cpSync('manifest.json', 'dist/manifest.json');
      cpSync('public/icons', 'dist/icons', { recursive: true });
    },
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'popup.html',
        options: 'options.html',
        offscreen: 'offscreen.html',
        'service-worker': 'src/background/service-worker.ts',
        'worklets/time-stretch-processor': 'src/audio/worklets/time-stretch-processor.ts',
        content: 'src/content/content.ts',
        'page-hook': 'src/content/page-hook.ts',
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'service-worker') return 'service-worker.js';
          if (chunk.name === 'worklets/time-stretch-processor') return 'worklets/time-stretch-processor.js';
          if (chunk.name === 'content') return 'content.js';
          if (chunk.name === 'page-hook') return 'page-hook.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [copyExtensionAssets()],
});
