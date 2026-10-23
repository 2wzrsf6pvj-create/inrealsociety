# E2E avec base

Les tests de `e2e/db/` parcourent l'app dans un vrai navigateur, **connecté**,
devant une **vraie base** : « Mon espace », /admin, la déconnexion… Les tests de
fumée de `e2e/` (`npm run test:e2e`), eux, tournent sans base et ne voient que
les pages publiques.

| Réel | Simulé |
|---|---|
| L'app construite comme en production (`next build`, `next start`) | La session Supabase : cookie posé par le test, jeton signé avec le secret de la base de test |
| Chromium (Playwright) | Le service de push du navigateur (absent du Chromium de test), quand un test en a besoin |
| Postgres + PostgREST, migrations du dépôt (`integration/setup-db.sh`) | Les limites de débit (Upstash) : elles laissent tout passer |

`supabase-gateway.mjs` se fait passer pour Supabase devant la base :
`/rest/v1` → PostgREST, `/auth/v1/user` → l'utilisateur du jeton, `/upstash` →
limites ouvertes. La CSP de production n'autorise pas cette adresse locale : les
tests la contournent (`bypassCSP`).

En CI : job **« E2E avec base »**, sans aucun secret.

## Lancer en local

Prérequis : la base de test et PostgREST des tests d'intégration
(`integration/README.md`, mêmes variables `INTEGRATION_*`), et `psql`.

```bash
export INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/irs_it
export INTEGRATION_POSTGREST_URL=http://localhost:3001
export INTEGRATION_JWT_SECRET=integration-test-secret-integration-test-secret

npm run test:e2e:db   # construit l'app (les NEXT_PUBLIC_ y sont figées), puis lance les tests
```

L'app écoute sur le port 3100, la passerelle sur 54321. Chaque test crée ses
propres données (identifiants uniques) : on peut relancer sur la même base.

⚠️ Base **jetable uniquement**, comme pour les tests d'intégration.
