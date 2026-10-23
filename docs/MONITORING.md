# Surveillance : erreurs, alertes, disponibilité

Les logs Vercel ne sont gardés qu'une heure (offre Hobby) ou un jour (Pro) :
Sentry sert de mémoire et d'alarme, l'email `ADMIN_ALERT_EMAIL` d'alarme
directe pour ce qui touche l'argent, un moniteur externe de témoin de
disponibilité.

## 1. Ce qui part où

| Événement | Sentry | Email à `ADMIN_ALERT_EMAIL` |
|---|---|---|
| Erreur non rattrapée (route, page) | oui (`onRequestError`) | non |
| Erreur rattrapée : route qui répond 500, échec dans une tâche planifiée | oui, `reportError`, tag `scope` | non |
| Échec qui touche l'argent (section 2) | oui, tag `alerte=argent` | **oui, à chaque occurrence** |
| Autre échec tracé dans l'audit (`*_failed`) | oui | non |
| Refus de Resend (quota, débit, domaine, adresse) | oui, un problème par raison (`Resend : <raison>`) | non |
| Tâche `fulfillment-reconcile` absente ou en échec | oui, Sentry Crons | non |
| Message ou profil signalé | non | oui |
| Supabase ou Upstash injoignable | non | non : `/api/health` répond 503 au moniteur externe |

Aucune donnée personnelle ne part vers Sentry (ni email, ni IP, ni contenu).
L'email d'alerte, interne, garde ce qui sert à agir (email de l'acheteur par
exemple).

## 2. Les échecs qui touchent l'argent

Définis dans `src/lib/audit.ts` (`MONEY_ALERTS`), chacun avec la marche à
suivre, reprise dans l'email :

| Action d'audit | Ce qui s'est passé |
|---|---|
| `order.payment_unmatched` | Paiement reçu, aucune commande correspondante |
| `order.email_missing` | Commande payée sans email : code non envoyé |
| `order.email_failed` | Code d'activation non envoyé |
| `order.fulfillment_failed` | T-shirt payé non transmis à Printful (nouvel essai chaque jour à 5 h UTC) |
| `member.suspension_failed` | Remboursement : profil non suspendu |
| `webhook.failed` | Webhook Stripe en échec (Stripe réessaie pendant 3 jours) |

Une erreur de base pendant le traitement d'un paiement répond 500 : Stripe
réessaie, au lieu de croire l'événement traité.

## 3. Réglages

1. **Sentry** : `NEXT_PUBLIC_SENTRY_DSN` sur Vercel. Les événements portent
   l'environnement Vercel (`production`, `preview`, `development`) : filtrer
   les alertes sur `production`.
2. **Alerte « argent » dans Sentry** (en plus de l'email) : une règle d'alerte
   sur les événements au tag `alerte` = `argent`, en `production`, avec la
   condition de fréquence la plus basse proposée, pour être prévenu à chaque
   occurrence. Par défaut, Sentry ne prévient qu'à l'apparition d'un nouveau
   problème.
3. **Sentry Crons** : le moniteur `fulfillment-reconcile` se crée au premier
   passage de la tâche (Sentry → Crons). Vérifier qu'il prévient en cas de
   passage manqué ou en échec. Une seule tâche surveillée : c'est la limite de
   l'offre gratuite.
4. **Disponibilité** : un moniteur externe gratuit (UptimeRobot, Better Stack)
   sur `https://<domaine>/api/health`, toutes les 5 minutes. 200 attendu ; 503
   si Supabase ou Upstash ne répondent pas (sans Upstash, scanner un QR
   répond 500).
5. **`ADMIN_ALERT_EMAIL`** : une boîte réellement lue.
6. **Stripe** : en cas d'alerte `webhook.failed`, l'onglet *Failed* des
   webhooks montre les livraisons en échec. Stripe désactive un point d'accès
   qui échoue plusieurs jours de suite.
7. **Printful** : notifications du compte activées (commande en attente,
   échec de paiement Printful) : l'app ne les reçoit pas.

## 4. Coups d'œil

- **Sentry** : *Issues* (filtre `environment:production`), *Crons*.
- **Stripe** : paiements, abonnements, webhooks.
- **Resend** : *Emails* (rebonds, plaintes) ; Google Postmaster Tools pour
  Gmail (`EMAIL_DELIVERABILITY.md`).
- **Supabase** : *Reports*, table `audit_logs`.
- **Vercel** : *Logs* (courte durée), *Cron Jobs*.
