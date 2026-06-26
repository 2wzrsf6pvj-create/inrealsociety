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
| `036` | `cleanup_old_data()` purge aussi les `push_subscriptions` > 90j | hygiène (subs scanner orphelines retenues sinon indéfiniment) |
| `040` | `cleanup_old_data()` EXEMPTE les preuves de consentement / d'opérations RGPD de la purge 12 mois | 🔴 conformité (art. 7 — ne pas détruire la preuve de consentement) |
| `041` | DROP `increment_scan_count` (DEFINER exposé à anon) + REVOKE `marketing_consent` sur members | 🔴 ferme 2 trous exploitables à la clé anon (intégrité scan_count + fuite RGPD cross-membre) |
| `042` | `members` : lecture BLOCKLIST → ALLOWLIST (REVOKE SELECT + GRANT colonnes publiques uniquement) | 🟠 fail-safe : toute nouvelle colonne sensible n'est plus exposée par défaut (cause racine de la fuite 041) |
| `043` | table `newsletter_campaigns` (idempotence/audit des envois) | feature : active l'envoi de newsletter (service_role only) |
| `044` | table `profile_completion_reminders` + fonction `accounts_pending_profile()` (DEFINER) | feature : relance « payé mais profil non finalisé » (t-shirt en attente) |

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
for f in 033_rls_hardening_views 034_record_scan 035_secure_create_member_rpc 036_cleanup_push_subscriptions \
         040_audit_retain_consent 041_security_scan_count_and_consent 042_members_select_allowlist \
         043_newsletter_campaigns 044_profile_completion_reminders; do
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
Script turnkey (aucun auth/Stripe requis, juste une connexion DB) :
```bash
psql "$DATABASE_URL" -f scripts/verify-migrations.sql
```
Il vérifie : anon/authenticated ne lisent plus `member_inbox`/`first_scans`,
les vues sont en `security_invoker=on`, `record_scan` existe, et anon ne peut
plus exécuter `create_member_with_code` (service_role oui).

---

## 2. Configuration requise (env + dashboards)

`src/lib/env.ts` valide au boot. Groupé par impact si **absent** :

### 🔴 Bloquant (l'app crash au boot en prod)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

### 🟠 Dashboard Supabase — Auth (reset mot de passe cross-device)
- **Email templates** → modèle **« Reset Password »** : remplacer le lien par
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`.
  Sans ça, le lien par défaut est un `?code=` PKCE lié à l'appareil d'origine :
  « demande sur PC, ouvre sur mobile » échoue (lien affiché « expiré »). La route
  `/auth/confirm` (verifyOtp serveur) gère le token cross-device. Idem modèle
  **« Confirm signup »** si besoin : `…&type=signup&next=/dashboard`.
- **URL Configuration** : ajouter `${APP_URL}/auth/confirm` et
  `${APP_URL}/auth/callback` aux **Redirect URLs** autorisées.
- 🔴 **« Confirm email » DOIT rester ACTIVÉ** (Auth → Providers → Email →
  *Confirm email*). La récupération de profil orphelin (`claimOrphanedMember`,
  dashboard) n'autorise la reprise d'un profil que si `email_confirmed_at` est
  posé — c'est la **preuve de propriété**. Si la confirmation email est désactivée,
  Supabase pose `email_confirmed_at` dès le signup **sans vérification réelle** →
  n'importe qui peut s'inscrire avec l'email d'une victime et **récupérer son
  profil orphelin**. L'invariant est dans le code (gate sur `email_confirmed_at`)
  mais ne vaut que si la config Supabase le rend vrai.

### 🟠 Paiement / commerce (sinon shop & premium cassés)
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID`
- `STRIPE_REFERRAL_COUPON_ID` (sinon la remise parrainage ne s'applique jamais)
- **Dashboard Stripe** : activer **Stripe Tax** (sinon `automatic_tax` applique 0 %), créer le **coupon parrainage** — ⚠️ y mettre une limite (`max_redemptions` et/ou durée) car l'UUID parrain est public : sans plafond, la remise est cumulable à l'infini par n'importe qui (coût marketing non borné) —, configurer le **webhook** vers `/api/webhook/stripe` (events : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `invoice.payment_failed`).

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
- `INTERNAL_SECRET` → `/api/push/notify` + `/api/newsletter/send` (endpoints externes) fail-closed
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

> ⚠️ **Seed** : `members.auth_user_id` a une FK vers `auth.users` → on ne peut pas
> insérer un membre en SQL brut. Créer d'abord un user (dashboard Supabase Auth ou
> `supabase` admin), puis dérouler le vrai flux signup → `/register`. Les checks
> RLS (`scripts/verify-migrations.sql`) ne nécessitent eux aucun seed.

Puis dérouler les flux critiques (ceux corrigés ce lot) :

| Flux | Commande / action | Attendu |
|---|---|---|
| **Scan + dédup** | `curl -XPOST localhost:3000/api/scan -d '{"memberId":"<id>"}' -H 'content-type: application/json'` ×2 | 1er `{ok:true}`, 2e `{ok:true,duplicate:true}` ; `scan_count` +1 seulement |
| **Message — fenêtre/limite** | POST `/api/message` après expiry / au-delà de 3 convs | `{code:"window_expired",windowHours:…}` / `{code:"conversation_limit"}` |
| **Webhook achat** | `stripe trigger checkout.session.completed` | order → `paid`, code généré, email, fulfillment si membre |
| **Abonnement — downgrade** | `stripe trigger customer.subscription.deleted` | membre repasse `plan='free'` (vérifie qu'aucune erreur n'est loggée — bug C1) |
| **Fulfillment short_code** | membre sans `short_code` qui se fait fulfiller | `members.short_code` rempli + QR encode `/r/<code>` (pas `/profil/`) |
| **RLS clé publique** | `curl "$SUPABASE_URL/rest/v1/member_inbox" -H "apikey: $ANON_KEY"` | refus / vide (pas les messages de tous) |

### 3bis. Validation du lot AUDIT 2026-06 (branche `hardening/audit-2026-06`)

**Migrations 040 + 041 — dry-run puis vérif post-apply**
```bash
# Dry-run syntaxe (transaction annulée)
psql "$STAGING_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
\i supabase/migrations/040_audit_retain_consent.sql
\i supabase/migrations/041_security_scan_count_and_consent.sql
ROLLBACK;
SQL
```
Après apply réel, vérifier les 2 trous fermés :
```sql
-- F1 : la fonction ne doit plus exister
SELECT count(*) FROM pg_proc WHERE proname = 'increment_scan_count';   -- attendu : 0
```
```bash
# F2 + 042 allowlist : la clé ANON ne lit QUE les colonnes publiques
curl -s "$SUPABASE_URL/rest/v1/members?select=marketing_consent" -H "apikey: $ANON_KEY"  # → permission denied
curl -s "$SUPABASE_URL/rest/v1/members?select=email"             -H "apikey: $ANON_KEY"  # → permission denied
curl -s "$SUPABASE_URL/rest/v1/members?select=id,name,plan"      -H "apikey: $ANON_KEY"  # → OK (liste)
# Régression à NE PAS casser : login/register (filtre auth_user_id), profil public,
# /join/[code], conversation. Dérouler un login réel + ouverture d'un profil public.
```

**Flux applicatifs corrigés ce lot**
| Fix | Action | Attendu |
|---|---|---|
| **Modération — bypass flag client** | `POST /api/message {memberId, content:"<insulte modérée>", isQuickReply:true}` | `{moderated:true}` (le flag client ne saute plus la modération) ; une quick-reply RÉELLE de la liste reste `moderated:false` |
| **Rate-limit XFF** | 21× `POST /api/scan` même IP réelle mais header `X-Forwarded-For` différent à chaque fois | 429 atteint (sur Vercel : la clé = `x-real-ip`, plus contournable) |
| **Referral — anti-hijack** | `POST /api/referral {referrerId:<self>, orderId:<order déjà parrainée par X>}` | `orders.referrer_id` INCHANGÉ (reste X) |
| **RGPD delete — preuve consentement** | membre toggle consent puis supprime son compte | ligne `audit_logs.action='member.marketing_consent_changed'` SURVIT (member_id → NULL) ; activity logs effacés |
| **RGPD delete/export — orders par code** | order au checkout sous un email ≠ email d'auth, puis delete / export | delete : `orders.email` anonymisé ; export : la commande APPARAÎT (matchée par activation_code) |
| **Webhook — filet money-path** | order avec `stripe_session_id` NULL mais `metadata.orderId` posé → `stripe trigger checkout.session.completed` | order finalisée (paid + code), `stripe_session_id` back-fillé |
| **Cron fulfillment-reconcile** | order `paid` + membre + `printful_order_id` NULL → `curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/fulfillment-reconcile` ; puis sans header | 1er : `{fulfilled:≥1}` + commande Printful créée ; sans header : `403` |
| **Cron premium-reconcile** | sans `Authorization` | `403` (et avec : balaie TOUS les premium, pas 100) |

```bash
# Webhook : rejouer un event spécifique
stripe trigger customer.subscription.deleted
stripe trigger charge.refunded
```

---

## 4. Merge / déploiement code
- Brancher le lot de durcissement sur `main` (voir PR), déployer **après** §1 (migrations) et §2 (config).
- Surveiller Sentry les premières heures : le webhook renvoie désormais **5xx sur erreur** (Stripe réessaie) — un pic de retries signale un handler défaillant.
- 5 crons Vercel actifs : cleanup (dim 3h), scan-reminders (quotidien 9h), premium-reconcile (quotidien 4h), fulfillment-reconcile (toutes les 6h), activation-reminder (quotidien 10h — relance « payé mais profil non finalisé »). ⚠️ Vérifier que le plan Vercel autorise ce nombre/cette fréquence de crons (Hobby = limité) ; sinon réduire fulfillment-reconcile à quotidien.

## 5. À COMPLÉTER avant prod — légal (données entreprise, hors code)
Placeholders `[À COMPLÉTER]` à remplir (ne peuvent pas être devinés) :
- `src/app/mentions-legales/page.tsx` : raison sociale + forme juridique, SIRET, siège, RCS, TVA intra, téléphone, directeur de publication, **médiateur de la consommation** (nom + URL).
- `src/app/confidentialite/page.tsx` : identité du responsable de traitement + **contact DPO**.
- Faire **valider par un juriste** la conformité RGPD/CGV finale.
- DNS email : **SPF / DKIM / DMARC** (cf. `docs/EMAIL_DELIVERABILITY.md`).

## 6. Différés assumés (notés, non bloquants)
- **Consentement analytics serveur** : les events `subscription_*` partent à PostHog via le webhook sans connaître le choix du membre (pseudonyme = memberId). À traiter en *intérêt légitime opérationnel* documenté, OU stocker le consentement analytics en DB et le vérifier serveur.
- **Newsletter** : ✅ envoi IMPLÉMENTÉ (`POST /api/newsletter/send`, protégé `INTERNAL_SECRET`). Audience = consentis (newsletter `unsubscribed_at IS NULL` ∪ `members.marketing_consent=true`) moins tout opt-out ; lien `signUnsubscribe` + headers `List-Unsubscribe`/`-Post` (one-click) par destinataire ; idempotence via `newsletter_campaigns.key` ; `dryRun` pour prévisualiser l'audience. Usage : `curl -X POST $URL/api/newsletter/send -H "x-internal-secret: $INTERNAL_SECRET" -H 'content-type: application/json' -d '{"key":"2026-07-drop","subject":"…","html":"…","dryRun":true}'` (retirer `dryRun` pour envoyer). ⚠️ Toujours faire un `dryRun` d'abord pour vérifier la taille d'audience.
- **`marketing_consent`** : collecté/audité mais jamais lu (aucun envoi marketing aujourd'hui). À filtrer (`= true`) quand un envoi existera. (scan-reminder = transactionnel, lié à l'achat.)
- **RLS `members` allowlist** : `members_select_public USING(true)` expose encore les colonnes *non sensibles* de tous les membres (les sensibles sont revoke en 026/030). Refonte allowlist reportée.
