import { defineConfig, devices } from '@playwright/test';
import { APP_ENV, APP_PORT, APP_URL, GATEWAY_PORT, GATEWAY_URL, JWT_SECRET, POSTGREST_URL } from './e2e/db/support';

// E2E avec base : l'app construite comme en production, devant la vraie base de
// test (Postgres + PostgREST, migrations du dépôt) et une passerelle qui se fait
// passer pour Supabase et Upstash. Lancement et prérequis : e2e/db/README.md.
// Une seule exécution à la fois : les tests partagent la base.

export default defineConfig({
  testDir:  './e2e/db',
  workers:  1,
  forbidOnly: !!process.env.CI,
  retries:  0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout:  30_000,

  use: {
    baseURL:    APP_URL,
    // Une action qui ne trouve pas sa cible échoue en 10 s, en la nommant.
    actionTimeout: 10_000,
    trace:      'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Le Chromium complet, et non sa version allégée (headless shell), qui a
    // planté en CI (SIGSEGV) en ouvrant un contexte.
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
  ],

  webServer: [
    {
      command: 'node e2e/db/supabase-gateway.mjs',
      url:     `${GATEWAY_URL}/health`,
      env:     { GATEWAY_PORT: String(GATEWAY_PORT), POSTGREST_URL, JWT_SECRET },
      reuseExistingServer: !process.env.CI,
    },
    {
      // Les variables NEXT_PUBLIC_ sont figées à la construction : elle se fait ici.
      command: `npm run build && npx next start -p ${APP_PORT}`,
      url:     APP_URL,
      env:     APP_ENV,
      timeout: 600_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
