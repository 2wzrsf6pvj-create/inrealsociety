import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Tests d'intégration contre une vraie base (Postgres + PostgREST) — cf. integration/README.md.
// Séparés de `npm test` : ils exigent une infrastructure et tournent en séquence.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
