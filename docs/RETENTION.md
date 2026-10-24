# Rétention — note de cadrage

> Roadmap produit #4. Cadrage (pas du code) : diagnostic, ce qu'on a déjà, paris
> rangés par ROI, séquence recommandée. À arbitrer par Clément.

## 1. Diagnostic

Le QR shirt génère une forte **semaine 1** (nouveauté : on scanne, des signaux
arrivent) puis le vide entre deux scans. Mais derrière « la rétention » il y a
**deux problèmes distincts**, souvent confondus :

- **Rétention PORTEUR** — continuer à *porter* le t-shirt → continuer à générer
  des scans. Le shirt est le moteur ; s'il reste au placard, toute la boucle
  meurt. C'est le problème **existentiel**.
- **Rétention ABONNÉ (premium)** — la valeur premium est mince (48 h vs 24 h,
  convos illimitées, graphe de scans) → facile à annuler une fois la nouveauté
  retombée.

**Reframe clé : c'est un OBJET IRL, pas une app.** La rétention n'est pas
« ouvrir l'app tous les jours » — c'est « continuer à porter + tirer assez de
valeur de chaque scan pour vouloir recommencer ». Toute mécanique qui tente d'en
faire une app à engagement quotidien combat la nature du produit (et la
philosophie IRL assumée — la communauté digitale a été volontairement écartée).

## 2. Le vrai blocage immédiat : on ne MESURE pas la rétention

`src/lib/analytics-events.ts` couvre acquisition (scanner) + conversion premium,
mais **quasi rien sur la rétention** : pas de cohortes de retour (J1/J7/J30), pas
de cadence de scan par membre, pas de funnel notif → ouverture → clic, pas de
tenure d'abonnement. → **La courbe de rétention est invisible aujourd'hui.**
C'est le levier n°1 : instrumenter AVANT de construire, sinon on parie à l'aveugle.

## 3. Actifs déjà en place à exploiter

- **Scans + géoloc** (location quartier/ville, lat/long arrondies, `scanned_at`,
  `first_scans`) — un actif personnel qui grandit, aujourd'hui sous-exploité.
- **Push** (member-level + thread) + emails transactionnels + **cron**
  (`scan-reminders`) — l'infra de ré-engagement existe déjà.
- **Graphe de scans premium** (`getScansByDay`).
- **PostHog** (navigateur, avec consentement) ; les chiffres de `/admin`, depuis la base.
- **Newsletter** (envoi désormais implémenté) — canal de ré-engagement de masse.

## 4. Paris de rétention (rangés par ROI / fit IRL)

| Pari | Idée | Valeur | Effort | Fit IRL |
|---|---|---|---|---|
| **P0 — Instrumenter** | Events de rétention : retour J1/J7/J30, cadence scan/membre, notif→open→clic, tenure premium + cohortes PostHog | 🔴 prérequis | faible | — |
| **P1 — Recap & carte perso** | « Où/quand on t'a remarqué » : timeline + carte des scans (la géo existe déjà). Artefact qui grandit avec le temps. | haute | moyen | ✅✅ |
| **P2 — Digest hebdo** | Étendre `scan-reminders` en récap hebdo des membres ACTIFS (push+email) : scans de la semaine, signaux non lus, ton spot. | moyenne | faible | ✅ |
| **P3 — Statut / progression** | Paliers de scans, badge, `scan_count` public (preuve sociale → vouloir plus de scans → porter plus). | moyenne | moyen | ✅ (risque vanité) |
| **P4 — Premium qui retient** | Réserver carte/historique/analytics au premium → la valeur premium devient un **actif cumulatif** (grandit avec le temps), pas un gadget 48 h. | haute (anti-churn abo) | moyen | ✅ |
| **P5 — Drops / designs** | = roadmap #5. Nouveau design = raison de revenir + re-acheter. Plafond max, effort max (ops/catalogue). | haute | élevé | ✅ |

## 5. Séquence recommandée

1. **P0 d'abord** (~1-2 j) — sans la courbe réelle, tout le reste est aveugle.
2. **P1 + P4 ensemble** — la carte/recap perso EST la valeur premium cumulative.
   D'une pierre deux coups : rétention porteur (artefact qui grandit) + rétention
   abonné (premium qui s'enrichit avec le temps au lieu d'un gadget). **Le cœur.**
3. **P2** en support (déclencheur de retour, peu cher) — surveiller la fatigue
   notif (mesurée par P0).
4. **P3 / P5** seulement si P0 montre que « plus de scans » ou « nouveauté » est
   bien ce qui retient.

## 6. Le piège à éviter

Ne pas transformer IRS en app à engagement quotidien (notifs agressives, streaks,
feed). Ça trahit l'objet IRL et accélère la fatigue. La rétention vient de **la
valeur cumulée de l'objet physique + de son reflet digital**, pas du temps d'écran.

## 7. Décision à prendre

Hypothèse de churn dominante ?
- **(a)** ils arrêtent de PORTER → raviver le geste : P1 (artefact), P3 (statut),
  recap.
- **(b)** ils portent mais annulent le PREMIUM → P4 (valeur cumulative).

P0 tranchera avec la data, mais l'intuition terrain de Clément compte pour
amorcer.

---

## 8. P0 — Mesure (mise à jour du 24 octobre 2026)

### Dans `/admin`, depuis la base
Les quatre événements que le serveur envoyait à PostHog (`member_scanned`,
`member_signal_received`, `subscription_active`, `subscription_cancelled`)
sont retirés : ils partaient avec l'identifiant du porteur sans son
consentement, alors que la politique de confidentialité fonde la mesure
d'audience sur le consentement. La base a les mêmes informations :
- **Semaine par semaine** (8 semaines, heure de Paris) : porteurs scannés,
  scans, messages, réponses. C'est la courbe de rétention porteur : « est-il
  encore scanné N semaines après ? ».
- **Suivi des porteurs** : pour chaque porteur activé ces 60 derniers jours,
  scans (dont ces 7 derniers jours), dernier scan, messages, réponses,
  notifications. Chiffres seulement, jamais le contenu.
- **Chiffres** : scannés dans leurs 14 premiers jours, encore scannés après
  un mois, premium.
- Durée des abonnements premium : dans Stripe (abonnements, résiliations).

### Dans PostHog, avec consentement seulement
Ces courbes ne voient que les visiteurs qui ont accepté les mesures :
- retour sur « Mon espace » : Insight ▸ Retention, `member_dashboard_viewed`
  au départ et au retour ;
- conversion premium : `upgrade_cta_viewed` → `upgrade_clicked` ;
- achats venus d'un scan : `wearer_cta_viewed` → `wearer_cta_clicked`.

### P0b — notification → clic
Pas pour le test terrain : avec 10 porteurs, le questionnaire et les chiffres
de notifications de `/admin` suffisent (`TEST_TERRAIN.md`). Plus tard, si
besoin : compter les clics en base, sans identifiant (`?src=email|push` et
le type de notification dans l'adresse), plutôt que dans PostHog.
