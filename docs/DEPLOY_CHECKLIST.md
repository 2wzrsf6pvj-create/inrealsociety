# Deploy Checklist

> Rien ne doit partir « inerte ». Les correctifs de sécurité (RLS, RPC verrouillées,
> vues durcies) ne protègent **que** si les migrations sont appliquées, et plusieurs
> features sont no-op sans leur config. Cette checklist couvre les deux.

---

## 1. Migrations SQL — ordre & application

Les migrations sont numérotées et **doivent s'appliquer dans l'ordre** (`supabase/migrations/001 … 035`).

### Nouveautés de ce lot de durcissement
| # | Effet | Critique ? |
|---|---|---|
| `021` (édité) | `orders.amount SET DEFAULT` désormais **guardé** (`DO $$ IF EXISTS column $$`) → ne plante plus sur une base neuve avant que 031 crée la colonne | déblocage CI/fresh deploy |
| `031` | crée `orders.amount` | requis avant que le code lise amount |
| `033` | `member_inbox` / `first_scans` : `security_invoker = on` + `REVOKE … FROM anon, authenticated` | 🔴 ferme une fuite cross-membre via la clé publique |
| `034` | RPC `record_scan` (insert scan + incrément atomiques) | corrige la dérive de `scan_count` |
| `035` | `REVOKE EXECUTE create_member_with_code FROM anon, public` + grant service_role | 🔴 ferme un bypass d'auth (création de membre arbitraire) |

### Base NEUVE (staging / nouveau projet)
```bash
# Avec Supabase CLI
supabase db reset          # applique 001 → 035 dans l'ordre
# OU psql, en transaction pour tout annuler en cas d'erreur :
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f <(cat supabase/migrations/0*.sql supabase/migrations/[123]*.sql)
```

### Base EXISTANTE (prod déjà à 032)
Appliquer **uniquement les nouvelles** dans l'ordre :
```bash
for f in 033_rls_hardening_views 034_record_scan 035_secure_create_member_rpc; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "supabase/migrations/$f.sql"
done
# 021 a été édité (guard idempotent) : sûr à ré-exécuter si tu veux l'aligner.
```

### Dry-run obligatoire avant prod
Tester chaque migration **dans une transaction annulée** pour valider la syntaxe (signatures de `REVOKE`, `security_invoker` PG15+) sans rien modifier :
```bash
psql "$STAGING_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
\i supabase/migrations/033_rls_hardening_views.sql
\i supabase/migrations/034_record_scan.sql
\i supabase/migrations/035_secure_create_member_rpc.sql
ROLLBACK;   -- aucun changement gardé, on a juste prouvé que ça passe
SQL
```
⚠️ `security_invoker` requiert **Postgres ≥ 15** (Supabase l'est).
⚠️ Vérifier que les signatures des `REVOKE EXECUTE` matchent exactement les
fonctions existantes (types d'arguments), sinon la migration échoue.

### Post-application — sanity checks
```sql
-- 033 : anon ne doit plus pouvoir lire les vues
SELECT has_table_privilege('anon', 'member_inbox', 'SELECT');  -- attendu: false
SELECT has_table_privilege('anon', 'first_scans',  'SELECT');  -- attendu: false
-- 035 : anon ne doit plus pouvoir exécuter la RPC
SELECT has_function_privilege('anon',
  'create_member_with_code(uuid,text,text,text,text,text,text)', 'EXECUTE'); -- false
-- 034 : la fonction existe
SELECT proname FROM pg_proc WHERE proname = 'record_scan';
```

---

## 2. Configuration requise (env + dashboards)

`src/lib/env.ts` valide au boot. Groupé par impact si **absent** :

### 🔴 Bloquant (l'app crash au boot en prod)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

### 🟠 Paiement / commerce (sinon shop & premium cassés)
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID`
- `STRIPE_REFERRAL_COUPON_ID` (sinon la remise parrainage ne s'applique jamais)
- **Dashboard Stripe** : activer **Stripe Tax** (sinon `automatic_tax` applique 0 %), créer le **coupon parrainage**, configurer le **webhook** vers `/api/webhook/stripe` (events : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `invoice.payment_failed`).

### 🟠 Fulfillment (sinon t-shirt payé jamais expédié — alerté via Sentry)
- `PRINTFUL_API_TOKEN`, `PRINTFUL_VARIANT_ID_DARK`, `PRINTFUL_VARIANT_ID_LIGHT`

### 🟡 Rate-limit (sinon routes limitées → 500 ; dédup scan → fail-open)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### 🟡 Observabilité (sinon les échecs paid-non-livré restent invisibles)
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
  → **sans DSN, l'alerting Sentry ajouté sur `*_failed` est un no-op.**

### 🟡 Features dégradées si absentes (warning, pas crash)
- `OPENAI_API_KEY` → modération tombe sur le regex (fallback, faux négatifs possibles)
- `RESEND_API_KEY` + **DNS SPF/DKIM/DMARC** → emails (codes, replies) non délivrés
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → push no-op
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` → analytics off
- `CRON_SECRET` → crons (cleanup, scan-reminders) non protégés/non déclenchés
- `INTERNAL_SECRET` → `/api/push/notify` (endpoint externe) fail-closed
- `SHORT_DOMAIN` (optionnel) → sinon les QR utilisent `${APP_URL}/r/<code>`

---

## 3. Validation staging (runbook — à exécuter, pas encore fait)

Sur une **DB jetable** (nouveau projet Supabase ou `supabase start` local) :

```bash
# 1. Migrations
supabase db reset           # ou le dry-run §1 puis apply

# 2. App + Stripe en local
npm run dev
stripe listen --forward-to localhost:3000/api/webhook/stripe   # note le whsec_… → STRIPE_WEBHOOK_SECRET
```

Puis dérouler les flux critiques (ceux corrigés ce lot) :

| Flux | Commande / action | Attendu |
|---|---|---|
| **Scan + dédup** | `curl -XPOST localhost:3000/api/scan -d '{"memberId":"<id>"}' -H 'content-type: application/json'` ×2 | 1er `{ok:true}`, 2e `{ok:true,duplicate:true}` ; `scan_count` +1 seulement |
| **Message — fenêtre/limite** | POST `/api/message` après expiry / au-delà de 3 convs | `{code:"window_expired",windowHours:…}` / `{code:"conversation_limit"}` |
| **Webhook achat** | `stripe trigger checkout.session.completed` | order → `paid`, code généré, email, fulfillment si membre |
| **Abonnement — downgrade** | `stripe trigger customer.subscription.deleted` | membre repasse `plan='free'` (vérifie qu'aucune erreur n'est loggée — bug C1) |
| **Fulfillment short_code** | membre sans `short_code` qui se fait fulfiller | `members.short_code` rempli + QR encode `/r/<code>` (pas `/profil/`) |
| **RLS clé publique** | `curl "$SUPABASE_URL/rest/v1/member_inbox" -H "apikey: $ANON_KEY"` | refus / vide (pas les messages de tous) |

```bash
# Webhook : rejouer un event spécifique
stripe trigger customer.subscription.deleted
stripe trigger charge.refunded
```

---

## 4. Merge / déploiement code
- Brancher le lot de durcissement sur `main` (voir PR), déployer **après** §1 (migrations) et §2 (config).
- Surveiller Sentry les premières heures : le webhook renvoie désormais **5xx sur erreur** (Stripe réessaie) — un pic de retries signale un handler défaillant.
