import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
