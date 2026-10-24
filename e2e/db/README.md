# E2E avec base

Les tests de `e2e/db/` parcourent l'app dans un vrai navigateur, devant une
**vraie base**, avec plusieurs personnes chacune dans son navigateur :

- `parcours.spec.ts` : le passant scanne le QR et écrit, le porteur répond
  depuis « Mon espace », chacun son tour ; un profil signalé puis suspendu
  depuis /admin ; un message signalé, l'appareil banni ;
- `notifications.spec.ts` : téléphone relevé à l'ouverture de « Mon espace »,
  chiffres de /admin, désabonnement à la déconnexion ;
- `accessibilite.spec.ts` : axe-core sur les écrans du passant (aussi en plein
  soleil), du porteur et de /admin, sans aucun écart WCAG 2.2 A/AA ni aux
  bonnes pratiques ; puis le clavier et les lecteurs d'écran : fenêtres
  (présentation de « Mon espace », guide des tailles), focus après l'envoi
  d'un message, contour de focus en plein soleil ;
- `reseau.spec.ts` : réseau faible. Hors ligne, le message est gardé et part
  au retour du réseau ; la réponse à un envoi se perd alors que le serveur l'a
  reçu : le nouvel essai ne crée pas de doublon, ni dans la conversation ; le
  texte tapé survit au rechargement ; une coupure à la connexion n'est pas
  « Email ou mot de passe incorrect » ;
- `test-terrain.spec.ts` : ce que l'équipe suit dans `/admin` pendant le test
  terrain. « Votre avis », écrit depuis « Mon espace », arrive avec le prénom
  du porteur connecté ; sa fiche de suivi donne ses chiffres, jamais le
  contenu des messages ; « Semaine par semaine » compte la semaine en cours.

Les tests de fumée de `e2e/` (`npm run test:e2e`), eux, tournent sans base et ne
voient que les pages publiques.

| Réel | Simulé |
|---|---|
| L'app construite comme en production (`next build`, `next start`) | La session Supabase : cookie posé par le test, jeton signé avec le secret de la base de test |
| Chromium complet (`channel: 'chromium'`), et non sa version allégée, qui plantait parfois en CI | Pas de service worker (bloqué) : il préchargeait des pages pendant la fermeture des contextes ; il a ses propres tests |
| Chromium (Playwright), un contexte par personne : le passant n'est jamais connecté, son appareil se reconnaît à son cookie | Le service de push du navigateur (absent du Chromium de test), quand un test en a besoin |
| Postgres + PostgREST, migrations du dépôt (`integration/setup-db.sh`) | Les limites de débit (Upstash) : elles laissent tout passer |
| Les routes, la modération sans clé OpenAI (liste de mots), les décisions de /admin | Les emails (Resend) : gardés par la passerelle, jamais envoyés ; les tests les lisent (`emailsTo`) |
| Le serveur qui reçoit et enregistre un envoi dont la réponse se perd | Le réseau du téléphone : coupé (`setOffline`), ou réponse interrompue en route (la requête part du test, le navigateur ne voit qu'une coupure) |

`supabase-gateway.mjs` se fait passer pour Supabase devant la base :
`/rest/v1` → PostgREST, `/auth/v1/user` → l'utilisateur du jeton, `/upstash` →
limites ouvertes, `/resend/emails` → emails gardés. La CSP de production
n'autorise pas cette adresse locale : les tests la contournent (`bypassCSP`).

Pas de temps réel (Supabase Realtime) : une page voit les nouveaux messages
en se rechargeant, comme un passant qui revient sur sa conversation.

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
