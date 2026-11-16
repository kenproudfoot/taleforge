/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { playtestMiddleware } from './scripts/lib/playtestServer';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// GitHub Pages serves the app from /<repo>/. Override with BASE_PATH for forks.
const base = process.env.BASE_PATH ?? '/taleforge/';

/**
 * When the game runs from this repo (npm run dev / preview), playtest logs are also written to playtests/.
 * The hosted site has no server, so there the log stays in the saved game and can be downloaded.
 */
function playtestPlugin(): Plugin {
  return {
    name: 'taleforge-playtest',
    configureServer: (server) => void server.middlewares.use(playtestMiddleware()),
    configurePreviewServer: (server) => void server.middlewares.use(playtestMiddleware()),
  };
}

export default defineConfig({
  base,
  plugins: [react(), playtestPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    coverage: {
      provider: 'v8',
      include: ['src/engine/**'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/testing.ts', '**/types.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
