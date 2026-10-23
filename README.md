# In Real Society

> Le premier vêtement conçu pour les rencontres dans la vraie vie.
> Pas d'algorithme. Pas de swipe. Un QR code, une rencontre.

## Stack

- **Framework** : Next.js 16 (App Router, build webpack) + React 19 + TypeScript strict
- **Auth + DB** : Supabase (Postgres + RLS + Auth + Storage)
- **Paiements** : Stripe (one-shot t-shirt + abonnement premium)
- **Emails** : Resend (transactionnels)
- **POD** : Printful (impression à la demande)
- **Modération** : OpenAI Moderation API (fallback regex)
- **Analytics** : PostHog Cloud EU (RGPD, consent-gated)
- **Errors** : Sentry
- **Rate limiting** : Upstash Redis
- **Push** : Web Push API + VAPID
- **App installable (PWA)** : service worker, manifestes par page, icônes PNG ; apps des magasins plus tard (`docs/CAPACITOR.md`)

---

## Démarrage rapide

### 1. Cloner et installer

Prérequis : Node 24, la version du champ `engines` de `package.json` (Vercel et la CI la lisent aussi).

```bash
git clone <repo-url>
cd inrealsociety-main
npm install
```

### 2. Variables d'environnement

Copier `.env.example` en `.env.local` et remplir les valeurs :

```bash
cp .env.example .env.local
```

Variables **obligatoires** pour démarrer :

| Variable | Où la trouver |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API ⚠️ secret |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` en local |

> Sans Supabase, le serveur démarre quand même (placeholders) mais les pages
> dynamiques crashent à la query. Voir [src/lib/supabase-config.ts](src/lib/supabase-config.ts).

Variables **recommandées** pour activer toutes les features (Stripe, emails,
push, analytics, etc.) : voir `.env.example` — chaque section a un commentaire
expliquant où récupérer la clé.

### 3. Appliquer les migrations Supabase

- **Base neuve** : coller [scripts/fresh-setup.sql](scripts/fresh-setup.sql) dans le
  SQL editor (l'ordre numérique naïf échoue : `001` dépend de tables créées en `015`).
- **Base existante** : Supabase CLI, après avoir marqué l'historique — voir
  [docs/SUPABASE_CLI.md](docs/SUPABASE_CLI.md) (⚠️ un `supabase db push` sans
  `migration repair` préalable tenterait de rejouer toutes les migrations).

Migrations critiques :
- `015_schema_complet.sql` : schéma de référence
- `025_fuse_reply_into_thread.sql` : backfill thread + view `member_inbox`
- `026_rls_audit.sql` : durcissement RLS (anon)
- `029_drop_legacy_reply_columns.sql` : drop colonnes legacy ⚠️ **après 2 semaines d'observation post-025**
- `030_rls_members_complete.sql` : RLS members + RPC `get_own_member`

### 4. Lancer le serveur de dev

```bash
npm run dev
```

→ http://localhost:3000

---

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Serveur de développement Next.js (webpack) |
| `npm run build` | Build production (webpack : `next.config.mjs` en ajuste la config, que Turbopack, le défaut de Next 16, refuse) |
| `npm run start` | Serve le build prod |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires (vitest) |
| `npm run test:watch` | Vitest en watch mode |
| `npm run test:e2e` | Tests E2E Playwright (smoke + tunnel) |
| `npm run test:e2e:ui` | Playwright en mode UI interactive |
| `npm run analyze` | Build avec bundle analyzer (3 rapports HTML) |

Pour les tests E2E du tunnel achat complet (Stripe test mode + Supabase test) :

```bash
TEST_E2E_FULL=1 npm run test:e2e
```

---

## Architecture

```
src/
├── app/                           # Next.js App Router
│   ├── api/                       # Routes API (~30 endpoints)
│   │   ├── shop/checkout/         # Achat t-shirt
│   │   ├── subscription/checkout/ # Premium subscription
│   │   ├── webhook/stripe/        # Webhook Stripe (events business critiques)
│   │   ├── member/                # CRUD profile + export RGPD + delete
│   │   ├── push/                  # Web Push subscribe + notify
│   │   ├── cron/                  # Cron jobs Vercel (cleanup, scan-reminders)
│   │   └── health/                # Healthcheck pour monitoring uptime
│   ├── dashboard/[memberId]/      # Espace membre (Home + Inbox + Settings)
│   ├── profil/[memberId]/         # Profil public + OG image dynamique
│   ├── shop/                      # Tunnel d'achat
│   ├── conversation/[messageId]/  # Thread scanner ↔ membre
│   └── components/                # Provider PostHog, ConsentBanner, etc.
├── lib/                           # Helpers serveur partagés
│   ├── supabase.ts                # Client anon (lectures)
│   ├── supabase-admin.ts          # Client service_role (mutations)
│   ├── fulfillment.ts             # QR + Printful (post-activation)
│   ├── moderation.ts              # OpenAI + fallback regex
│   ├── push-notify.ts             # Web Push helper
│   ├── audit.ts                   # Audit logs
│   ├── ratelimit.ts               # Upstash Redis rate limit
│   └── env.ts                     # Validation env vars au boot
├── __tests__/                     # Tests unitaires vitest
└── proxy.ts                       # Auth + cookies + redirect + CSP (ex-middleware.ts)

supabase/migrations/               # SQL versionné (~30 fichiers, ordre numérique)
e2e/                               # Tests Playwright
public/
├── sw.js                          # Service worker (push + PWA cache)
├── manifest.json                  # PWA manifest (« Mon espace » et conversations : src/lib/web-manifest.ts)
├── *.png, icon.svg                # Icônes de l'app installable (node scripts/build-app-icons.mjs)
└── .well-known/security.txt       # Signalement de faille
docs/                              # Guides ops (monitoring, perf, email DNS)
```

---

## Déploiement

### Vercel (recommandé)

1. Connecter le repo GitHub à Vercel
2. Importer toutes les env vars du `.env.local` dans Vercel Dashboard → Settings → Environment Variables
3. **Pour Vercel Cron** : ajouter `CRON_SECRET` (Vercel injecte auto dans le header `Authorization: Bearer`)
4. Push sur `main` → déploiement auto

La version de Node vient du champ `engines` de `package.json` (24.x) : elle prime sur le réglage « Node.js Version » du projet Vercel.

### Webhook Stripe

Dans Stripe Dashboard → Developers → Webhooks → Add endpoint :
- URL : `https://inrealsociety.com/api/webhook/stripe`
- Events :
  - `checkout.session.completed` (achat + subscription)
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `charge.refunded`
  - `invoice.payment_failed`
- Copier le `whsec_...` dans `STRIPE_WEBHOOK_SECRET`

### Configuration des services tiers

Avant lancement public :
- [docs/EMAIL_DELIVERABILITY.md](docs/EMAIL_DELIVERABILITY.md) — DNS SPF/DKIM/DMARC
- [docs/MONITORING.md](docs/MONITORING.md) — Uptime + Sentry alerts
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md) — Lighthouse + bundle budget
- [docs/ECONOMIE_UNITAIRE.md](docs/ECONOMIE_UNITAIRE.md) — marges, frais fixes, TVA (franchise), seuils
- [docs/MODERATION.md](docs/MODERATION.md) — signalements : délais, gestes, modèles d'email, autorités

---

## Sécurité

- **RLS Supabase** activée sur toutes les tables (voir migrations `001-011` + `026` + `030`)
- **Rate limiting** sur toutes les routes mutables (Upstash Redis, double IP + userId)
- **CSP** stricte dans `next.config.mjs` (whitelist Stripe/Supabase/PostHog/Sentry)
- **Audit logs** sur les actions sensibles (table `audit_logs`)
- **Modération** des messages via OpenAI (fallback regex sans clé)
- **Idempotence** Stripe webhook (vérification status + row count)
- **Push tokens** validés VAPID
- **Cron secret** pour les endpoints `/api/cron/*` (Vercel inject `Authorization: Bearer`)
- **Pre-commit hook** husky + lint-staged (eslint --fix)
- **Dépendances** : alertes Dependabot sur les failles connues ; corrections sans version majeure via `npm audit fix` sous Node 24 (le npm 10 de Node 22 plante sur cet arbre de dépendances)

Signaler une faille : voir [public/.well-known/security.txt](public/.well-known/security.txt).

---

## Données personnelles & RGPD

- **Politique de confidentialité** : `/confidentialite` ([page](src/app/confidentialite/page.tsx))
- **Mentions légales** : `/mentions-legales` ([page](src/app/mentions-legales/page.tsx))
- **Consent banner** PostHog opt-in par défaut (CNIL)
- **Marketing consent** séparé (`members.marketing_consent`)
- **GDPR export** : `GET /api/member/export` (JSON download)
- **GDPR delete** : `DELETE /api/member/delete` (suppression complète + Storage)
- **Cleanup auto** : `cleanup_old_data()` (audit_logs 12 mois, activation_codes orphelins 90j, scans 24 mois)

---

## Tests

Stack actuelle :
- **Unitaires** (vitest) : 270+ tests, dont security-routes auto-discover
- **E2E** (Playwright) : smoke tests pages publiques + skeleton tunnel
- **CI** (GitHub Actions) : lint + typecheck + vitest + build + playwright sur PR

Couverture explicite :
- ✅ `src/lib/moderation.ts` — chemins OpenAI + fallback regex
- ✅ `src/lib/fulfillment.ts` — idempotence Printful
- ✅ `src/lib/generate-qr-svg.ts` — génération QR premium
- ✅ Routes API : auth + validation + rate limit + mutations admin-only
- ⚠️ Tunnel E2E complet (achat → activation → scan) : skeleton à finir avec Stripe test mode

---

## Conventions de code

- **TypeScript strict** partout (`tsconfig.json` strict: true)
- **Server Components** par défaut ; `'use client'` uniquement si interactivité
- **`supabase`** (anon) pour les lectures publiques, **`supabaseAdmin`** (service_role) pour toute mutation
- **Validation Zod** sur tous les bodies POST/PATCH
- **Rate limit** systématique sur les routes publiques (IP) ou auth (userId)
- **Audit log** sur les actions sensibles (`@/lib/audit`)
- **No backwards-compat hacks** : si une feature change, on migre les données + on supprime le legacy proprement

---

## Roadmap connue

Items en attente après l'audit complet 2026-05 :

**Critique côté humain** : remplir mentions légales (SIRET, médiateur conso), configurer DNS email (SPF/DKIM/DMARC), tester E2E tunnel complet avec Stripe.

**Nice-to-have** : refacto WCAG contrastes (palette grise), i18n (currently FR-only), visual regression tests, annual subscription, gift purchases.

---

## Contact

- **Site** : https://inrealsociety.com
- **Email** : hello@inrealsociety.com
- **Sécurité** : security@inrealsociety.com
