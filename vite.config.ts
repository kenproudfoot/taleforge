/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// GitHub Pages serves the app from /<repo>/. Override with BASE_PATH for forks.
const base = process.env.BASE_PATH ?? '/taleforge/';

export default defineConfig({
  base,
  plugins: [react()],
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
      exclude: ['**/*.test.ts', '**/index.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 },
    },
  },
});
