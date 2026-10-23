# Performance — Core Web Vitals + Bundle budget

## Mesurer

### 1. Bundle analyzer

```bash
npm run analyze
```

Génère 3 rapports HTML (client, edge, nodejs) qui ouvrent automatiquement dans
ton navigateur. Permet de voir **ce qui pèse vraiment** dans le bundle final.

Points à surveiller :
- `@sentry/nextjs` : ~30 KB gzipped (acceptable)
- `posthog-js` : ~50 KB gzipped (lourd mais nécessaire pour analytics)
- `@supabase/supabase-js` : ~40 KB (essentiel)
- `stripe` SDK : **ne devrait PAS être dans le client bundle** — vérifier qu'il
  reste server-only
- `web-push` : server-only également

### 2. Lighthouse (local)

Lancer le serveur en mode prod :
```bash
npm run build && npm run start
# Puis dans Chrome :
# - DevTools → Lighthouse → Mobile + Performance
# - Lance audit sur http://localhost:3000
```

Le score varie d'environ ±3 points d'un passage à l'autre : comparer des
médianes sur 5 passages par page, jamais un passage isolé. Le bridage réel
(`--throttling-method=devtools` en ligne de commande) donne des temps plus
stables que la simulation par défaut, qui est celle de PageSpeed Insights.

Repères (oct. 2026, mobile simulé, médianes de 5 passages) :

| Page | Next 14 | Next 16 |
|---|---|---|
| Accueil | 95 | 93 |
| FAQ | 96 | 91 |
| Boutique | 94 | 91 |

L'écart vient du framework : l'exécution du bundle principal (routeur de
Next 16, React 19) tient en une tâche d'environ 250 ms sur mobile simulé.

Cibles initiales (mobile, throttled 4G) :

| Métrique | Cible bonne | Cible excellente |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5 s | < 1.5 s |
| INP (Interaction to Next Paint) | < 200 ms | < 100 ms |
| CLS (Cumulative Layout Shift) | < 0.1 | < 0.05 |
| FCP (First Contentful Paint) | < 1.8 s | < 1.0 s |
| TTFB (Time to First Byte) | < 800 ms | < 400 ms |
| Performance score | > 80 | > 95 |

### 3. Lighthouse CI (à mettre en place — pas encore fait)

Ajouter dans `.github/workflows/lighthouse.yml` un job qui run Lighthouse sur
chaque PR contre une preview Vercel et compare au baseline. Cible : aucune
régression > 5 points sur le score perf.

### 4. Real User Monitoring

Deux options déjà connectées :
- **PostHog** : capture les Core Web Vitals automatiquement si le snippet a la
  fonction Web Vitals activée (à vérifier dans `PostHogProvider.tsx`)
- **Sentry Performance** : `tracesSampleRate: 0.1` en prod déjà configuré dans
  `sentry.server.config.ts` — donne les traces de chargement page sur 10 % du
  trafic

---

## Optimiser

### Quick wins déjà en place
- ✅ `next/font` pour Cormorant + Montserrat avec `display: 'swap'`
- ✅ `next/image` pour les photos de profil (lazy load + optimisation auto)
- ✅ `prefers-reduced-motion` neutralise les animations sur préférence système
- ✅ Service worker précache les pages publiques (1ère visite + 1 = instant)
- ✅ Tailwind purgé (seules les classes utilisées sont incluses)
- ✅ PostHog téléchargé seulement après consentement
- ✅ Bandeau de consentement rendu côté serveur : visible avec la page, sans
  attendre le JavaScript (boutique en 4G lente : 1,7 s au lieu de 4,4 s)
- ✅ Photo principale de la boutique préchargée, en priorité haute (`preload`
  + `fetchPriority` : `priority` est déprécié par Next 16)
- ℹ️ Pas de pré-rendu statique : le nonce CSP, différent à chaque requête,
  rend toutes les pages dynamiques

### À auditer (pistes prioritaires)
1. Essayé sans gain mesurable (5 passages), donc non retenu : charger le SDK
   Sentry après l'affichage, la build Turbopack (plus lourde), découper le
   bundle principal (`splitChunks.maxSize`), couper le fondu d'entrée des pages.
2. **next/dynamic sur AnimatedBlock** : composant utilisé en bas des pages
   manifeste, pourrait être code-split.
3. **AVIF/WebP pour les images de produits** : si tu ajoutes des photos shop
   plus tard, configurer `next.config.mjs > images.formats: ['image/avif',
   'image/webp']`.
4. **Connexion preconnect** : ajouter `<link rel="preconnect"
   href="https://fonts.googleapis.com">` et `https://<supabase-url>` au début
   du `<head>` pour gagner ~100 ms sur le first byte des assets externes.

### Métriques côté Supabase (database)
- Vérifier les requêtes lentes dans Supabase Dashboard → Logs → Query Performance
- Cibles : aucune query > 100 ms en P95
- Index manquants probables :
  - `messages(parent_id, author, moderated, created_at)` — pour la vue
    `member_inbox` LATERAL JOIN (à vérifier après backfill 025)
  - `audit_logs(member_id, created_at)` — pour les queries du support

---

## Budget perf (à enforcer)

Limite à ne pas dépasser sans justification :

| Resource | Max |
|---|---|
| First Load JS (route principale) | 190 KB gzipped (150 avec Next 14 ; Next 16 et React 19 en prennent ~140 à eux seuls) |
| Total JS sur une page | 250 KB gzipped |
| Total CSS | 30 KB gzipped |
| Total fonts | 100 KB |
| Image hero | 150 KB |

Outils pour enforcer :
- Lighthouse CI avec budget configuré dans `.lighthouserc.json`
- `next build` affiche déjà les sizes par route — surveiller à chaque PR
