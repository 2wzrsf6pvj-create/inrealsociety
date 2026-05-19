# Monitoring — uptime, errors, alertes

## Stack actuelle

| Domaine | Outil | État |
|---|---|---|
| Erreurs runtime | Sentry | ✅ configuré (instrumentation.ts, sentry.*.config.ts) |
| Analytics produit | PostHog | ✅ configuré (consent-gated) |
| Performance traces | Sentry + PostHog | ✅ tracesSampleRate 10 % en prod |
| **Uptime externe** | _à configurer_ | ⚠️ Sentry détecte les erreurs, pas la dispo |
| **Alertes Sentry** | _à router_ | ⚠️ Erreurs vues seulement en checkant le dashboard |

---

## 1. Uptime monitoring (UptimeRobot ou BetterStack)

Le projet expose `GET /api/health` qui retourne :
```json
{
  "ok": true,
  "checks": { "app": "ok", "supabase": "ok" },
  "uptimeMs": 123456,
  "timestamp": "2026-05-19T..."
}
```
Status 200 si tout est OK, 503 si Supabase down.

### Setup UptimeRobot (gratuit, 50 monitors)

1. Compte sur [uptimerobot.com](https://uptimerobot.com)
2. New monitor → **HTTP(s)**
3. URL : `https://inrealsociety.com/api/health`
4. Interval : 5 min (free) ou 1 min (paid)
5. Alert contacts : email + Slack/Discord webhook
6. Optionnel : monitor secondaire sur `https://inrealsociety.com/` (homepage) pour catcher le cas où l'app boot mais Supabase est down (status 503)

### Setup BetterStack (plus avancé)

Free tier : 10 monitors, 30s interval, incidents tracking, status page publique.
- [betterstack.com/uptime](https://betterstack.com/uptime)
- Même URL `/api/health`
- Activer la status page publique sur `status.inrealsociety.com` (sous-domaine CNAME)

---

## 2. Alertes Sentry → Slack/Discord

Par défaut, Sentry envoie un email à chaque issue. Pour router vers Slack/Discord :

### Slack
1. Dashboard Sentry → Settings → Integrations → Slack → "Add to Slack"
2. Choisir le channel (ex. `#alertes-prod`)
3. Créer une **Alert Rule** :
   - Settings → Alerts → Create Alert
   - **When** : "A new issue is created"
   - **If** : `level:error` AND `environment:production`
   - **Then** : Send a Slack notification to `#alertes-prod`
4. Filtres conseillés pour ne pas spammer :
   - Ignore `ZodError` (déjà géré côté API)
   - Ignore `AbortError` (timeouts client normaux)
   - Ignore les 4xx (déjà dans `ignoreErrors` de sentry.server.config.ts)

### Discord
- Créer un webhook Discord (Server Settings → Integrations → Webhooks)
- Sentry → Settings → Integrations → Webhooks → ajouter l'URL Discord
- Alert Rule similaire que Slack

### Alertes recommandées spécifiques au projet

| Trigger | Action |
|---|---|
| `order.email_failed` (audit_logs) ≥ 1 en 1h | Slack — un client n'a pas reçu son code |
| `order.fulfillment_failed` ≥ 1 en 1h | Slack — un t-shirt ne sera pas imprimé |
| `subscription.payment_failed` ≥ 5 en 24h | Slack — pic anormal de cartes refusées |
| Sentry P95 transaction > 3s | Slack — performance dégradée |
| Lighthouse score (CI) < 80 | PR commenter |

Ces audit_logs alerts nécessitent un job/cron qui interroge `audit_logs` et envoie sur Slack — pas implémenté côté code. **Action manuelle** : créer une vue Supabase et un Slack alert via Supabase Realtime / Postgres trigger.

---

## 3. Health dashboard interne

Pour un coup d'œil rapide :
- **Sentry** → Issues + Performance tabs
- **PostHog** → Live events + Funnel "scan → upgrade"
- **Supabase** → Reports → Database performance + Auth
- **Stripe** → Payments + Subscriptions failed
- **Resend** → Logs (bounces, complaints)
- **Vercel** → Analytics + Logs

À terme, un dashboard unifié via Grafana ou Outerbase serait pertinent — pas urgent.

---

## 4. Page de statut publique (optionnelle)

Si tu veux montrer la dispo au public :
- BetterStack offre une status page gratuite sur sous-domaine
- Cachet.io alternative open-source self-hostable
- Ou intégrer un widget sur `inrealsociety.com/status` (composant client qui ping `/api/health`)

Pas critique tant que le service est stable.
