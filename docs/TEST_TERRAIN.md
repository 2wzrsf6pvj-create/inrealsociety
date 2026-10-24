# Test terrain : 10 porteurs, 4 semaines

> Ce que le test doit dire, comment le préparer, quoi regarder chaque semaine
> et comment décider ensuite. Choix de Clément (24 octobre 2026) : 10
> porteurs, 4 semaines, t-shirts achetés par lui sur la boutique. Les seuils de
> la section 6 sont des propositions : les ajuster avant J0, pas après.

## 1. Ce que le test doit dire

1. **Le t-shirt est-il porté, et scanné ?** Sans scan, rien d'autre n'arrive.
2. **Un scan donne-t-il envie d'écrire ?** (scans → messages)
3. **Les porteurs répondent-ils ?** (messages → réponses)
4. **L'envie de le porter tient-elle ?** Comparer la semaine 4 à la semaine 1.
5. **Est-ce sûr ?** Signalements, blocages, et ce que disent les testeurs.
6. **Des conversations mènent-elles à une rencontre ?** L'app ne le voit pas :
   seul le questionnaire de fin le dit.

En plus : les notifications arrivent-elles (sur iPhone, seulement avec l'app
installée) ? Les testeurs paieraient-ils ?

Quatre semaines répondent à l'hypothèse (a) de `RETENTION.md` (section 7) :
« ils arrêtent de porter ». L'hypothèse (b), « ils résilient le premium »,
demande plusieurs mois d'abonnement.

## 2. Qui

- 10 porteurs de 18 ans ou plus (CGV), au cœur de la cible : 24-32 ans, en
  ville, ouverts aux rencontres, à l'aise pour être abordés
  (`POSITIONING.md`).
- Un mélange de genres, et au moins 3 sur iPhone et 3 sur Android : les
  notifications n'y passent pas de la même façon.
- Des gens qui sortent au moins trois fois par semaine : cafés, bars,
  transports, marchés, expositions, sport.
- De préférence pas seulement des proches : leurs retours seraient trop
  gentils. Des amis d'amis conviennent.

## 3. Avant J0

### J-14 : commander et vérifier

- [ ] Recette complète (`MISE_EN_PRODUCTION.md`, section 7), paiements réels
      activés : `/admin` → « Configuration » dit « Paiements : réels », et
      rien à régler.
- [ ] Commander les 10 t-shirts sur la boutique, **une commande par
      t-shirt** (taille et couleur de chaque testeur), livrés chez toi ou chez
      le testeur. Chaque commande t'envoie un code d'activation : les garder,
      un par testeur. Coût réel ≈ 28 € par t-shirt (impression et livraison
      Printful, frais Stripe), puisque le paiement te revient : ≈ 280 € pour
      10. Impression puis livraison : compter jusqu'à 10 jours.
- [ ] Le lendemain, `/admin` → « Commandes à surveiller » : aucune commande
      payée mais pas envoyée à l'impression. Dans Printful → *Orders*, les 10
      sont confirmées, aucune en brouillon.
- [ ] `ADMIN_ALERT_EMAIL` sur une boîte lue chaque jour, avec les
      notifications du téléphone : les signalements arrivent là.
- [ ] Préparer le questionnaire de fin (section 7) : formulaire en ligne, ou
      de vive voix pendant l'entretien.

### J0 : remise des t-shirts (15 minutes par testeur, ou en groupe)

- [ ] Activer le profil avec le code (case 18 ans comprise) : prénom, une
      présentation qui donne envie d'aborder, photo facultative.
- [ ] Notifications : sur iPhone, installer l'app sur l'écran d'accueil (« Mon
      espace » montre comment) puis les activer ; sur Android, les activer.
      Sans elles, un message n'est vu qu'en ouvrant le site.
- [ ] Pour voir ce que voit un passant : « Aperçu » dans « Mon espace ». Ne
      pas faire scanner le QR par un ami pour essayer : ça compte comme un
      vrai scan.
- [ ] Les consignes :
  - porter le t-shirt au moins trois fois par semaine, dans des lieux
    fréquentés ;
  - répondre aux messages : chacun son tour, un message à la fois ;
  - un retour à chaud, un souci : « Votre avis », dans les réglages de « Mon
    espace ».
- [ ] La sécurité :
  - un message gênant : « Signaler » dans l'onglet « Messages », puis
    « Bloquer cette personne » dans la conversation, et te prévenir ;
  - besoin de souffler : mettre le profil en pause dans les réglages ;
  - un danger : 17 ou 112, sans attendre.
- [ ] Ce que tu vois, et leur accord : leurs chiffres dans `/admin` (scans,
      messages, réponses, notifications), jamais le contenu de leurs
      messages, sauf un message signalé. Un point rapide chaque semaine, un
      entretien de 15 minutes à la fin.

## 4. Pendant le test

**Chaque jour (5 minutes)** : `/admin` → « À traiter » (signalements, photos),
et la boîte `ADMIN_ALERT_EMAIL`. Délais : `MODERATION.md`, section 2 (24
heures pour un cas grave, sans attendre en cas d'urgence).

**Chaque semaine (20 minutes, à J7, J14, J21 et J28)** :

- `/admin` → « Semaine par semaine » : porteurs scannés, scans, messages,
  réponses. La page garde 8 semaines : tout le test reste visible jusqu'à
  environ un mois après J28. Une capture d'écran à J28 suffit pour garder une
  trace.
- `/admin` → « Suivi des porteurs » : « Aucun scan depuis 7 jours » repère qui
  a décroché. Lui écrire pour comprendre (oubli, gêne, pas sorti), pas pour
  relancer à tout prix.
- `/admin` → « Avis ».
- Un message à chaque testeur, deux questions : combien de fois l'as-tu
  porté cette semaine ? Une anecdote ?

**J14** : premier relevé de « Scannés dans leurs 14 premiers jours ».

**J28** : questionnaire, entretiens, décision.

## 5. Les chiffres, et où les lire

| Question | Chiffre | Dans `/admin` |
|---|---|---|
| Porté et scanné | porteurs scannés dans leurs 14 premiers jours | Chiffres, à partir de J14 |
| Un scan fait écrire | messages ÷ scans | Chiffres (30 jours) ; Semaine par semaine |
| Les porteurs répondent | conversations avec réponse ÷ messages | Chiffres ; Semaine par semaine |
| L'envie tient | porteurs scannés en semaine 4, et en semaine 1 | Semaine par semaine |
| Qui a décroché | aucun scan depuis 7 jours | Suivi des porteurs |
| Notifications | porteurs prévenus ; iPhone : app installée | Chiffres → Notifications |
| Sécurité | signalements, blocages, bannissements | À traiter ; Mesures en cours |
| Ressenti, rencontres, prix | — | questionnaire et entretiens |

Tous ces chiffres viennent de la base : ils ne dépendent pas du consentement
aux mesures d'audience. PostHog ne compte que les visiteurs qui l'ont accepté
(par exemple les achats venus d'un scan, `wearer_cta_clicked`).

## 6. Seuils, à J28

| Question | Continuer | Ajuster | Arrêter ou repenser |
|---|---|---|---|
| Scannés dans leurs 14 premiers jours | 7 sur 10 ou plus | 4 à 6 | 3 ou moins |
| Messages ÷ scans, sur les 4 semaines | 20 % ou plus | 10 à 19 % | moins de 10 % |
| Conversations avec réponse ÷ messages | 60 % ou plus | 30 à 59 % | moins de 30 % |
| Porteurs scannés en semaine 4 | 5 sur 10 ou plus | 3 ou 4 | 2 ou moins |
| Échanges continués hors de l'app (questionnaire) | 3 porteurs ou plus | 1 ou 2 | aucun |
| Sécurité | aucun incident grave | un incident grave, maîtrisé | un incident grave non maîtrisé : arrêt immédiat |

- **Continuer**, en ouvrant à plus de porteurs : tout en « Continuer », ou une
  seule ligne en « Ajuster ».
- **Ajuster**, puis refaire 4 semaines : au moins deux lignes en « Ajuster »,
  aucune en « Arrêter ».
- **Arrêter ou repenser** : une ligne en « Arrêter », ou la sécurité.

Avec 10 porteurs, une personne pèse 10 points : lire chaque chiffre avec ce
qu'en disent les testeurs. Une piste selon ce qui coince : premier scan bas,
le t-shirt ne se voit pas ou ne se porte pas (design, taille, où le
porter) ; messages bas, la page du profil ou la page d'envoi ; réponses
basses, les notifications ou les messages reçus ; semaine 4 basse, l'envie
s'essouffle (`RETENTION.md`, pari P1).

## 7. Questionnaire de fin (10 minutes), puis entretien (15 minutes)

1. Combien de fois par semaine as-tu porté le t-shirt ? Où ?
2. Combien de personnes sont venues te parler, avec ou sans scanner ?
3. As-tu reçu les notifications des messages ? (oui, parfois, non)
4. Combien de conversations ? L'une d'elles a-t-elle continué hors de l'app
   (Instagram, rendez-vous, rencontre) ?
5. Te sentais-tu en sécurité en le portant ? Un message était-il gênant ?
6. Qu'est-ce qui t'a donné envie, ou pas, de le porter ?
7. Le porteras-tu encore le mois prochain ? (oui, peut-être, non)
8. De 0 à 10, le recommanderais-tu à quelqu'un de ton entourage ?
9. L'aurais-tu acheté 54 €, livraison comprise ? Prendrais-tu le premium à
   2,99 € par mois, et pour quoi ?
10. Qu'est-ce qui t'a manqué ou gêné dans l'app ?

Pendant l'entretien, demander une histoire précise : le scan ou la
conversation la plus marquante.

## 8. Après le test

- Remplir le tableau des seuils ; garder trois citations par question.
- Décider, et noter la décision dans `docs/JOURNAL.md`.
- Dire aux testeurs ce qui change. Ils gardent leur t-shirt et leur profil.
