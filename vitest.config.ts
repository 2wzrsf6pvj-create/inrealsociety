import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Exclut les tests Playwright (E2E) — pris en charge par `npm run test:e2e`
    // + integration/ (vraie base requise) — `npm run test:integration`
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/e2e/**', 'integration/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
