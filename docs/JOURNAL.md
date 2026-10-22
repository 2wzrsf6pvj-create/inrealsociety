# Journal de bord

> Trace des chantiers menés sur le projet : ce qui a été fait, pourquoi, ce qui
> reste à faire et les décisions en attente. Entrée la plus récente en haut.

---

## 2026-10-22 — Audit sécurité de la base + PR #1

### Contexte
1. **Analyse de bout en bout du projet** (stack, parcours achat → paiement →
   impression → activation → scan → message → conversation, crons, docs).
   État de santé au départ : `tsc` OK, 408 tests vitest OK, 1 erreur eslint.
2. **Domaine creusé : accès aux données** (RLS, fonctions SQL, routes API).
   Choisi parce qu'un défaut y coûte le plus (fuite d'emails, usurpation de
   porteur, harcèlement) et que les tests unitaires ne tournent pas contre une
   vraie base.

### Méthode
Les 52 migrations ont été appliquées sur un Postgres 16 local imitant Supabase
(rôles `anon` / `authenticated` / `service_role`, default privileges du schéma
`public`, schémas `auth` et `storage`). Les attaques ont été rejouées en se
faisant passer pour un utilisateur connecté (ce que fait PostgREST avec le JWT).

### Constats
| Gravité | Constat |
|---|---|
| 🔴 | 4 fonctions `SECURITY DEFINER` exécutables par tout utilisateur connecté (un signup suffit) : les `REVOKE` visaient `anon, public`, jamais `authenticated`, qui reçoit `EXECUTE` nominativement sous Supabase. |
| 🔴 | → `accounts_pending_profile()` : lecture des emails d'autres clients. |
| 🔴 | → `create_member_with_code()` : `short_code` et email arbitraires, donc vol du QR déjà imprimé d'un autre acheteur (son activation échoue ensuite). |
| 🟠 | → `record_scan()` : scans forgés sans limite ; `cleanup_old_data()` : purge à la demande. |
| 🟠 | `scripts/fresh-setup.sql` arrêté à 048 (sans le correctif 052 ni les colonnes 049/050 du checkout). |
| 🟡 | Un porteur pouvait réécrire les messages des scanneurs (`messages_update_own`). |
| 🟡 | Uploads Storage directs possibles, contournant `/api/member/avatar`. |
| ⚪ | `orders_select_own` cassée depuis 042 (toujours `permission denied`). |

Ce qui tient : tables sensibles fermées à `anon`, emails masqués par colonne
(042), contrôle de propriété sur les 11 routes API authentifiées, modèle
« lien-capability » des conversations cohérent, push protégé (SSRF, hijack).

### Fait — PR #1 (`fix/rls-definer-rpcs-authenticated`)
- Migration `053_close_definer_rpcs_to_authenticated.sql` (révocations, default
  privileges fail-safe, `messages` sans écriture client, `orders_select_own` et
  uploads Storage directs retirés).
- `scripts/build-fresh-setup.mjs` + `fresh-setup.sql` régénéré (53 migrations)
  + test `fresh-setup-sync.test.ts` contre toute nouvelle désynchronisation.
- `scripts/verify-migrations.sql` contrôle aussi `authenticated`.
- `docs/DEPLOY_CHECKLIST.md` à jour (049 → 053).
- Validé : migrations une par une et bundle d'un bloc donnent le même schéma ;
  exploits refusés ; flux backend, lecture publique et `get_own_member` OK.
  410 tests passent.
- PR suivie (CI, revues, conflits) par Claude jusqu'au merge.

### À faire — côté Clément (production)
- [ ] Vérifier l'exposition : `select has_function_privilege('authenticated', 'accounts_pending_profile()', 'EXECUTE');`
- [ ] Vérifier que 049 → 052 sont appliquées, puis appliquer **053** sans attendre le merge.
- [ ] Lancer `scripts/verify-migrations.sql`.
- [ ] Chercher dans les logs API Supabase des appels à `/rest/v1/rpc/accounts_pending_profile`, `create_member_with_code`, `record_scan` (tout appel avec un JWT utilisateur est suspect → évaluer une notification CNIL, 72 h).

### Décisions en attente
- **Plafond de 3 conversations (gratuit)** : le code compte tous les messages
  reçus depuis toujours, alors que la FAQ annonce « 3 en simultané ». Paywall
  voulu (corriger la FAQ) ou vraie notion de conversation active ?
- **`safeName` inutilisé** dans l'email de nouveau scan
  (`src/lib/email-templates.ts:135`) : prénom du porteur censé apparaître ?
- **Remboursement d'un code déjà utilisé** : le profil reste actif
  (`handleChargeRefunded`). Décision business à arbitrer.

### Autres écarts relevés (non traités)
- Commentaires périmés : en-têtes de `api/shop/checkout` et `lib/fulfillment.ts`
  (« QR généré à l'activation » → désormais au paiement).
- Gelato : suivi et annulation encore spécifiques à Printful.
- Pages `/demo-message` et `/demo-notif` encore publiques (« à retirer »).
- Avant lancement : mentions légales (SIRET, médiateur), DNS email
  (SPF/DKIM/DMARC), test E2E du tunnel d'achat avec Stripe en mode test.
