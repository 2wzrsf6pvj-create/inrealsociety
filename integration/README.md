# Tests d'intégration — tunnel d'achat

`integration/tunnel.test.ts` enchaîne les **vraies routes** de l'app contre une
**vraie base** : achat → paiement → impression → activation → scan → message →
remboursement.

| Réel | Simulé |
|---|---|
| Handlers Next (`src/app/api/**`), supabase-js | Stripe (SDK), Printful et Resend (`fetch`) |
| PostgREST avec un JWT `service_role` | Stockage de fichiers (uploads enregistrés) |
| Les migrations du dépôt (`scripts/fresh-setup.sql`) | Session Supabase Auth (`requireAuth`) |
| RPC, contraintes, index, grants | Rate limit Upstash |

Ce qu'il vérifie notamment : le montant réel encaissé, l'idempotence du webhook,
l'impression **au paiement** avec un code court réservé, l'**héritage** de ce code
à l'activation (le QR imprimé pointe vers le bon profil), `record_scan` exécutable
par `service_role`, un seul message par appareil, et la suspension verrouillée
après remboursement (contrainte 054 comprise), et la relance des acheteurs payés
jamais activés (J+2, J+7, sans doublon — migration 055).

`npm test` ne le lance pas (il exige l'infrastructure ci-dessous). En CI : job
**« Intégration tunnel »**, sans aucun secret.

## Lancer en local

Prérequis : Postgres ≥ 15 (base vide), `psql`, et le binaire
[PostgREST](https://github.com/PostgREST/postgrest/releases) (v12).

```bash
export INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/irs_it
export INTEGRATION_POSTGREST_URL=http://localhost:3001
export INTEGRATION_JWT_SECRET=integration-test-secret-integration-test-secret

bash integration/setup-db.sh          # rôles façon Supabase + migrations

PGRST_DB_URI=postgresql://authenticator:authenticator@localhost:5432/irs_it \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET=$INTEGRATION_JWT_SECRET PGRST_SERVER_PORT=3001 postgrest &

npm run test:integration
```

Le test crée ses propres données (emails uniques) : il peut tourner plusieurs fois
sur la même base. Pour repartir de zéro : `DROP DATABASE … WITH (FORCE)`, recréer,
relancer `setup-db.sh`.

⚠️ Base **jetable uniquement** : `setup-db.sh` crée des rôles et un rôle
`authenticator` au mot de passe connu. Jamais sur une base réelle.
