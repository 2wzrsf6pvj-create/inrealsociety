# Deploy Checklist

> Rien ne doit partir « inerte ». Les correctifs de sécurité (RLS, RPC verrouillées,
> vues durcies) ne protègent **que** si les migrations sont appliquées, et plusieurs
> features sont no-op sans leur config. Cette checklist couvre les deux.

---

## 1. Migrations SQL — ordre & application

Les migrations sont numérotées et **doivent s'appliquer dans l'ordre** (`supabase/migrations/001 … 062`).

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
| `045` | `REVOKE UPDATE ON members` (anon/authenticated) + fix `cleanup_old_data()` (`silent_views.created_at`) | 🔴 ferme l'escalade premium par PATCH direct (clé anon) + répare la purge RGPD (cron cleanup en 500) |
| `046` | `banned_devices` (ban global device) + `members.terms_accepted_at`/`service_waiver_at` (consentement activation) + `cleanup_old_data()` (rétention 24 mois des traces d'abus, exemption `member.activated`) | 🟠 anti-harcèlement en série + preuve de consentement bien/service + minimisation RGPD différenciée |
| `047` | index UNIQUE partiel `messages(member_id, sender_token) WHERE parent_id IS NULL` | 🟠 rend atomique la règle « un seul message par device » (anti-TOCTOU). ⚠️ dédupliquer d'abord si base existante (cf. commentaire migration) |
| `048` | `orders.qr_style` (TEXT NOT NULL DEFAULT 'rounded' + CHECK) | feature : le client choisit la forme du QR à l'achat. `ADD COLUMN` avec default = safe sur base live |
| `049` | `orders.tagline_id` (accroche imprimée sous le QR) | feature : **requis par le checkout** (insert de la colonne) |
| `050` | `orders.short_code` + index unique partiel | feature : **requis par l'impression au paiement** (`FULFILL_ON_PAYMENT`) |
| `051` | index unique `feedback(message_id)` (conversation) | 🟠 une seule note par thread (anti-course) |
| `052` | DROP policy + `REVOKE INSERT, DELETE` sur `members` / `referrals` | 🔴 ferme la création de membre premium par POST direct (clé anon + session) |
| `053` | `REVOKE EXECUTE … FROM authenticated` sur les RPC DEFINER (`record_scan`, `create_member_with_code`, `accounts_pending_profile`, `cleanup_old_data`) + default privileges fail-safe + `messages` sans écriture client + plus d'upload direct Storage | 🔴 ferme la fuite d'emails, le vol de short_code imprimé et les scans forgés **par n'importe quelle session signup** |
| `054` | `members.suspended_at` + CHECK « suspendu ⇒ en pause » | 🟠 **à appliquer AVANT le déploiement du code** qui s'en sert : le webhook de remboursement suspend le profil activé par le code remboursé |
| `055` | `orders.activation_reminders_sent` / `activation_reminder_at` + index partiel | 🟠 relance des acheteurs payés jamais activés (J+2, J+7) par le cron `activation-reminder`. Sans elle, cette partie du cron est ignorée (la relance des comptes continue) |
| `056` | table `message_reports` (une ligne par porteur et par appareil signalé) + RLS sans accès client | 🟠 bannissement automatique d'un appareil signalé par 3 porteurs différents. Sans elle, un signalement masque toujours le message, mais n'est ni compté ni suivi d'un bannissement |
| `057` | table `contact_verifications` (lien de confirmation de l'email laissé par un passant, jeton haché) + RLS sans accès client | 🟠 les réponses d'un porteur ne partent par email qu'à une adresse confirmée. **À appliquer AVANT le déploiement du code** : sans elle, aucune réponse ne part plus par email (la confirmation ne peut pas être créée) |
| `058` | purge hebdomadaire : conversations supprimées 12 mois après leur dernier message, preuves RGPD bornées à 5 ans, traces d'abus 24 mois ; géolocalisation : `record_scan` ignore les coordonnées, les scans existants perdent les leurs et ne gardent que la ville | 🟡 RGPD (minimisation, durées annoncées dans la politique de confidentialité). Sans elle, rien ne casse : le code n'envoie déjà plus de coordonnées, mais les anciennes restent et les conversations ne sont jamais purgées |
| `059` | `members.scan_email_on` / `members.cap_email_at` + fonctions `claim_scan_email` / `claim_cap_email` (réservation atomique, backend seulement) | 🟡 emails du porteur limités : un email de scan par jour, un email « plafond atteint » par semaine. Sans elle, rien ne casse : les emails de scan partent à chaque scan (comme avant) et l'email de plafond ne part pas |
| `060` | `members.referral_code` rempli (colonne de 015 jamais utilisée) + défaut `gen_referral_code()`, non nul, unique | 🟡 lien de parrainage `/join/<code>` qui ne révèle plus l'identifiant du profil. Sans elle, le tableau de bord garde l'ancien lien à identifiant, qui continue de donner la remise |
| `061` | `members.scan_emails` (défaut : activé) + `claim_scan_email` qui le respecte | 🟡 le porteur peut couper l'email de scan (réglages, lien en un clic dans l'email). Sans elle, rien ne casse : l'interrupteur n'apparaît pas dans les réglages, et le lien de l'email affiche « Impossible pour le moment » |
| `062` | `cleanup_old_data()` ne purge plus que les abonnements aux notifications des **passants** + `members.phone_os` / `members.app_installed_at` (téléphone relevé à l'ouverture de « Mon espace », cf. `src/lib/phone.ts`) | 🟠 sans elle, un porteur qui n'ouvre pas « Mon espace » pendant 90 jours cesse d'être notifié, sans le savoir. Le reste ne casse pas : le téléphone n'est pas relevé, et /admin affiche « migration 062 à appliquer » |

### Base NEUVE (staging / nouveau projet) — recommandé (Option A)
⚠️ **L'ordre 001→062 naïf ÉCHOUE** : `001_enable_rls` fait `ALTER TABLE members …`
alors que `members` n'est créée qu'en `015`. L'ordre correct est **015 D'ABORD**,
puis 001-014, puis 016-062.

Utiliser le bundle pré-généré **et validé** (57/57 migrations — schéma identique, grants et policies compris, à l'application une par une ; vérifié sur PG16) :
```
scripts/fresh-setup.sql   ← à coller intégralement dans le Supabase SQL Editor d'un
                            projet NEUF (auth + storage + rôles déjà présents) → Run.
```
Régénérer le bundle après ajout d'une migration :
```bash
node scripts/build-fresh-setup.mjs          # 015 puis le reste numérique, verbatim
node scripts/build-fresh-setup.mjs --check  # aussi vérifié par vitest (fresh-setup-sync.test.ts)
```
> Ne PAS utiliser `cat supabase/migrations/0*.sql` (ordre naïf → échec 001).

### Base EXISTANTE — recommandé : Supabase CLI
Voir **[SUPABASE_CLI.md](SUPABASE_CLI.md)** : une fois l'historique marqué
(`migration repair`, sans rien rejouer), `npx supabase db push` n'applique que
les migrations manquantes et la base garde la trace de ce qui est appliqué.

### Base EXISTANTE — à la main (prod déjà à 032)
Appliquer **uniquement les nouvelles** dans l'ordre :
```bash
for f in 033_rls_hardening_views 034_record_scan 035_secure_create_member_rpc 036_cleanup_push_subscriptions \
         040_audit_retain_consent 041_security_scan_count_and_consent 042_members_select_allowlist \
         043_newsletter_campaigns 044_profile_completion_reminders 045_fix_members_update_and_cleanup \
         046_abuse_controls_and_activation_consent 047_one_root_message_per_device \
         048_order_qr_style 049_order_tagline 050_order_short_code \
         051_feedback_unique_conversation 052_close_members_referrals_insert \
         053_close_definer_rpcs_to_authenticated 054_member_suspension \
         055_order_activation_reminders 056_message_reports 057_contact_verifications \
         058_rgpd_retention_city_only 059_notification_throttles 060_referral_code \
         061_scan_email_opt_out 062_push_porteurs_telephone; do
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
- **Dashboard Stripe** : franchise de TVA (`VAT_EXEMPT`) → **pas de Stripe Tax** (aucun `automatic_tax` envoyé), pied de facture « TVA non applicable, art. 293 B du CGI » ; si l'entreprise devient assujettie : `docs/ECONOMIE_UNITAIRE.md`, section 9. Créer le **coupon parrainage** — ⚠️ y mettre une limite (`max_redemptions` et/ou durée) car le lien de parrainage circule librement : sans plafond, la remise est cumulable à l'infini par n'importe qui (coût marketing non borné) —, configurer le **webhook** vers `/api/webhook/stripe` (events : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `invoice.payment_failed`).
- **Premium** : Price `STRIPE_PREMIUM_PRICE_ID` en tax_behavior **« inclusive »** (sans effet en franchise ; sans lui, le jour où la TVA s'applique, Stripe l'ajoute → 3,59 €) ; **portail client** : résiliation autorisée **à la fin de la période** (CGV art. 8 : le premium reste actif jusqu'à la fin du mois payé) et mise à jour du moyen de paiement autorisée (emails d'échec de paiement).

### 🟠 Fulfillment (sinon t-shirt payé jamais expédié — alerté via Sentry)
- `PRINTFUL_API_TOKEN`
- **⚠️ `PRINTFUL_VARIANT_ID_{DARK|LIGHT}_{S|M|L|XL|XXL}` (10 variables)** — un variant_id
  Printful encode couleur **ET** taille. Sans elles, **toutes les commandes partent à la
  taille du fallback** `PRINTFUL_VARIANT_ID_{DARK|LIGHT}` → le client reçoit la mauvaise
  taille. Renseigner les 10 depuis le catalogue Printful avant toute vente réelle.

### 🔴 Rate-limit (sinon QR codes, scans et messages → 500)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — les limiteurs publics
  échouent fermés : sans Upstash, `/r/<code>` (QR imprimés), `/api/scan`,
  `/api/message`, `/api/profile/report`… répondent 500 (vérifié en local).

### 🟡 Observabilité (sinon les échecs paid-non-livré restent invisibles)
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
  → **sans DSN, l'alerting Sentry ajouté sur `*_failed` est un no-op.**

### 🟡 Features dégradées si absentes (warning, pas crash)
- `OPENAI_API_KEY` → modération tombe sur le regex (fallback, faux négatifs possibles)
- `ADMIN_ALERT_EMAIL` → adresse qui reçoit une alerte à chaque signalement de message (contenu, appareil, bannissement auto). Sans elle, personne n'est prévenu
- `ADMIN_EMAILS` → emails autorisés sur `/admin` (modération), séparés par des virgules ; compte existant et adresse confirmée exigés
- `RESEND_API_KEY` + **DNS SPF/DKIM/DMARC** → emails (codes, replies) non délivrés
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → push no-op (indispensables pour le test terrain)
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` → analytics off
- `CRON_SECRET` → crons (cleanup, scan-reminders) non protégés/non déclenchés
- `INTERNAL_SECRET` → `/api/push/notify` + `/api/newsletter/send` (endpoints externes) fail-closed
- `SHORT_DOMAIN` (`https://inreal.me`, indispensable pour le test terrain) → sinon les QR utilisent `${APP_URL}/r/<code>`, lisibles de moins loin. Le domaine doit être ajouté au même projet Vercel **sans redirection** vers le domaine principal : `src/proxy.ts` réécrit `inreal.me/<code>` vers `/r/<code>` et renvoie le reste vers le site. À renseigner avant toute impression : le QR garde l'adresse du moment

---

## 2bis. CSP à nonce — ENFORCE (Phase 2 livrée)

**État actuel (enforçant, commits `a58d71d` Phase 1 + Phase 2)** : une seule CSP,
posée par `src/proxy.ts` (ex-`middleware.ts`), **enforçante** : `script-src 'self' 'nonce-…'
'strict-dynamic'` (sans `'unsafe-inline'` effectif — il reste en fallback legacy,
ignoré par les navigateurs CSP3). `next.config.mjs` **ne pose plus** de CSP.

**Vérification faite avant bascule** (dev + headless Playwright sur les 10 routes
publiques, en Report-Only PUIS en enforce) : **0 violation `script-src`**, 0 style,
0 autre ; hydratation OK. Balayage statique : seuls 2 scripts inline (thème + JSON-LD),
tous deux noncés ; aucun `eval`/`new Function`/injection DOM.

**⚠️ Résidu à surveiller en prod réelle** : PostHog et Sentry ne se chargent pas en
dev (pas de clés) → leur injection de scripts tiers n'a pas été exercée localement.
`'strict-dynamic'` est censé les couvrir (scripts injectés par le bundle noncé =
confiance transitive), et une violation y serait **non bloquante pour l'utilisateur**
(analytics/erreurs only). Après déploiement, ouvrir la console sur une page авec
consentement accepté et confirmer l'absence de `Refused to load the script ...posthog...`.

**Revenir en observation si un script casse en prod** (rollback doux, sans tout
annuler) :
1. `proxy.ts` : header réponse `Content-Security-Policy` → `Content-Security-Policy-Report-Only`.
   (Le header de requête `Content-Security-Policy`, lu par Next pour noncer, reste tel quel.)
2. Optionnel : remettre une CSP enforçante permissive dans `next.config.mjs` le temps de corriger.
3. Pour collecter les rapports en central plutôt qu'à la console : ajouter `report-to`/
   `report-uri` au header CSP dans `proxy.ts` + un endpoint qui lit les POST.

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
| **Abonnement — downgrade** | `stripe trigger customer.subscription.deleted` | membre repasse `plan='free'` (vérifie qu'aucune erreur n'est loggée — bug C1) + email « votre abonnement premium a pris fin » |
| **Abonnement — souscription** | passer premium depuis Réglages (CGV cochées), carte de test | retour sur le tableau de bord en premium (attente de quelques secondes au plus), email de bienvenue avec prix, résiliation et rétractation ; métadonnée `termsAcceptedAt` sur l'abonnement |
| **Abonnement — résiliation** | portail → « Annuler l'abonnement » | Réglages : « Résiliation enregistrée : … jusqu'au <date> » ; email de confirmation avec la même date, une seule fois |
| **Abonnement — suppression du compte** | membre premium supprime son compte | abonnement annulé chez Stripe, email « abonnement résilié » ; si Stripe est injoignable : `502`, compte intact |
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
| **Cron fulfillment-reconcile** | order `paid` + membre + `printful_order_id` NULL → `curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/fulfillment-reconcile` ; puis sans header | 1er : `{fulfilled:≥1}` + commande Printful créée (confirmée en paiement réel, en brouillon en test) ; sans header : `403` |
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
- 5 crons Vercel actifs : cleanup (dim 3h), scan-reminders (quotidien 9h), premium-reconcile (quotidien 4h), fulfillment-reconcile (quotidien 5h — plan Hobby : crons quotidiens uniquement), activation-reminder (quotidien 10h — relance les comptes sans profil ET les commandes payées jamais activées, J+2/J+7).

## 5. À COMPLÉTER avant prod — légal (données entreprise, hors code)
Placeholders `[À COMPLÉTER]` à remplir (ne peuvent pas être devinés) :
- `src/app/mentions-legales/page.tsx` : raison sociale + forme juridique, SIRET, siège, RCS, TVA intra, téléphone, directeur de publication, **médiateur de la consommation** (nom + URL).
- `src/app/confidentialite/page.tsx` : identité du responsable de traitement + **contact DPO**.
- Faire **valider par un juriste** la conformité RGPD/CGV finale.
- DNS email : **SPF / DKIM / DMARC** (cf. `docs/EMAIL_DELIVERABILITY.md`).

## 6. Différés assumés (notés, non bloquants)
- **Consentement analytics serveur** : ✅ réglé le 2026-10-24. Plus aucun événement ne part du serveur vers PostHog (`posthog-node` retiré) ; la rétention se lit dans `/admin`, depuis la base (`docs/RETENTION.md`, section 8).
- **Newsletter** : ✅ envoi IMPLÉMENTÉ (`POST /api/newsletter/send`, protégé `INTERNAL_SECRET`). Audience = consentis (newsletter `unsubscribed_at IS NULL` ∪ `members.marketing_consent=true`) moins tout opt-out ; lien `signUnsubscribe` + headers `List-Unsubscribe`/`-Post` (one-click) par destinataire ; idempotence via `newsletter_campaigns.key` ; `dryRun` pour prévisualiser l'audience. Usage : `curl -X POST $URL/api/newsletter/send -H "x-internal-secret: $INTERNAL_SECRET" -H 'content-type: application/json' -d '{"key":"2026-07-drop","subject":"…","html":"…","dryRun":true}'` (retirer `dryRun` pour envoyer). ⚠️ Toujours faire un `dryRun` d'abord pour vérifier la taille d'audience.
- **`marketing_consent`** : collecté/audité mais jamais lu (aucun envoi marketing aujourd'hui). À filtrer (`= true`) quand un envoi existera. (scan-reminder = transactionnel, lié à l'achat.)
- **RLS `members` allowlist** : `members_select_public USING(true)` expose encore les colonnes *non sensibles* de tous les membres (les sensibles sont revoke en 026/030). Refonte allowlist reportée.
