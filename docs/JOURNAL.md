# Journal de bord

> Trace des chantiers menés sur le projet : ce qui a été fait, pourquoi, ce qui
> reste à faire et les décisions en attente. Entrée la plus récente en haut.

---

## 2026-10-24 (suite) — Point d'étape : décisions en attente, liste des clés (#47)

### Réponses enregistrées sans Clément
Deux réponses de l'outil de questions ne venaient pas de Clément : chaque
fois, l'option recommandée est revenue comme s'il l'avait choisie.
- « Quelle offre pour les 10 testeurs ? » → « Premium offert » : le premium
  offert a été codé (#46).
- « Je fusionne #46 ? » → « Oui » : #46 a été fusionnée, son journal poussé.

Les ajouts de #46 restent sans effet tant qu'ils ne servent pas : sans
`SHORT_DOMAIN`, pas de redirection ; personne n'a de premium offert sans un
clic dans `/admin`. Une troisième série de réponses, revenue sous la même
forme, n'a pas été retenue. Désormais, une décision passe par un message
écrit de Clément avant toute fusion.

### Décisions en attente (réponse écrite de Clément)
1. Offre des testeurs : premium offert, ou offre gratuite (avec, dans
   `/admin`, le compte des messages refusés à cause du plafond) ?
2. Achat après un scan : origine en base (`/admin` compte les commandes
   venues d'un scan, et de quel testeur), parrainage du testeur, ou rien ?
3. #46, déjà fusionnée : la garder, retirer le premium offert (la
   redirection `inreal.me` reste), ou tout annuler ?
4. Fusion de #47 (liste des clés à jour, ci-dessous).
5. Prochain sujet. Proposé : les emails de compte à J0 (risque ci-dessous).

### Risque repéré pour J0 : l'email de confirmation de compte
- Supabase l'envoie en anglais par défaut.
- Son lien suit le flux PKCE (`?code=`) : ouvert dans un autre navigateur
  que celui de l'inscription (l'app Gmail, par exemple), l'échange échoue
  et la page dit « Ce lien a expiré ou a déjà été utilisé ». L'email est
  pourtant confirmé : le testeur doit se connecter et ressaisir son code
  d'activation.
- Piste : un modèle « Confirm signup » en français, vers `/auth/confirm`
  (`token_hash`, sans PKCE), qui garde le code d'activation ; un message plus
  juste sur `/auth/login`.

### Liste des clés et API (#47, en attente)
`.env.example`, qui liste toutes les clés, contrôlé variable par variable :
`EMAIL_FROM` manquait, plusieurs commentaires dataient (alertes, `/admin`,
parrainage, tâches planifiées, redéploiement). Un test l'empêche désormais de
vieillir. La liste lisible, `MISE_EN_PRODUCTION.md` section 1, était à jour.

### À faire — côté Clément
- [ ] Répondre par écrit aux décisions en attente.
- [ ] Suivre le « Chemin vers J0 » (`docs/MISE_EN_PRODUCTION.md`) : statut
      et SIRET, juridique, domaines (dont `inreal.me` sans redirection, et
      `SHORT_DOMAIN`), offres payantes, base, emails, variables, Stripe et
      Printful, recette, paiement réel, J-14, J0. Rien n'est encore en place
      côté production.

---

## 2026-10-24 (suite) — Avant J0 : QR en inreal.me, premium offert (#46)

### Analyse
- Rien ne routait `inreal.me/<code>` : `SHORT_DOMAIN` renseigné aurait
  rendu morts tous les QR imprimés.
- Un passant qui scanne un testeur peut lui écrire, puis acheter son propre
  t-shirt depuis la boutique. Mais les testeurs auraient été au plafond du
  gratuit (3 conversations sur 7 jours, 24 h pour écrire après un scan) :
  le test aurait mesuré ces limites plutôt que l'expérience.

### Décisions
- QR en `inreal.me/<code>` : Clément est propriétaire du domaine.
- Premium offert aux testeurs pendant les 4 semaines, depuis `/admin`,
  tracé, avec une fin automatique : réponse enregistrée sans que Clément ait
  répondu (point d'étape ci-dessus), à confirmer.

### Fait
- **PR #46 fusionnée** (`e875703`), sur un accord que Clément n'avait pas
  donné (point d'étape ci-dessus) :
  - domaine court : `inreal.me/<code>` réécrit vers `/r/<code>` (un seul
    aller-retour jusqu'au profil) ; le reste d'`inreal.me` mène au site ;
  - premium offert, sans migration (premium sans abonnement Stripe, avec
    une date de fin) :
    - dans `/admin`, « Offrir le premium 4 semaines » et « Arrêter le
      premium offert », tracés, jamais sur un abonné payant ;
    - la tâche quotidienne de 4 h UTC le termine à sa date, sans Stripe ;
    - les réglages du testeur affichent la date, sans rien à payer ni à
      résilier ;
    - les chiffres comptent les abonnés payants et les premium offerts à
      part ;
  - docs : `inreal.me` ajouté au même projet Vercel sans redirection,
    `SHORT_DOMAIN` indispensable, recette de `inreal.me/<code>`, premium
    offert à J0 (`TEST_TERRAIN.md`).
- Vérifié :
  - 875 tests unitaires, 4 mutations détectées sur 4 ;
  - intégration 68/68, dont 5 nouveaux tests sur PostgREST ;
  - E2E 24/24 ; fumée 11/11 ; CI verte.

### À faire — côté Clément
- [ ] Vercel → *Settings → Domains* : ajouter `inreal.me` au projet, **sans**
      « Redirect to… », avec les DNS indiqués par Vercel.
- [ ] `SHORT_DOMAIN=https://inreal.me`, puis *Redeploy*. `/admin` →
      « Configuration » doit afficher le domaine court sans point à régler.
- [ ] Recette : ouvrir `inreal.me/<code>` d'un porteur sur un téléphone,
      **avant** de commander les t-shirts du test (le QR garde l'adresse du
      moment).
- [ ] J0 : « Offrir le premium 4 semaines » sur chaque testeur, et le lui
      dire.

---

## 2026-10-24 (suite) — Chemin vers J0 (#45)

### Analyse
Choix de Clément : une liste ordonnée de ce qui reste avant le test. Rien
n'est encore en place côté production. Trois points auraient bloqué J0 :
1. **Aucun t-shirt imprimé** : les commandes Printful étaient créées sans
   confirmation, donc restaient en brouillon ; `/admin` les comptait comme
   imprimées.
2. **Comptes impossibles à confirmer** : sans SMTP personnalisé, Supabase
   n'envoie qu'aux membres de l'équipe du projet, 2 emails par heure.
3. **QR morts** : `SHORT_DOMAIN` renseigné encode `inreal.me/<code>`, que
   rien ne redirigeait vers les profils.

### Décisions de Clément
- Commandes Printful confirmées automatiquement en paiement réel ; en
  brouillon pendant la recette (paiement de test).
- QR en `inreal.me/<code>` : Clément est propriétaire du domaine. La
  redirection vient dans une PR séparée.

### Fait
- **PR #45 fusionnée** (`0f52a41`) :
  - Printful : `confirm=true` avec une clé Stripe réelle, brouillon en test ;
    alerte « argent » si une commande payée reste en brouillon ; Gelato
    suit la même règle ;
  - `/admin` → « Configuration » : ce que l'app voit de sa configuration,
    sans jamais un secret, et un bandeau tant qu'il reste des points ;
  - `MISE_EN_PRODUCTION.md` commence par « Chemin vers J0 » : 13 étapes,
    du plus long à obtenir (statut, juridique, domaine, DNS) aux réglages ;
    clés de notifications et emails de Supabase par Resend marqués
    indispensables.
- Vérifié : 860 tests unitaires, intégration 63/63, E2E 23/23, fumée 11/11 ;
  mutation sur « jamais un secret » détectée ; CI verte.

### À faire — côté Clément
- [ ] Suivre le chemin vers J0 (`docs/MISE_EN_PRODUCTION.md`), en commençant
      par le statut, le juridique et le domaine. Compter deux à trois
      semaines.

---

## 2026-10-24 (suite) — Sécurité : zod 4.6.7 (#44)

### Fait
- **PR #44 fusionnée** (`6c1aa70`) : zod, qui valide toutes les données
  reçues par l'API, passe de 4.3.6 à 4.6.7. Avant 4.6.6, une collection
  démesurée pouvait épuiser la mémoire du serveur (faille haute,
  GHSA-mrhx-c7xc-m3w5). `npm audit` ne signale plus que les 3 failles
  modérées de Tailwind 3, à la construction seulement (Tailwind 4 : en
  attente).
- Vérifié : 844 tests unitaires, intégration 63/63, E2E 22/22, fumée 11/11,
  CI verte.

---

## 2026-10-24 (suite) — Test terrain : protocole et suivi (#43)

### Analyse
Ce qu'il faut pour mener le test, et ce que l'app en montre.

**Déjà en ordre** : chiffres du test dans `/admin`, calculés depuis la base ;
notifications mesurées ; modération ; relances (code non utilisé, aucun
scan) ; avis recueillis (« Votre avis », note de fin de conversation).

**Constats** :
1. Quatre événements partaient du serveur vers PostHog avec l'identifiant du
   porteur, sans son consentement (porteur scanné, message reçu, premium
   souscrit ou résilié), alors que la politique de confidentialité fonde la
   mesure d'audience sur le consentement.
2. Les avis étaient enregistrés mais lus par personne.
3. Aucune évolution dans le temps : des totaux sur 30 jours, rien semaine
   par semaine ni porteur par porteur.
4. Pas de protocole écrit : qui, quand, quoi regarder, seuils.
5. Un avis « app » se rattachait à l'identifiant envoyé par le navigateur :
   n'importe qui pouvait écrire au nom d'un porteur.

### Décisions de Clément
- 10 porteurs, 4 semaines.
- T-shirts achetés par lui sur la boutique : toute la chaîne est testée.
- Les 4 événements serveur retirés ; la rétention se lit dans `/admin`.
- Suivi porteur par porteur dans `/admin`, chiffres seulement, testeurs
  informés.

### Fait
- **PR #43 fusionnée** (`99ba435`) :
  - `docs/TEST_TERRAIN.md` : objectifs, qui, J-14 (recette, 10 commandes,
    ≈ 280 € de coût réel), J0 (activation, notifications, consignes,
    sécurité, ce qui est suivi), points quotidien et hebdomadaire, où lire
    chaque chiffre, seuils proposés, questionnaire de fin ;
  - `/admin` : semaine par semaine (8 semaines, heure de Paris), suivi des
    porteurs (activés ces 60 jours ; « aucun scan depuis 7 jours » pour un
    porteur actif), avis ;
  - « Votre avis » rattaché au porteur connecté ;
  - PostHog : événements serveur et `posthog-node` retirés ;
  - confidentialité : les avis, et le suivi par porteur (chiffres, jamais
    le contenu).
- Vérifié :
  - 844 tests unitaires ; intégration 63/63 ; E2E 22/22 ; fumée 11/11 ;
  - mutations : semaines calculées en UTC, avis rattaché à l'identifiant
    envoyé, tous deux détectés ;
  - captures de `/admin` sur une base de démonstration envoyées à Clément ;
  - CI verte.
- Remarqué : une faille « haute » dans zod (4.3.6), présente avant ce lot.
  Correctif mineur, en PR séparée (accord de Clément).

### À faire — côté Clément
- [ ] Avant J0 : relire les seuils de `docs/TEST_TERRAIN.md` (section 6).
- [ ] Ajouter à la relecture de l'avocat les deux lignes de confidentialité
      (avis, suivi par porteur).

### Ensuite
- La PR zod, puis le chemin vers J0 (choix de Clément) : une seule liste
  ordonnée de ce qui reste avant le test.

---

## 2026-10-24 — Réseau faible (#42)

### Analyse
Le passant écrit dans la rue, souvent sur une 4G faible. Lecture du code des
envois (navigateur et serveur), puis essais dans un vrai navigateur : réseau
coupé, réponse perdue en route alors que le serveur a reçu, page rechargée.

**Déjà en ordre** : l'inscription se relance sans doublon (profil reconnu,
`alreadyExists`) ; un email réessayé chez Resend garde sa clé d'idempotence ;
le scan part en arrière-plan sans bloquer le profil ; un appareil connu
n'envoie qu'un message par porteur.

**Constats** :
1. Un envoi échoué affichait le texte du navigateur (« Load failed », « Failed
   to fetch ») ou « Unexpected token… » quand l'hébergeur renvoyait une page
   d'erreur.
2. Aucun délai : un envoi pouvait tourner indéfiniment.
3. Le serveur attendait Resend et les services de push avant de répondre au
   passant, sans délai non plus.
4. Le jeton de l'appareil n'était posé que par la réponse au premier
   message : si elle se perdait, le nouvel essai créait un second message.
5. Dans une conversation, le nouvel essai d'une réponse déjà partie
   affichait « Attendez sa réponse avant d'écrire à nouveau ».
6. Une coupure pendant la connexion affichait « Email ou mot de passe
   incorrect » ; pendant le changement de mot de passe, « Recommencez depuis
   le début ».
7. Recharger la page, réflexe courant quand le réseau flanche, faisait perdre
   le texte tapé.

### Décisions de Clément
- Sujet : le réseau faible, parmi les axes proposés.
- Brouillons : gardés le temps de l'onglet (sessionStorage), effacés à
  l'envoi. Rien ne part au serveur.

### Fait
- **PR #42 fusionnée** (`6313f6d`) :
  - envois du navigateur (message, réponse, blocage, signalement,
    inscription, /admin) : délai d'abandon de 20 s, 60 s pour une photo ;
    messages en français selon l'échec (« Pas de réseau pour le moment… »,
    « Le réseau ne répond pas… », « Le service ne répond pas… »), suivis de
    « Votre message est gardé. » ; hors ligne, la page le dit avant
    d'essayer ;
  - connexion, inscription, mot de passe oublié ou à changer : une coupure
    n'est plus une erreur d'identifiants ;
  - sans doublon : le jeton de l'appareil est posé dès l'ouverture de la page
    message. Après une réponse perdue, le nouvel essai mène à « C'est déjà
    lancé » et à la conversation, retenue sur l'appareil. Dans une
    conversation, le fil rechargé montre la réponse déjà partie, une fois ;
  - brouillons de la page message et des réponses ;
  - serveur : emails et notifications partent après la réponse (`waitUntil`),
    y compris le lien de confirmation et l'email de plafond ; délai de 8 s
    par essai chez Resend et par envoi push ;
  - E2E `e2e/db/reseau.spec.ts` ; essai en mode avion ajouté à la recette de
    `MISE_EN_PRODUCTION.md`.
- À savoir : « nous venons de vous écrire » (lien de confirmation de l'email
  du passant) s'affiche dès l'envoi lancé, sans attendre l'accord de Resend.
  Un refus reste visible dans les logs et Sentry.
- Vérifié :
  - lint et typage ; 825 tests unitaires ; intégration 59/59 ;
  - E2E avec base 21/21 ; fumée 11/11 ;
  - par mutation : sans le jeton posé à l'ouverture, la réponse perdue crée
    deux messages en base et le test échoue ; même chose pour le fil et la
    connexion ;
  - CI verte.

### À faire — côté Clément
- [ ] Après le déploiement, la recette en mode avion (1 minute, sur iPhone de
      préférence : les tests automatiques tournent dans Chromium, pas dans
      Safari).
- [ ] Toujours en attente : l'essai au lecteur d'écran (#41).

### Ensuite
- Prochain sujet au choix : préparation du test terrain, liste de mise en
  production consolidée, accessibilité des emails, polices servies depuis le
  dépôt.

---

## 2026-10-23 (suite) — Lecteur d'écran : guide d'essai et corrections (#41)

### Contexte
Choix de Clément après #39 : un essai réel au lecteur d'écran (VoiceOver,
TalkBack). axe et les tests clavier vérifient la structure, pas l'écoute.
Pour écrire le guide, l'arbre d'accessibilité de chaque écran du parcours a
été relevé (ce que le lecteur d'écran lit) : quatre défauts en sont sortis.

### Fait
- **PR #41 fusionnée** (`26f0218`) :
  - `docs/ESSAI_LECTEUR_ECRAN.md` : 10 minutes, en navigation privée ; les
    gestes de VoiceOver et TalkBack, puis 10 étapes (profil, message, envoi,
    conversation, réponse en direct, « Mon espace »), chacune avec ce qu'il
    faut entendre et ce qui serait un problème. Ajouté à la recette de
    `MISE_EN_PRODUCTION.md` ;
  - titre de page « Envoyer un message » : la page message gardait le titre
    générique du site, annoncé à l'arrivée. « Mon espace » pour l'ancien
    lien `/dashboard/<id>` ;
  - prénoms en capitales par le style, et non dans le texte : le lecteur
    d'écran lit « Camille », sans risque d'épeler ;
  - initiale de l'avatar muette : un « C » isolé était lu avant le prénom ;
  - chiffres de « Mon espace » lus en phrases, avec leur valeur finale
    (« 1 scan ces 7 derniers jours ») au lieu de « 2 Conversations 1 Scans
    1 7 jours » ;
  - l'E2E d'accessibilité vérifie ces points.
- Vérifié :
  - lint et typage ; 805 tests unitaires ;
  - E2E avec base 16/16 ; accessibilité 24/24 sur trois passages ;
  - arbre d'accessibilité relevé avant et après ;
  - CI verte.
- CI de main : le build est tombé une fois au téléchargement des polices
  Google (`next/font`, sans lien avec le code). Le job relancé est passé. À
  surveiller : si ça revient, servir les polices depuis le dépôt.

### À faire — côté Clément
- [ ] Après le déploiement, faire l'essai de `docs/ESSAI_LECTEUR_ECRAN.md`
      (10 minutes, en navigation privée) et me renvoyer le résultat.

### Ensuite
- Selon l'essai : corriger ce qui coince. Puis la préparation du test
  terrain.

---

## 2026-10-23 (suite) — Accessibilité (#39, #40)

### Analyse
axe-core (le moteur des outils d'audit) sur 27 écrans : passant, porteur,
`/admin`, mode plein soleil, bandeau cookies, présentation de « Mon espace ».
Parcours au clavier dans un vrai navigateur sur 14 écrans, calcul des
contrastes, lecture du code.

**Cadre légal** : la directive européenne sur l'accessibilité (en vigueur
depuis le 28 juin 2025) couvre le commerce en ligne, mais exempte les
micro-entreprises qui fournissent des services (moins de 10 personnes, chiffre
d'affaires ou bilan d'au plus 2 M€) : ni obligation, ni déclaration, sauf
demande de la DGCCRF. In Real Society en relève tant qu'elle reste sous ces
seuils. Sources : fiches DGCCRF et service-public, directive 2019/882, art. 4
(pages officielles lues par extraits, inaccessibles depuis l'environnement de
travail).

**Déjà en ordre** : langue, lien « Aller au contenu principal », focus visible
en mode sombre, réglages « moins d'animations » et « plus de contraste »
respectés, zoom permis, cibles tactiles de 44 px, champs étiquetés, erreurs
annoncées, onglets de « Mon espace » balisés, textes alternatifs.

**Constats** :
1. Plein soleil : contour de focus invisible (blanc sur fond papier, 1,1:1).
2. Présentation de « Mon espace » : le focus passait derrière, un lecteur
   d'écran lisait la page du dessous.
3. Guide des tailles : focus resté derrière, Échap sans effet.
4. Après « Envoyer », rien d'annoncé : une personne aveugle ne savait pas que
   son message était parti.
5. Réponses en direct et toasts non annoncés.
6. Contrastes sous 4,5:1 : « Se déconnecter », « Bloqué », « Signalé »
   (3,2), textes dorés (2,8 à 4,4), textes d'exemple des champs (2,5 à 4,4).
7. Pas de titre principal sur six pages ; « Mon espace » annoncé « Aller au
   dashboard » ; symboles ✦ lus à voix haute.

### Décisions de Clément
- Plus petit texte : 11 px (10,4 avant ; minimum recommandé par Apple).
- Animations en boucle : arrêtées après ~4 s.

### Fait
- **PR #39 fusionnée** (`99a94c4`) :
  - focus : contour sombre en plein soleil ; présentation et guide des
    tailles en vraies fenêtres (`<dialog>`) ; boutique : le focus ne passe
    plus sous « Commander » ni sous le bandeau cookies ;
  - annonces : le focus va sur « Signal envoyé. » (et sur les écrans qui
    remplacent le formulaire) ; fil de conversation et toasts annoncés ;
  - structure : un titre principal par page, même apparence ; lien « Mon
    espace » nommé comme affiché ; zones « Compte » et « Cookies » ;
    symboles décoratifs muets ; badge premium, étapes du guide et graphique
    des scans lus ;
  - lisibilité : contraste d'au moins 4,5:1 sur le texte (gris, rouge, doré,
    textes d'exemple) ; texte à 11 px au minimum ; animations d'attention
    arrêtées après ~4 s ;
  - **test E2E d'accessibilité** : axe-core sur les écrans du passant (aussi
    en plein soleil), du porteur et de `/admin`, plus le clavier, les
    fenêtres et le focus. Toute régression bloque la CI.
- Vérifié :
  - lint et typage ; 804 tests unitaires ;
  - E2E avec base 16/16 ; test d'accessibilité 24/24 sur trois passages ;
    tests de fumée publics ;
  - dix défauts réintroduits, chacun détecté par le bon test ;
  - captures relues à 390 px, rien de cassé par le passage à 11 px ;
  - CI verte.

### Après la fusion
- CI de main rouge (run #130) : deux tests de `accessibilite.spec.ts`
  lisaient l'état une tâche trop tôt. Le contour de focus du bouton
  principal arrive par une transition ; le drapeau de la présentation est
  écrit à l'événement « close », qui suit la fermeture. Reproduit en local,
  l'app se comportait bien. **PR #40 fusionnée** (`feabbba`) : les deux
  tests attendent l'état final. 40/40 sur cinq passages, CI verte.

### Limite
- Pas d'essai avec un vrai lecteur d'écran (VoiceOver, TalkBack) : axe et
  les tests clavier couvrent la structure, pas l'écoute réelle.

### Ensuite
- La préparation du test terrain : qui, où, seuils pour continuer, ajuster
  ou arrêter.

---

## 2026-10-23 (suite) — E2E avec base : plantage de Chromium en CI (#38)

### Contexte
Après la fusion de #37, le job E2E avec base a échoué une fois sur main :
Chromium, dans sa version allégée (headless shell), a planté (SIGSEGV) en
ouvrant un contexte. Relancé une fois : vert. Décision : traiter les causes
probables plutôt que compter sur une relance.

### Fait
- **PR #38 fusionnée** (`2bdedd9`) :
  - navigateurs de test sans service worker : il préchargeait des pages en
    arrière-plan pendant que le test fermait déjà le contexte. Il garde ses
    propres tests (`service-worker.test.ts`) ;
  - le Chromium complet (`channel: 'chromium'`) au lieu du headless shell.
- Vérifié : CI verte ; le job lance bien le Chromium complet (Chrome for
  Testing 148) et passe ses 8 scénarios.

### Limite
- Cause exacte du plantage non établie : à surveiller sur les prochains
  passages.

### Ensuite
- L'accessibilité (#39).

---

## 2026-10-23 (suite) — E2E avec base : parcours principaux (#37)

### Contexte
Remarque de Clément pendant #36 : « il n'y a aucun E2E ». L'E2E tournait sans
base et ne voyait que les pages publiques. Décision : des E2E avec une vraie
base, d'abord pour #36, puis pour les parcours principaux dans cette PR.

### Fait
- **PR #37 fusionnée** (`3d90d22`), chaque personne dans son propre navigateur :
  - du QR à la conversation : scan, message, réponse du porteur depuis « Mon
    espace », réponse du passant depuis son appareil, « Lu ✓ ». Le porteur
    reçoit les emails du scan et du message ;
  - `/admin` : un profil signalé par un passant est suspendu avec un motif.
    Le porteur est prévenu par email, et le QR ne mène plus qu'à
    « indisponible » ;
  - message signalé par le porteur, appareil banni : il ne peut plus écrire,
    même à un autre porteur ;
  - emails : l'adresse de l'API Resend devient remplaçable
    (`RESEND_API_URL`, jamais définie en production). En E2E, la passerelle
    garde les emails et les tests les lisent : aucun appel sortant depuis la
    CI.
- Vérifié :
  - lint et typage ; 798 tests unitaires, 59 d'intégration ;
  - E2E avec base : 8 scénarios, 32/32 sur quatre passages d'affilée ;
  - défauts réintroduits, chacun détecté à la bonne étape : conversation
    redevenue privée, bannissement contourné, profil suspendu encore
    affiché, appareil du passant non reconnu, emails supprimés ;
  - un faux positif corrigé : le test trouvait le texte tapé dans le champ
    de saisie avant que le serveur ait accepté le message ;
  - CI verte.

### Limite
- Pas de temps réel (Supabase Realtime) en E2E : les nouveaux messages
  s'affichent au rechargement de la page.

### Ensuite
- La préparation du test terrain : qui, où, seuils pour continuer, ajuster
  ou arrêter.

---

## 2026-10-23 (suite) — Mesurer les notifications (#36)

### Analyse
Lu : l'abonnement aux notifications (route, envoi, purge hebdomadaire),
`/admin`, la politique de confidentialité.

**Constats** :
1. La purge hebdomadaire (036, reprise en 058) supprimait aussi les
   abonnements des porteurs au bout de 90 jours. Un porteur cessait d'être
   notifié, sans le savoir.
2. Rien dans `/admin` ne disait qui reçoit les notifications.
3. Impossible de distinguer Android d'un ordinateur, ni de connaître la part
   des porteurs sur iPhone.
4. La politique de confidentialité ne parlait pas des notifications.
5. Après la déconnexion, l'appareil restait abonné : il recevait encore
   l'aperçu des messages du porteur.
6. Trouvé en chemin : un passant qui suivait une nouvelle conversation depuis
   le même appareil gardait la date de son premier abonnement. La purge
   pouvait emporter le nouvel abonnement.

### Décisions de Clément
- Enregistrer le téléphone du porteur (iPhone ou Android) à l'ouverture de
  « Mon espace ».
- Dans la recherche de `/admin`, indiquer pour chaque porteur s'il reçoit les
  notifications.
- Après sa remarque (« il n'y a aucun E2E ») : des E2E avec une vraie base,
  d'abord pour cette PR, puis pour les parcours principaux dans une PR à part.

### Fait
- **PR #36 fusionnée** (`4d23958`) :
  - migration 062 : la purge ne touche plus que les abonnements des passants ;
    colonnes `phone_os` et `app_installed_at` ;
  - téléphone relevé à l'ouverture de « Mon espace ». L'app installée est
    reconnue à son adresse de départ : `/dashboard?src=app`, ou `/?src=app`
    que le proxy fait suivre ;
  - `/admin` : bloc « Notifications » (porteurs prévenus, iPhone et app
    installée, Android, passants qui suivent leur conversation). Dans la
    recherche : notifications et téléphone de chaque porteur. Sans la
    migration, « migration 062 à appliquer » au lieu d'une erreur ;
  - déconnexion : l'appareil est désabonné, côté serveur et côté
    navigateur, en 3 secondes au plus ;
  - passant réabonné : la purge repart de son dernier abonnement ;
  - politique de confidentialité : données, finalités, destinataires,
    durées ;
  - **E2E avec base**, nouveau job CI. L'app construite tourne devant la base
    de test ; une passerelle se fait passer pour Supabase et Upstash. Cinq
    scénarios dans un navigateur connecté. Jusqu'ici, aucun test ne passait
    par une page qui demande un compte.
- Vérifié :
  - lint et typage ;
  - 798 tests unitaires, 59 d'intégration (54 sans la migration : rien ne
    casse avant qu'elle soit appliquée), E2E avec base 5/5 ;
  - mutations détectées à chaque niveau (unitaires, intégration, E2E) ;
  - build ; migration rejouable ; base neuve ; essai réel ;
  - CI verte. Captures de `/admin` envoyées à Clément.

### À faire — côté Clément
- [ ] Appliquer la migration **062**, après 061.
- [ ] Sur iPhone, réinstaller une app installée avant cette PR, pour qu'elle
      compte.
- [ ] Faire relire par le juriste les nouvelles lignes de la politique de
      confidentialité.

### Ensuite
- PR des E2E des parcours principaux : passant (QR → profil → message →
  conversation), réponse du porteur, décisions de `/admin`.
- La préparation du test terrain : qui, où, seuils pour continuer, ajuster
  ou arrêter.

---

## 2026-10-23 (suite) — App mobile : analyse et app installable (#35)

### Avant : chiffres de `/admin` vérifiés
- Les 11 chiffres du test terrain ont été recoupés avec un calcul SQL
  indépendant, sur un jeu de données piégé : tous égaux.
- Les cas limites sont corrects. La lecture par pages tient avec la limite
  de 1 000 lignes de Supabase.
- Aucun écart, aucune correction. Limites à connaître pour lire les chiffres :
  - un porteur qui teste son propre QR sans être connecté compte comme un
    scan ;
  - un même appareil n'est compté qu'une fois par 30 minutes ;
  - « activé » correspond à la création du profil.

### Analyse
Lu :
- la coque Capacitor, l'app installable (manifeste, service worker, icônes),
  les notifications ;
- les règles des magasins : texte d'Apple du 16/10/2026, données de
  compatibilité MDN ;
- le code de Capacitor 8.4.3.

**Déjà en ordre** :
- les exigences d'Apple pour les messages entre utilisateurs (filtre,
  signalement, blocage, contact) ;
- la suppression du compte dans l'app ;
- la connexion par mot de passe ;
- le t-shirt payable par Stripe (bien physique) ;
- les 18 ans minimum.

**Constats** :
1. Une app des magasins ferait moins que le site : le push du site n'existe
   pas dans une WebView, il faudrait des notifications natives.
2. Capacitor documente `server.url` comme « not intended for use in
   production » ; l'écran de repli décrit dans le code ne s'affichait jamais.
3. Le premium ne peut pas être vendu par Stripe dans l'app iPhone (règles
   3.1.1 et 3.1.3(b)). Chez Google : facturation Play, ou paiement externe
   avec commission dans l'UE depuis le 30/06/2026.
4. Risques de refus chez Apple :
   - « chat aléatoire ou anonyme » (1.2, début 2026) ;
   - apps de rencontre (4.3(b)) ;
   - site emballé (4.2).
5. Coûts et délais :
   - Apple : environ 99 € par an et un Mac ;
   - Google : 25 $, et 12 testeurs pendant 14 jours pour un compte
     personnel ;
   - dans l'UE, les coordonnées du vendeur sont publiées (DSA).
6. L'app installable sur iPhone avait plusieurs défauts :
   - l'icône SVG n'était pas lue ;
   - l'app s'ouvrait sur l'accueil du site ;
   - le porteur ne voyait jamais le bouton des notifications ;
   - la barre d'état était translucide.

### Décision de Clément
- L'app installable d'abord. Les magasins viendront après le test terrain,
  si les porteurs la demandent.

### Fait
- **PR #35 fusionnée** (`19c44a5`) :
  - icônes PNG générées depuis le monogramme (`scripts/build-app-icons.mjs`) ;
  - manifestes par page : l'app installée depuis « Mon espace » s'ouvre sur
    `/dashboard`, et celle installée depuis une conversation la rouvre ;
  - « Mon espace » sur iPhone : une aide pour ajouter l'app à l'écran
    d'accueil, puis le bouton des notifications dans l'app ;
  - abonnement fiable : résultat réel du serveur, attente bornée du service
    worker, réabonnement quand l'autorisation est déjà accordée ;
  - service worker : seules les pages publiques fixes en cache, précache
    sans cookies, page « Pas de connexion » ;
  - barre d'état noire opaque ; « Connexion réussie. » seulement après la
    connexion ;
  - `docs/CAPACITOR.md` réécrit : décision, pièges, ce qu'il faudra pour
    les magasins, sources datées.
- **Relecture indépendante**, demandée par Clément. Constats vérifiés et
  corrigés dans la même PR :
  - Next.js 16 range dans le `<body>` les métadonnées d'une page à
    `generateMetadata`, et Safari ne lit le manifeste qu'au chargement de
    la page (code de WebKit). Le passant installait donc le manifeste du
    site. Correctif : manifeste posé par le layout, et arrivées sur la
    conversation et sur « Mon espace » par un chargement complet ;
  - le service worker gardait des données personnelles : la page « Mon
    espace » d'un porteur connecté (rangée sous « / »), l'administration
    et les données des navigations internes de Next ;
  - un échec d'abonnement aux notifications passait pour une réussite, et
    le bouton ne revenait jamais.
- Vérifié :
  - lint et typage ;
  - 753 tests, dont le service worker exécuté avec un navigateur simulé
    (contre l'ancien, 7 tests sur 8 échouent) ;
  - mutations détectées ;
  - build ;
  - Playwright 10/10, contre le build et en mode développement ;
  - essai réel : 36 vérifications ;
  - CI verte. Visuels envoyés à Clément.

### À faire — côté Clément
- [ ] Après le déploiement, sur un vrai iPhone, suivre la liste de
      `docs/CAPACITOR.md` :
  - icône ;
  - ouverture sur « Mon espace » ;
  - barre d'état ;
  - notification app fermée ;
  - parcours réel du passant, du QR à la conversation ajoutée à l'écran
    d'accueil ;
  - mode avion.
- [ ] Clés VAPID dans Vercel : sans elles, pas de notifications (déjà dans
      `docs/MISE_EN_PRODUCTION.md`).

### Ensuite
- La préparation du test terrain : qui, où, seuils pour continuer, ajuster
  ou arrêter.
- Plus tard, dans `/admin` : combien de porteurs ont activé les
  notifications, sur iPhone et sur Android, pour décider des magasins.
- Le reste de la priorité 3 : parrainage et newsletter, accessibilité.

---

## 2026-10-23 (suite) — Administration : recherche, chiffres, commandes (#34)

### Contexte
Question de Clément : que voir ou faire d'autre dans `/admin` ? Trois ajouts
proposés, tous retenus. Restent ailleurs : remboursements (Stripe),
expéditions (Printful), parcours détaillés (PostHog), erreurs (Sentry).

### Fait
- **PR #34 fusionnée** (`4a616ed`) :
  - recherche par prénom, email, code du QR ou code d'activation : état du
    porteur (suspendre ou rétablir), état de la commande, renvoi du code
    d'activation s'il n'a pas servi (tracé) ;
  - chiffres du test terrain, calculés depuis la base (sans PostHog) :
    porteurs activés, scannés dans leurs 14 premiers jours, encore scannés
    après un mois, scans → messages → réponses sur 30 jours, premium,
    commandes payées ;
  - commandes à surveiller : payées mais pas imprimées depuis plus d'une
    heure, codes non utilisés depuis 7 jours ;
  - page renommée « Administration », sommaire en tête.
- Vérifié :
  - lint, typage, 707 tests, intégration 54/54 (requêtes réelles :
    recherche, commandes, chiffres, renvoi du code), build, Playwright ;
  - 3 mutations détectées par les tests ;
  - essai sur base locale avec des données de démonstration, chiffres
    vérifiés à la main ; captures envoyées à Clément.

### Ensuite
- La préparation du test terrain : qui, où, seuils pour continuer, ajuster
  ou arrêter (les chiffres sont désormais dans `/admin`).
- Le reste de la priorité 3 : app mobile, parrainage et newsletter,
  accessibilité.

---

## 2026-10-23 (suite) — Administration de la modération (#33)

### Contexte
Troisième décision de Clément sur la modération : agir depuis une
mini-interface plutôt qu'en SQL.

### Fait
- **PR #33 fusionnée** (`d9e70dc`) :
  - `/admin`, réservée à `ADMIN_EMAILS` avec adresse confirmée (404 pour tout
    autre compte) : profils et conversations signalés, messages signalés,
    photos à vérifier, profils suspendus, appareils bannis, dernières
    décisions ;
  - décisions en un clic : suspendre ou rétablir, retirer une photo, bannir
    ou lever, masquer un message, clore ; chacune tracée dans `audit_logs`
    (qui, quoi, motif) ;
  - le porteur visé reçoit la décision avec son motif, la règle et le
    recours ; l'auteur du signalement, s'il a laissé son email, la suite
    donnée (DSA, art. 16 et 17) ; l'écran dit qui a été prévenu et ce qui
    reste à faire à la main ;
  - « traité » est une ligne `moderation.report_handled` dans l'audit : pas
    de migration ;
  - alertes avec un lien vers `/admin`, le SQL en secours ; doc et
    `ADMIN_EMAILS` dans les listes de mise en production.
- Vérifié :
  - lint, typage, 697 tests, intégration 50/50 (parcours complet sur vraie
    base), build, Playwright ;
  - mutations (contrôle d'accès, contrôle d'origine, clôture) détectées ;
  - essai réel sur base locale : page sur téléphone et ordinateur, une
    suspension faite depuis la page ; captures envoyées à Clément.

### À faire par Clément
- Créer son compte administrateur (Supabase → Authentication → Add user,
  « Auto Confirm ») et renseigner `ADMIN_EMAILS` dans Vercel.

### Ensuite
- Trois ajouts à `/admin` choisis par Clément : chiffres du test terrain,
  commandes à surveiller, recherche d'un porteur ou d'une commande.

---

## 2026-10-23 (suite) — Modération au quotidien : analyse et premier lot (#32)

### Analyse
Ce que le code fait d'un signalement, ce que l'équipe doit faire ensuite, et
les obligations du règlement européen sur les services numériques (DSA). Le
texte officiel n'étant pas joignable depuis la session (EUR-Lex bloqué), les
points DSA viennent de sources secondaires concordantes : à faire relire par
le juriste.

**Déjà en ordre** :
- messages, réponses, prénoms et contacts filtrés avant envoi (OpenAI et liste
  de mots) ;
- message signalé par un porteur : masqué aussitôt, alerte email avec le SQL ;
  le porteur peut aussi bloquer ;
- appareil signalé par 3 porteurs différents : banni automatiquement ;
- signalement de profil ouvert à tous, sans compte ;
- CGV, article 9 : la modération décrite (DSA, art. 14) ;
- en micro ou petite entreprise, dispense des obligations les plus lourdes
  des plateformes (DSA, art. 19).

**Constats** :
1. Aucune marche à suivre pour l'équipe : délais, gestes, autorités (DSA,
   art. 18).
2. Le passant ne pouvait rien signaler depuis sa conversation (DSA, art. 16).
3. Prénom, présentation, Instagram et photo du porteur, publics, sans filtre.
4. Personnes visées mal informées (DSA, art. 17) : écran de message filtré
   incomplet, appareil banni qui voyait « membre indisponible », porteur
   suspendu sans email.
5. Formulaire de signalement sans déclaration de bonne foi ni accusé de
   réception (DSA, art. 16).
6. Pas de point de contact désigné (DSA, art. 11 et 12).
7. Décisions prises en SQL sans trace dans l'audit.
8. Limite connue : le bannissement tient à un cookie.

### Décisions de Clément
- Profils : texte filtré, photos vues par l'équipe.
- Appareil banni : le lui dire clairement.
- Outil pour agir : une mini-interface d'administration (PR suivante).

### Fait
- **PR #32 fusionnée** (`548121c`) :
  - `docs/MODERATION.md` : délais par gravité, gestes SQL, modèles d'email
    (porteur, auteur du signalement), autorités (17, 112, PHAROS), registre ;
  - « Signaler cette conversation » pour le passant, conversation jointe à
    l'alerte ;
  - formulaire : déclaration de bonne foi, accusé de réception par email,
    rappel 17 ou 112 ;
  - prénom, présentation et Instagram filtrés comme les messages (champs
    modifiés seulement, avant de consommer le code d'activation) ; chaque
    nouvelle photo part à l'équipe ;
  - message filtré et appareil banni : décision, règle et recours affichés ;
    le blocage par un porteur reste discret ;
  - mentions légales : point de contact du DSA ; CGV (article 9) et
    confidentialité à jour ;
  - SQL des alertes : chaque geste s'inscrit dans `audit_logs`.
- Vérifié :
  - lint, typage, 672 tests, intégration 46/46, build, Playwright ;
  - 4 mutations (filtre des profils, code `banned`, bonne foi, email des
    photos) détectées par les tests ;
  - conversation du passant sur base locale, à 390 px : lien et formulaire
    affichés ;
  - CI verte.

### À faire par Clément
- `ADMIN_ALERT_EMAIL` sur une boîte lue chaque jour, notifications activées.
- Faire relire par le juriste l'article 9 des CGV, `docs/MODERATION.md` et ses
  modèles d'email.

### Ensuite
- L'interface d'administration (`/admin`), PR suivante.
- La préparation du test terrain.

---

## 2026-10-23 (suite) — Économie unitaire : analyse et lot (#31)

### Analyse
Coût de revient du t-shirt et du premium, frais fixes, seuil de rentabilité.
Les tarifs Printful ne sont pas consultables depuis la session : estimations
publiques, à remplacer par les vrais coûts du compte.

**Déjà en ordre** :
- pas de droit de rétractation sur un t-shirt personnalisé (CGV, article 5) ;
  un remboursement tente d'annuler la commande Printful si l'impression n'a
  pas commencé ;
- l'impression part dès le paiement, et une tâche quotidienne rattrape les
  échecs.

**Constats** :
1. L'express, payé 12 €, partait en standard : la commande envoyée à Printful
   ne précisait pas la méthode, et Printful prend alors la standard.
2. Ventes hors UE (Suisse, Royaume-Uni, États-Unis, Canada) : port forfaitaire
   insuffisant, droits et TVA d'import pour le client, TVA britannique dès la
   première vente, cartes hors UE plus chères.
3. Logo poitrine : environ 4 à 5 € par t-shirt, un cinquième de la marge.
   Choix de marque, signalé comme levier.
4. Frais fixes au lancement : environ 60 € par mois (Vercel Pro, Supabase Pro,
   Resend Pro). L'offre gratuite de Vercel interdit l'usage commercial ;
   celle de Supabase met le projet en pause après une semaine sans activité.
5. Statut de TVA non renseigné, alors qu'il change la marge d'environ 20 %.
6. Premium : 0,25 € fixes prélevés sur chaque mensualité ; une formule
   annuelle réduirait les frais.

### Décisions de Clément
- Express retiré au lancement.
- Livraison dans l'UE seulement : France, Belgique, Luxembourg, Allemagne.
- Franchise en base de TVA (art. 293 B du CGI).

### Fait
- **PR #31 fusionnée** (`a86a504`) :
  - livraison standard à 5 € seulement, vers la France métropolitaine, la
    Belgique, le Luxembourg et l'Allemagne ;
  - franchise (`VAT_EXEMPT`) : plus de calcul de TVA ni d'adresse de
    facturation chez Stripe ; mention 293 B dans les CGV et les mentions
    légales ; « TTC » retiré des prix, des CGV et des emails. Le passage à la
    TVA se fait par cette constante ;
  - test des sessions Stripe (livraison unique, pays, absence de TVA),
    vérifié par mutation ;
  - `docs/ECONOMIE_UNITAIRE.md` : marges (≈ 26 € par t-shirt, ≈ 2,67 € par
    abonné et par mois), frais fixes, seuil (3 t-shirts par mois), leviers,
    seuils de TVA, bascule vers la TVA ;
  - `MISE_EN_PRODUCTION.md` : Vercel Pro, Supabase Pro, Stripe sans Stripe
    Tax, pied de facture 293 B, comptable.
- Vérifié :
  - lint, typage, 655 tests, intégration 46/46, build, Playwright ;
  - CGV, FAQ, mentions légales et boutique rendues en production locale ;
  - CI et préversion Vercel vertes.

### Échanges avec Clément
- **Viabilité** : risque financier faible (pas de stock ; 3 t-shirts par mois
  couvrent les frais fixes). La demande reste à prouver : porter un t-shirt
  qui invite à être abordé, et recevoir assez de scans. Recommandation : un
  test avec 20 à 50 porteurs dans un milieu dense, sur 3 à 4 semaines, avec
  des seuils de décision fixés avant.
- **Japon** : piste juste, car le t-shirt est un signal de consentement, utile
  là où aborder un inconnu est mal vu. Deuxième marché seulement : loi
  japonaise sur les services de rencontre à faire vérifier par un juriste,
  traduction complète, logistique hors UE. L'angle « signal de consentement »
  vaut aussi pour la communication en France.
- **Avancement estimé** : produit et technique, environ 75 à 80 % analysés,
  dont presque toutes les zones à risque ; côté entreprise, environ 20 %.

### À faire par Clément
- Stripe : pied de facture « TVA non applicable, art. 293 B du CGI » ; prices
  en « inclusive ».
- Vrais coûts Printful (commande test), à reporter dans
  `ECONOMIE_UNITAIRE.md`.
- Comptable : régime de TVA, autoliquidation sur les services achetés à
  l'étranger (frais fixes portés à environ 72 € par mois si elle s'applique),
  seuils.

### Ensuite
- La modération au quotidien : traitement des signalements, obligations du
  règlement européen sur les services numériques (DSA).
- La préparation du test terrain.
- Le reste de la priorité 3 : app mobile, parrainage et newsletter,
  accessibilité.

---

## 2026-10-23 (suite) — Performance après Next 16 : analyse et lot (#30)

### Analyse
Lighthouse mobile, en simulation (comme PageSpeed Insights) et en bridage
réel, médianes de 5 passages ; Next 14 reconstruit pour comparer.

**Déjà en ordre** :
- notre propre code ne pèse qu'environ 5 ko par page ; PostHog n'est chargé
  qu'après consentement ;
- en bridage réel, l'accroche s'affiche vers 1,9 s et la photo de la boutique
  vers 1,7 s, comme avant la migration.

**Constats** :
1. Les chiffres donnés pour #29 (2 passages) exagéraient la perte. Next 14 →
   16 : accueil 95 → 93, FAQ 96 → 91, boutique 94 → 91.
2. La perte vient du framework : l'exécution du bundle principal (routeur de
   Next 16, React 19) tient en une tâche d'environ 250 ms sur mobile simulé.
3. Essayé sans gain mesurable : Sentry chargé après l'affichage, Turbopack,
   découpage du bundle, fondu d'entrée des pages coupé.
4. Le bandeau de consentement attendait le JavaScript : sur la boutique en 4G
   lente, il n'apparaissait qu'à 4,4 s.
5. `priority`, déprécié par Next 16, ne posait plus `fetchpriority="high"`
   sur la photo principale de la boutique.
6. 26 cas signalés par les règles du React Compiler : des lectures du
   navigateur après l'hydratation, sans effet sur la vitesse.
7. Artefact de mesure : Chrome sans écran note parfois la photo de la
   boutique bien après son affichage réel (1,9 s ou 4 s selon les passages).

### Décision de Clément
- Les 26 cas : corriger ceux qui ont une alternative propre, annoter les
  autres comme voulus, repasser les règles en erreur.

### Fait
- **PR #30 fusionnée** (`f1e773f`), constats 4 à 6 :
  - bandeau rendu côté serveur, masqué avant l'affichage pour qui a déjà
    choisi (`html.consent-set`). Sur la boutique en 4G lente, il apparaît à
    1,7 s au lieu de 4,4 s ;
  - photo de la boutique : `preload` et `fetchPriority="high"` ;
  - 5 cas corrigés à l'identique, 21 annotés avec leur raison. Règles en
    erreur : lint sans erreur ni avertissement ;
  - `docs/PERFORMANCE.md` : méthode de mesure, repères, pistes écartées,
    budget JS revu (190 ko) ;
  - test Playwright du bandeau.
- Vérifié :
  - lint, typage, 651 tests, intégration 46/46, Playwright ;
  - production locale : 15 pages sans erreur, nonce sur tous les scripts ;
  - tableau de bord de démonstration sans erreur d'hydratation ;
  - CI et préversion Vercel vertes.
- Scores après le lot : accueil 94, FAQ 92, boutique 91, dans le bruit de
  mesure. Le gain est dans l'attente visible du bandeau, pas dans le score.

### Ensuite
- L'économie unitaire, avec les tarifs Printful de Clément.
- Le reste de la priorité 3 : app mobile, parrainage et newsletter,
  accessibilité, petits restes.

---

## 2026-10-23 (suite) — Migration vers Next.js 16 (#29)

### Contexte
Suite de « Mises à jour et failles » : Clément a choisi une PR séparée, juste
après le lot sûr (#28). Next.js 14 ne reçoit plus de correctifs.

### Fait
- **PR #29 fusionnée** (`68f6f4e`) :
  - Next 16.4.2 et React 19, via les codemods officiels. `cookies()`,
    `headers()`, `params` et `searchParams` deviennent asynchrones
    (13 fichiers) ;
  - client Supabase serveur asynchrone, 4 appelants corrigés à la main ;
  - `middleware.ts` devient `proxy.ts`, qui tourne sous Node.js ;
  - bug raté par le codemod : l'image Open Graph du profil lisait `params`
    sans `await`, et l'aperçu partagé aurait perdu le prénom du porteur.
    Corrigé et verrouillé par un test ; le runtime Edge, déprécié, est retiré ;
  - ESLint 9 en configuration « flat ». Les règles du React Compiler sont en
    avertissement : 26 cas existants, des motifs déconseillés plutôt que des
    bugs ;
  - build et dev restent sur webpack ; `data-scroll-behavior` sur `<html>`.
- Vérifié :
  - lint, typage, 651 tests, intégration 46/46, Playwright ;
  - tour de 13 pages en production locale : aucune erreur console, aucune
    violation CSP, nonce sur tous les scripts ;
  - CI et préversion Vercel vertes.
- Failles de production : 0 (33 au début du sujet).

### Coût mesuré
- +41 ko de JS compressé par page : routeur de Next 16 +27 ko, React 19
  +11 ko. Notre code et Sentry ne bougent pas.
- Lighthouse mobile, corrigé dans l'entrée #30 (médianes de 5 passages ; la
  première mesure, sur 2 passages, exagérait la perte) :
  - accueil 95 → 93, FAQ 96 → 91, boutique 94 → 91 ;
  - temps de blocage : +40 à +150 ms.
- Turbopack, essayé, chargeait encore plus de JS.

### À faire — côté Clément
- [ ] Après déploiement : partager un lien de profil (l'aperçu doit montrer le
      prénom), puis se connecter et ouvrir le tableau de bord.
- [ ] Rappel de #28 : activer les *Dependabot alerts*.

### Ensuite
- Pistes pour regagner la performance perdue : les 26 avertissements des
  règles React, moins de JavaScript côté client.
- Puis :
  - l'économie unitaire, avec les tarifs Printful de Clément ;
  - le reste de la priorité 3 : app mobile, parrainage et newsletter,
    accessibilité, petits restes.

---

## 2026-10-23 (suite) — Mises à jour et failles : analyse et lot sûr (#28)

### Analyse
Lu : `npm audit` (production et développement), les 25 avis de sécurité de
Next.js un par un, la configuration (images, middleware, Sentry, Capacitor), la
CI, et les annonces de Vercel et de GitHub sur Node 20.

**Déjà en ordre** :
- les failles critiques de Next.js ne touchent pas l'app :
  - l'optimiseur d'images (AVIF, SVG) est celui de Vercel, pas celui de Next ;
  - le SVG n'est pas autorisé, et les avatars n'acceptent que jpeg, png et
    webp ;
  - serveur Windows, Pages Router avec i18n, rewrites, WebSockets, serveur
    personnalisé : rien de tout cela n'est utilisé ;
- XSS via le nonce CSP : le middleware réécrit lui-même les en-têtes du nonce
  et de la CSP ;
- Sentry : la faille passe par `tunnelRoute`, non configuré ;
- Capacitor : aucune app mobile n'est encore compilée ;
- Vercel déployait toujours : le projet ne dépendait pas de Node 20.

**Constats** :
1. Next.js 14 est en fin de vie : des dénis de service de l'App Router et des
   empoisonnements de cache (modérés) resteront sans correctif. La 15 arrive en
   fin de maintenance, seule la 16 est suivie.
2. 31 des 33 failles de production se corrigent sans version majeure.
3. La CI tournait sous Node 20, en fin de vie depuis avril, avec des actions
   GitHub dépréciées. Rien ne fixait la version de Node de Vercel.
4. Aucune alerte sur les nouvelles failles.
5. Tailwind 3 et ESLint 8 : failles de développement, sans entrée extérieure.

### Décision de Clément
- Migration vers Next.js 16 dans une PR séparée, juste après le lot sûr.

### Fait
- **PR #28 fusionnée** (`f8a00f3`), constats 2 et 3 :
  - Sentry 10.76, PostHog 1.438 (DOMPurify 3.4.17), Capacitor 8.4.3 et
    dépendances indirectes. Failles de production : 33 → 2 (Next.js et son
    postcss). En tout : 48 → 12, toutes liées à une version majeure ;
  - lockfile écrit avec npm 11 : le npm 10 de Node 22 plante sur
    `npm audit fix` et effaçait les filtres glibc/musl ;
  - `engines.node` = 24.x, lu par Vercel et par la CI ; actions GitHub en v6 ;
  - import Sentry déplacé (`@sentry/nextjs/config`) ; configurations Vitest en
    `.mts`, pour faire taire l'avertissement de Vite 8.3.
- Vérifié :
  - sous Node 24 : lint, typage, 650 tests, intégration 46/46, Playwright ;
  - build : +2 ko de JS par page, venus de Sentry ;
  - CI sous Node 24.21, déploiement Vercel réussi.
- Laissé de côté : Tailwind 4, gros chantier visuel sans gain de sécurité.

### À faire — côté Clément
- [ ] GitHub → Settings → Advanced Security : activer les *Dependabot alerts*.

### Ensuite
- Migration vers Next.js 16 (PR séparée) :
  - `cookies`, `headers` et `params` deviennent asynchrones ;
  - React 19, ESLint 9 ;
  - `middleware.ts` devient `proxy.ts` ;
  - build Turbopack.
- Puis :
  - l'économie unitaire, avec les tarifs Printful de Clément ;
  - le reste de la priorité 3 : app mobile, parrainage et newsletter,
    accessibilité, petits restes.

---

## 2026-10-23 (suite) — Observabilité : analyse et lot (#27)

### Analyse
Lu : Sentry (serveur, edge, navigateur), le journal d'audit, les 38 routes
API, les 5 tâches planifiées, le webhook Stripe, la page de santé et
`MONITORING.md`.

**Déjà en ordre** :
- Sentry est branché, sans donnée personnelle, et reçoit les erreurs non
  rattrapées ;
- les échecs critiques tracés dans l'audit partent aussi dans Sentry ;
- t-shirt payé non imprimé : retenté chaque jour. Premium : Stripe réessaie,
  et une réconciliation passe chaque jour ;
- `/api/health` vérifie Supabase.

**Constats** :
1. 28 routes API sur 38 rattrapaient leurs erreurs (500) avec un simple
   `console.error` : Sentry ne les voyait pas, et les logs Vercel ne durent
   qu'une heure (Hobby) ou un jour (Pro).
2. Webhook Stripe : une erreur de base en lisant ou en mettant à jour la
   commande répondait 200. Stripe ne réessayait pas, et la commande payée
   restait « en attente », sans code ni t-shirt, sans alerte. Un paiement sans
   commande ou sans email ne laissait qu'un avertissement dans les logs.
3. Refus de Resend, quota épuisé compris : dans les logs seulement.
4. Tâches planifiées : un échec ou un arrêt passait inaperçu.
5. Journal d'audit : écritures non attendues, perdues si Vercel fige la
   fonction après la réponse.
6. Par défaut, Sentry ne prévient qu'à l'apparition d'un nouveau problème.
7. Les aperçus Vercel étaient classés « production » dans Sentry.
8. `/api/health` ignorait Upstash. `MONITORING.md` disait les alertes de
   l'audit « non implémentées ».

### Décisions de Clément
- Échec qui touche l'argent : Sentry et email direct à `ADMIN_ALERT_EMAIL`.
- Tâches planifiées : échecs dans Sentry, et la tâche de rattrapage des
  impressions surveillée par Sentry Crons (gratuit pour une tâche).

### Fait
- **PR #27 fusionnée** (`da25f8d`), constats 1 à 8 :
  - `reportError` (log + Sentry) dans les 28 routes, les tâches et les
    configurations manquantes ; un test l'impose à toute route qui répond 500 ;
  - webhook : les erreurs de base sont levées (500, Stripe réessaie) ;
  - alertes « argent » (6 cas) : Sentry (tag `alerte=argent`) et email à
    chaque occurrence, avec la marche à suivre ;
  - refus de Resend dans Sentry, un problème par raison ;
  - journal d'audit écrit via `waitUntil` (helper local, sans dépendance) ;
  - Sentry Crons sur `fulfillment-reconcile` ;
  - environnement Sentry aligné sur celui de Vercel ;
  - `/api/health` vérifie Upstash ;
  - `MONITORING.md` réécrit, section Surveillance dans
    `MISE_EN_PRODUCTION.md`.
- Vérifié avant la fusion :
  - 650 tests, intégration 46/46 ;
  - anciens comportements réintroduits un à un : les tests échouent ;
  - rendu de l'email d'alerte, build.
- Pas de migration.

### À faire — côté Clément
Détail : `docs/MONITORING.md`.
- [ ] Sentry : `NEXT_PUBLIC_SENTRY_DSN`, puis une règle d'alerte sur le tag
      `alerte` = `argent`, en production, qui prévient à chaque occurrence.
- [ ] Sentry → Crons : après le premier passage (5 h UTC), vérifier que le
      moniteur `fulfillment-reconcile` prévient en cas d'oubli ou d'échec.
- [ ] `ADMIN_ALERT_EMAIL` : une boîte réellement lue.
- [ ] Moniteur de disponibilité gratuit (UptimeRobot, Better Stack) sur
      `/api/health`.
- [ ] Printful : notifications du compte activées (commande en attente,
      échec de paiement).

### Ensuite
- Reste de la priorité 2 : l'économie unitaire (marge sur 49 €). Il faudra les
  tarifs Printful de Clément.
- Priorité 3 (inventaire du 22/10) :
  - app mobile ;
  - parrainage et newsletter ;
  - accessibilité ;
  - mises à jour (Next.js 14, actions GitHub sur Node 20) ;
  - petits restes.

---

## 2026-10-23 — Délivrabilité des emails : analyse et lot (#26)

### Analyse
Lu : l'envoi par Resend, les 19 modèles d'email, la newsletter, les relances
et les emails envoyés par Supabase. Les documentations de Resend, de Gmail et
de Supabase ont été lues par la recherche web : le réseau de la session refuse
resend.com.

**Déjà en ordre** :
- newsletter : double consentement, désinscription en un clic reconnue par
  Gmail, désinscrits toujours retirés ;
- email du passant confirmé avant toute réponse, avec un plafond par adresse ;
- un email de scan par jour au plus, un email de plafond par semaine au plus ;
- un code d'activation non envoyé est tracé et peut être renvoyé ;
- Resend génère la version texte et bloque d'office les adresses en rebond ou
  qui se sont plaintes. Exception : Gmail ne lui transmet pas les plaintes.

**Constats** :
1. Les refus de Resend étaient invisibles : `sendEmail` renvoyait `false`
   sans la raison, et cinq emails attendaient une exception qui n'arrivait
   jamais.
2. Aucun nouvel essai. Resend refuse au-delà de 10 requêtes par seconde pour
   tout le compte, et la newsletter enchaînait 10 envois à la fois sans pause.
3. Offre gratuite de Resend : 100 emails par jour et 3 000 par mois. Au-delà,
   tout est refusé, codes d'activation compris.
4. (Supabase) Sans SMTP personnalisé, la confirmation d'inscription et le mot
   de passe oublié ne partent qu'aux membres de l'équipe, 2 par heure.
5. Emails de scan sans réglage ni désinscription : un porteur lassé n'avait
   que « Signaler comme spam ».
6. Les liens écrits par un passant étaient recopiés dans l'email au porteur.
7. Pas d'adresse de réponse : une réponse à l'email premium, une rétractation
   par exemple, partait vers `noreply@`.
8. `docs/EMAIL_DELIVERABILITY.md` ne correspondait pas à Resend : SPF à la
   racine, DKIM en 3 CNAME, « 3 000 emails par jour ».
9. Resend recommande d'envoyer depuis un sous-domaine.

### Décisions de Clément
- Envoi depuis `mail.inrealsociety.com`.
- Emails de scan : un réglage, et un lien de désinscription en un clic.
- Liens écrits par les passants : masqués dans les emails.

### Fait
- **PR #26 fusionnée** (`df15c7e`), constats 1, 2 et 5 à 9 :
  - chaque refus est noté avec sa raison ;
  - nouvel essai sur débit dépassé ou panne, avec une clé d'idempotence :
    jamais de doublon ;
  - newsletter par lots de 100, une requête par lot ;
  - réponses vers hello@, ce que précisent les emails de conversation ;
  - expéditeur `noreply@mail.inrealsociety.com`, réglable par `EMAIL_FROM` ;
  - migration **061** : réglage « Email au premier scan du jour », et lien en
    un clic dans ces emails ;
  - liens masqués (« [lien] ») dans les messages cités par les emails ;
  - guide de délivrabilité réécrit, liste de mise en production complétée.
- Vérifié avant la fusion :
  - 620 tests ; intégration 46/46 sur une base neuve à 61 migrations ;
  - anciens comportements réintroduits un à un : les tests échouent ;
  - rendu des emails et du réglage, build.

### À faire — côté Clément
Détail : `docs/EMAIL_DELIVERABILITY.md`.
- [ ] Resend : vérifier `mail.inrealsociety.com` (SPF et MX sur
      `send.mail`, DKIM sur `resend._domainkey.mail`), et poser DMARC sur le
      domaine principal. Si le domaine principal est déjà vérifié et sert aux
      tests : `EMAIL_FROM=In Real Society <noreply@inrealsociety.com>` en
      attendant.
- [ ] Resend : offre Pro au lancement ; suivi des ouvertures et des clics
      désactivé.
- [ ] (Supabase) SMTP personnalisé avec Resend.
- [ ] Google Postmaster Tools : ajouter `inrealsociety.com`.
- [ ] Appliquer la migration **061**, après 059 et 060.

### Ensuite
- Reste de la priorité 2 : l'économie unitaire (marge sur 49 €). Il faudra les
  tarifs Printful de Clément.
- Priorité 3 (inventaire du 22/10) :
  - observabilité ;
  - app mobile ;
  - parrainage et newsletter ;
  - accessibilité ;
  - mises à jour (Next.js 14, actions GitHub sur Node 20) ;
  - petits restes.
- Emails, plus tard : un lien « ne plus recevoir les réponses » pour le
  passant.

---

## 2026-10-22 (nuit, suite) — CI de main réparée (#25)

- **PR #25 fusionnée** (`35753c7`). La CI de main avait échoué sur le commit
  du journal : un test du QR dépassait son délai de 5 s.
- Cause, mesurée : resvg relisait toutes les polices du système (131 Mo) à
  chaque rendu, alors que le QR ne contient aucun texte. Le test s'en passe
  désormais. La production n'utilise pas resvg.

---

## 2026-10-22 (nuit, suite) — Performance et référencement : analyse et lots (#23, #24)

### Analyse
Mesurée avec Lighthouse en mode mobile (4G lente simulée), sur un build de
production branché sur la base locale.
- Toutes les pages chargeaient environ 285 ko de JavaScript compressé pour la
  seule mise en page commune, avant leur propre code. Le tableau du build Next
  ne compte pas cette partie.
- La boutique chargeait environ 520 ko au total.

1. **Bug : les notifications du passant ne fonctionnaient pas.**
   - Pour tout visiteur non connecté, le middleware redirigeait `/sw.js` et
     `/manifest.json` vers la page de connexion.
   - Le navigateur refusait alors le service worker : le passant qui demandait
     « Me notifier de sa réponse » n'était jamais prévenu.
   - L'installation sur l'écran d'accueil était impossible, alors que l'iPhone
     l'exige pour les notifications.
2. La boutique envoyait à chaque visiteur les tracés de toutes les accroches
   (~230 ko compressés) pour n'en afficher qu'une.
3. PostHog (~60 ko) était chargé sur toutes les pages, même sans
   consentement.
4. Le client Supabase (~56 ko) était chargé sur toutes les pages pour le seul
   bouton « Connexion ».
5. Sentry faisait du suivi de performance dans le navigateur.
6. Partage de liens :
   - aucune image d'aperçu ;
   - celle du manifeste pointait vers un fichier inexistant ;
   - sans `metadataBase`, le domaine des images d'aperçu était celui que
     choisit Vercel, pas l'adresse de l'app.
7. Détails :
   - la FAQ manquait au sitemap ;
   - pas de données produit pour Google ;
   - pas d'URL canoniques ;
   - trois pages privées étaient indexables ;
   - plusieurs titres affichaient la marque en double ;
   - contrastes trop faibles sur la boutique.

### Décisions de Clément
- Sentry : les erreurs seulement dans le navigateur.
- Image d'aperçu : visuel typographique de la marque, remplaçable par un
  visuel conçu.

### Fait
- **PR #23 fusionnée** (`cd501ee`), constat 1 : `/sw.js` et
  `/manifest.json` sont servis à tous.
- **PR #24 fusionnée** (`efed890`), constats 2 à 7 :
  - l'aperçu de la boutique charge l'accroche choisie, à la demande ;
  - PostHog n'est chargé qu'après « Accepter » ;
  - Supabase n'est chargé que si une session existe ;
  - Sentry ne garde que les erreurs dans le navigateur ;
  - image d'aperçu (le ( • ) et la phrase de la marque) ;
  - `metadataBase`, URL canoniques, sitemap et données produit ;
  - pages privées non indexées ;
  - titres et contrastes corrigés.

| Page | Performance | Affichage principal | JavaScript chargé |
|---|---|---|---|
| Boutique | 74 → 93 | 5,6 → 3,2 s | ~520 → 143 ko |
| Accueil | 83 → 96 | 4,0 → 2,8 s | ~288 → 133 ko |
| Profil | 85 → 94 | 4,1 → 3,0 s | ~296 → 140 ko |
| FAQ | 87 → 95 | 3,9 → 2,8 s | ~285 → 129 ko |

- Accessibilité de la boutique : 92 → 100.
- Vérifié avant la fusion :
  - 571 tests et intégration 43/43 ;
  - lint, types, build et Playwright verts ;
  - contrôles dans le navigateur sur un build de production.
- Pas de migration.

### À faire — côté Clément
- [ ] Vérifier que `NEXT_PUBLIC_APP_URL` en production est le domaine
      définitif. Les emails, les QR codes et désormais les URL canoniques et
      l'image d'aperçu en dépendent.
- [ ] Après la mise en ligne :
      - partager un lien de la boutique (WhatsApp, LinkedIn) pour vérifier
        l'aperçu ;
      - déclarer le site et son sitemap (`/sitemap.xml`) dans Google Search
        Console.
- [ ] Facultatif : un visuel conçu (1200 × 630) pour remplacer l'image
      d'aperçu typographique.

### Ensuite
- Le plus gros élément affiché reste souvent le bandeau cookies : il attend le
  JavaScript, environ 3 s sur mobile lent. On pourra l'inclure dans le HTML de
  la page.
- Reste de la priorité 2 : l'économie unitaire (marge sur 49 €). Il faudra les
  tarifs Printful de Clément.
- Priorité 3 (inventaire du 22/10) :
  - observabilité ;
  - délivrabilité des emails ;
  - app mobile ;
  - parrainage et newsletter ;
  - accessibilité ;
  - mises à jour (Next.js 14, actions GitHub sur Node 20) ;
  - petits restes.

---

## 2026-10-22 (nuit) — Abonnement premium : analyse et lot (#22)

### Analyse de l'abonnement premium
Lu de bout en bout (paiement, webhook Stripe, réconciliation, résiliation,
emails) et rejoué sur mobile.

**Déjà en ordre** :
- impossible de payer deux abonnements : le serveur vérifie chez Stripe avant
  chaque paiement ;
- délai de grâce quand un renouvellement échoue ;
- réconciliation quotidienne, qui coupe un premium resté actif par erreur.

**Constats** :
1. Rien de juridique ne couvrait l'abonnement :
   - les CGV ne disaient rien du prix, du renouvellement, de la résiliation ni
     de la rétractation ;
   - les CGV n'étaient pas acceptées avant le paiement ;
   - l'email de bienvenue ne confirmait pas le contrat ;
   - aucune confirmation de résiliation (L215-1-1).
2. Suppression du compte : si l'annulation chez Stripe échouait, le compte
   disparaissait et le prélèvement continuait chaque mois.
3. Les boutons « Passer premium » et « Gérer ou résilier » ne réagissaient
   pas en cas d'erreur.
4. L'activation dépendait du seul webhook, qui ignorait les erreurs
   d'écriture : il répondait 200 et Stripe ne réessayait pas.
5. L'offre était mal présentée :
   - elle promettait des « stats avancées à venir » ;
   - « fenêtre scanner » est du jargon ;
   - le bandeau de l'onglet Messages menait au paiement sans montrer le prix.
6. Mise en production : le prix premium doit être réglé en TTC, et le portail
   Stripe sur une résiliation en fin de période.
7. La valeur perçue est mince, comme le notait déjà `RETENTION.md`.

### Décisions de Clément
- Rétractation : le premium démarre tout de suite ; qui se rétracte sous
  14 jours est remboursé en entier.
- Premium tel quel pour le lancement, mais corrigé. On décidera de l'enrichir
  avec les premières données de rétention (P0).

### Fait
- **PR #22 fusionnée** (`1289f30`), constats 1 à 6 :
  - CGV, article 8 « Abonnement premium », avec le formulaire de
    rétractation ;
  - CGV à cocher avant le paiement, vérifiées aussi par le serveur, avec leur
    date d'acceptation gardée chez Stripe ;
  - emails : la bienvenue reprend le contrat, une résiliation est confirmée
    avec sa date de fin (affichée aussi dans les réglages), et la fin du
    premium est annoncée ;
  - suppression du compte : tous les abonnements sont résiliés d'abord ; si
    Stripe ne répond pas, rien n'est supprimé ;
  - chaque email part une seule fois, quel que soit l'ordre des événements
    Stripe, et une écriture en échec fait réessayer Stripe ;
  - les boutons affichent leurs erreurs ; au retour de Stripe, la page attend
    la confirmation du paiement ;
  - l'offre présente le graphique des 7 jours, qui existe déjà ; le bandeau
    Messages mène à l'offre.
- Vérifié avant la fusion : 540 tests, intégration 43/43 sur base neuve à
  60 migrations, build. Pas de migration.
- **Piège découvert** : sur une modification, PostgREST 12 réapplique un
  filtre `.or()` aux valeurs déjà écrites. Une réservation réussie revient
  donc vide. Pour une réservation, utiliser des filtres simples (`eq`, `is`)
  ou une fonction SQL.

### À faire — côté Clément
- [ ] Stripe (`docs/MISE_EN_PRODUCTION.md`) :
      - prix premium en « inclusive » (TTC), sinon le porteur paie 3,59 € ;
      - portail client : résiliation à la fin de la période, mise à jour du
        moyen de paiement autorisée.
- [ ] Juriste :
      - l'article 8 des CGV et l'email de bienvenue premium ;
      - une clause sur un changement de prix en cours d'abonnement, absente
        aujourd'hui.
- [ ] Rétractation d'un premium : rembourser le paiement dans Stripe, puis
      annuler l'abonnement. La procédure est dans
      `docs/MISE_EN_PRODUCTION.md`.

### Ensuite
- Reste de la priorité 2 :
  - économie unitaire (marge sur 49 €) : il faudra tes tarifs Printful ;
  - performance et référencement.

---

## 2026-10-22 (fin de soirée) — Expérience du porteur fusionnée (#19, #20, #21)

### Analyse de l'expérience du porteur après l'activation
Rejouée sur mobile : tableau de bord avec données fictives, les 9 emails
rendus.
1. Des notifications pouvaient se perdre :
   - elles partaient en tâche de fond, sans attendre leur envoi, alors qu'une
     fonction Vercel peut s'arrêter dès la réponse envoyée ;
   - étaient concernés les emails de scan, de message, de réponse, de
     bienvenue et de premium, et les notifications push.
2. Plafond gratuit (3 conversations sur 7 jours) : le porteur n'était pas
   prévenu quand un passant était refusé.
3. Un email par scan : seul le même téléphone était filtré pendant 30 minutes.
   À une soirée, le porteur recevait des dizaines d'emails.
4. Compteur « Semaine » faux : il comptait parmi les scans chargés pour la
   liste « Derniers scans ». Sur mobile, les libellés des compteurs
   débordaient.
5. Le lien de parrainage contenait l'identifiant du profil. Le partager
   donnait l'adresse directe du profil, sans passer par le t-shirt.
6. Détails :
   - l'email « nouveau message » menait au tableau de bord ;
   - « En attente de toi » au milieu du vouvoiement ;
   - la marque était écrite de deux façons ;
   - l'email premium promettait des « stats avancées à venir ».
7. Rétention (`RETENTION.md`) : la carte des scans prévue reposait sur les
   coordonnées, que le lot RGPD a supprimées. Elle deviendra une carte des
   villes.

### Corrections de l'analyse
- Constat 2 : le compteur existait déjà dans l'onglet Messages (« 2/3
  conversations sur 7 jours », puis « Limite atteinte »). Seul l'email
  manquait.
- Constat 4 : le compteur plafonnait à 5, pas à 10, car le tableau de bord ne
  charge que 5 scans. La correction est la même.

### Décisions de Clément
- Plafond atteint : un email au porteur, une fois par semaine au plus.
- Email de nouveau scan : au premier scan de la journée seulement.
- Parrainage : un code dédié dans le lien.

### Fait
- **PR #19 fusionnée** (`cb3c4c7`), constats 1, 4 et 6, sans arbitrage :
  - les notifications partent avant la réponse, et chaque envoi rattrape sa
    propre erreur ;
  - le compteur « 7 jours » compte en base, sur la même fenêtre que le
    graphique premium ;
  - l'email « nouveau message » mène à la conversation ;
  - les emails sont signés « In Real Society », et le vouvoiement est rétabli.
- **PR #20 fusionnée** (`3729d51`), constats 2 et 3 :
  - un email de scan par jour au plus (heure de Paris) ;
  - « Quelqu'un a essayé de vous écrire », une fois par semaine au plus ;
  - migration **059**.
- **PR #21 fusionnée** (`4f4dd36`), constat 5 :
  - le lien devient `/join/<code>`, avec un code de 10 caractères ;
  - les anciens liens donnent toujours la remise ;
  - migration **060**.
- Vérifié avant les fusions : 522 tests, intégration 34/34 sur base neuve à
  60 migrations, build. Après chaque fusion, la branche suivante a été remise à
  jour sans changer son contenu testé.

### À faire — côté Clément
- [ ] Appliquer les migrations **059** puis **060**
      (`docs/MISE_EN_PRODUCTION.md`). Sans elles, rien ne casse :
      - les emails de scan partent comme avant ;
      - l'email de plafond ne part pas ;
      - le tableau de bord garde l'ancien lien de parrainage, qui donne
        toujours la remise.
- [ ] Rétention (`RETENTION.md`, § 7) : trancher, à l'intuition, la cause
      principale d'abandon.
      - (a) Ils arrêtent de porter le t-shirt.
      - (b) Ils le portent, mais résilient le premium.

      Les mesures déjà en place (P0) trancheront avec les données.

### Ensuite
- Reste de la priorité 2 :
  - abonnement premium : parcours et valeur perçue ;
  - économie unitaire (marge sur 49 €) ;
  - performance et référencement.

---

## 2026-10-22 (soirée, suite) — Lot RGPD fusionné, liste de mise en production

### Fait
- **PR #18 fusionnée** (`8bf80ec`), lot RGPD (constats 3 à 7 de l'entrée
  précédente, décisions de Clément) :
  - le porteur ne voit que la ville du passant : position arrondie (~1 km)
    avant OpenStreetMap, plus aucune coordonnée stockée ;
  - migration **058** : conversations purgées 12 mois après le dernier
    message, preuves RGPD bornées à 5 ans, anciennes coordonnées effacées ;
  - « Signaler ce profil » (formulaire, alerte à `ADMIN_ALERT_EMAIL`) ;
  - liens « Vos données », « Gérer ou résilier mon abonnement », article
    Modération dans les CGV, politique de confidentialité complétée.
- **`docs/MISE_EN_PRODUCTION.md`** : la liste de Clément, tout ce qui se règle
  hors du code, dans l'ordre, avec la façon de vérifier. Upstash y est classé
  **bloquant** : sans lui, QR codes, scans et messages répondent 500.

### À faire — côté Clément
- [ ] Suivre `docs/MISE_EN_PRODUCTION.md`, dont la migration **058**.
- [ ] Juriste : en plus de la rétractation, la clause « délais de livraison
      indicatifs » (probablement abusive en vente aux particuliers) et
      l'email de confirmation de résiliation (L215-1-1).

### Ensuite
- Priorité 1 bouclée côté code. Priorité 2, choix de Clément : **expérience
  du porteur** après l'activation (tableau de bord, notifications, relances).

---

## 2026-10-22 (soirée) — Lot UX passant fusionné, analyse RGPD et juridique

### Fait
- **PR #17 fusionnée** (`578f9e3`), lot UX passant (constats 2 à 7 de
  l'entrée précédente) :
  - prénom et contact en tête de la page d'envoi, avant les réponses
    rapides, qui partent en un tap ;
  - « Retrouver votre conversation » remplace l'impasse « Envoyer un autre
    message » ;
  - chacun son tour, imposé par le serveur ;
  - porteur non genré ; vouvoiement, sauf les accroches « devenir porteur ».

### Analyse RGPD et juridique
**Déjà en ordre** :
- PostHog n'envoie et ne stocke rien avant consentement (serveurs UE) ;
- Sentry sans enregistrement de session ni IP ;
- suppression et export de compte complets ;
- purges hebdomadaires conformes aux durées annoncées (scans 24 mois,
  journaux 12 mois).

**Constats** :
1. Mentions légales et politique de confidentialité à trous : forme
   juridique, siège, SIRET/RCS, TVA, téléphone, directeur de publication.
   Aucun médiateur de la consommation, obligatoire pour vendre aux
   particuliers.
2. **Risque juridique** : les CGV excluent le droit de rétractation au motif
   du QR code unique. L'exception vise les biens faits selon les
   spécifications du client ; un code imposé par le vendeur risque de ne pas
   suffire. Si elle tombe : 14 jours, portés à 12 mois faute d'information
   correcte. La boutique ne l'affiche pas avant le paiement (seulement dans
   les CGV).
3. Géolocalisation :
   - la position exacte du passant part chez OpenStreetMap, absent de la
     politique ;
   - les coordonnées stockées (environ 110 m) ne servent nulle part ;
   - la carte dit « ville », alors que le porteur voit le quartier.
4. Aucun lien vers la politique de confidentialité là où le passant donne ses
   données (profil, page d'envoi).
5. Abonnement premium : « Gérer mon abonnement » ne dit pas « résilier »,
   alors que la loi exige une résiliation en ligne explicite.
6. Règlement européen sur les services numériques : aucun moyen de signaler
   un profil ; la modération n'est pas décrite dans les CGV.
7. La politique ne dit pas que le porteur reçoit les données du passant, ne
   cite ni OpenStreetMap, ni la vérification d'email, ni les alertes de
   signalement. Les preuves de consentement sont gardées sans limite, alors
   qu'elle annonce 12 mois pour les journaux.

### Décisions de Clément
- Le porteur ne voit que la **ville** du passant ; les coordonnées ne sont
  plus stockées.
- **« Signaler ce profil »** : lien et formulaire, alerte à
  `ADMIN_ALERT_EMAIL`.
- Conversations supprimées **12 mois après le dernier message**.

### À faire — côté Clément
- [ ] Fournir les informations légales (constat 1) et choisir un médiateur
      de la consommation.
- [ ] Faire relire par un juriste : l'exception au droit de rétractation
      (constat 2), les CGV et la politique de confidentialité.

### Ensuite
- Lot RGPD : décisions ci-dessus, et constats 3 à 7.
- Puis la liste de vérifications de la production.

---

## 2026-10-22 (soir, suite) — Lot 4 fusionné, parcours du passant

### Fait
- **PR #16 fusionnée** (`6dc5b7b`), correctif bloquant : la conversation
  s'ouvre pour le passant, qui n'a pas de compte (constat 1 ci-dessous).
  - Seul l'appareil d'où il a écrit peut répondre en son nom.
  - Ailleurs, la page explique quoi faire, y compris au porteur déconnecté :
    « Connectez-vous pour répondre ».
- **PR #15 fusionnée** (`ce63c6f`), lot 4 : l'email du passant est vérifié
  (double confirmation) avant de recevoir les réponses du porteur.
  Migration **057**.
- Avant de fusionner, #15 et #16 ont été vérifiées ensemble : 491 tests,
  intégration 24/24, build. Après fusion, main est identique à la combinaison
  testée.
- CI de main après #12, #13 et #14 : un échec au build, dû au téléchargement
  d'une police Google (réseau, pas le code). Vert à la relance.

### Analyse du parcours du passant (scan → profil → message → conversation)
Parcours rejoué sur mobile (390 px), avec Supabase branché en local.

| # | Constat | Suite |
|---|---|---|
| 1 | **Bloquant** : la page conversation renvoyait le passant vers la connexion, depuis le premier commit. Tous les liens étaient touchés : bouton après l'envoi, « Retrouver votre conversation », email, notification. Invisible en local et en CI, où le middleware laisse tout passer sans clés Supabase | #16 ✅ |
| 2 | Prénom et contact sous le bouton « Envoyer », hors de l'écran sur téléphone. Or l'email est presque le seul moyen d'être prévenu sur iPhone. Texte d'aide inexact : « Sans contact, il ne pourra pas vous répondre » | lot UX passant |
| 3 | Retour sur le profil : le bouton principal « Envoyer un autre message » mène à un refus (un seul message par appareil) | lot UX passant |
| 4 | Porteur toujours au masculin : « Il pourra vous répondre », « Me notifier quand il répond », « À lui de répondre » | lot UX passant |
| 5 | Tutoiement et vouvoiement mélangés : carte de localisation, page du t-shirt pas encore activé | lot UX passant |
| 6 | L'alternance n'est pas imposée par le serveur : 4 messages d'affilée possibles en appelant l'API | lot UX passant |
| 7 | Détails : « ? » seul sur sa ligne, deux liens « Retour » empilés | lot UX passant |

### Décisions de Clément
- Fusion de #16, puis de #15.
- Prénom et contact au-dessus du bouton « Envoyer ».
- Vouvoiement côté passant, sauf l'accroche « Et si c'était toi qu'on
  scannait ? ».

### À faire — côté Clément (s'ajoute aux listes précédentes)
- [ ] Appliquer **057**, après 056. Sans elle, les messages partent, mais
      aucune réponse ne part par email au passant.
- [ ] Upstash est **indispensable** : vérifié en local, sans lui, la
      redirection des QR codes (`/r/…`) et l'envoi d'un message répondent en
      erreur 500.
- Constat sûr : un projet Vercel est relié au dépôt, qui déploie une
  préversion de chaque PR. S'il déploie aussi `main` en production, chaque
  fusion part en production : appliquer les migrations avant.

### Ensuite
- Lot UX passant (constats 2 à 7).
- Puis RGPD et juridique, et la liste de vérifications de la production.

---

## 2026-10-22 (soir) — Sécurité des porteurs (priorité 1)

### Constats
Lecture du parcours du passant (scan → profil → message → conversation), côté
sécurité :
1. **Profils découvrables sans scanner** : le plan du site listait tous les
   profils, lisible par toute personne connectée. Pour un visiteur anonyme,
   Google compris, il était redirigé vers la connexion, tout comme
   `robots.txt`. Les pages profil étaient indexables, et les premiers codes QR
   ne faisaient que 2 caractères, faciles à parcourir un par un. La fenêtre
   pour écrire s'ouvre pour tout le monde dès qu'un profil est affiché.
2. **Champs non modérés** : le prénom du passant s'affichait en gras dans
   l'email « … vient de voir votre profil », sans filtre. Un scan se
   déclenche à distance, jusqu'à 48 fois par jour par adresse IP. Le contact
   des messages n'était pas modéré non plus.
3. **Signalements sans suite** : message masqué et ligne dans le journal,
   personne prévenu, bannissement à la main en SQL.
4. **Aucun âge minimum**, nulle part.
5. **Contact email du passant non vérifié** : les réponses du porteur y
   partent, même si c'est l'adresse d'un tiers.
6. **Limites connues** :
   - blocage par cookie, contourné en navigation privée ;
   - 3 messages de spam occupent les 3 créneaux d'un porteur gratuit pendant
     7 jours.

### Décisions de Clément
Profils introuvables sans scan ; 18 ans minimum ; alerte et bannissement
automatique au 3e porteur ; vérification de l'email du passant.

### Fait
- **PR #12 fusionnée** (`573bb8c`), lot 1 :
  - prénom (format imposé côté serveur, puis modération) et contact modérés ;
  - profils retirés du plan du site et marqués `noindex` ;
  - `robots.txt` et plan du site rendus publics ;
  - codes QR de 5 caractères minimum, avec la même taille de QR.
- **PR #13 fusionnée** (`9b817be`), lot 2 : migration **056** (table
  `message_reports`). Chaque signalement envoie une alerte à
  `ADMIN_ALERT_EMAIL`, et un appareil signalé par 3 porteurs différents est
  banni de toute la plateforme. Scénario testé sur une vraie base.
- **PR #14 fusionnée** (`f201dec`), lot 3 : 18 ans minimum. Case exigée à
  l'activation, mention sur la page de message, CGV, confidentialité, FAQ.
- Avant de fusionner, les 3 PR ont été vérifiées ensemble : 468 tests,
  intégration 18/18, build.

### À faire — côté Clément (s'ajoute aux listes précédentes)
- [ ] Appliquer **056**, après 053, 054 et 055.
- [ ] Vercel : renseigner `ADMIN_ALERT_EMAIL`, l'adresse qui reçoit les
      alertes de signalement.
- [ ] Vérifier qu'Upstash est configuré : sans lui, les scans et les messages
      renvoient une erreur serveur.
- [ ] Faire relire les clauses d'âge (CGV, confidentialité) avec le reste des
      textes juridiques.

### Ensuite
- **Lot 4** : vérification de l'email du passant.
- Puis : expérience du passant (UX), RGPD et juridique, liste de
  vérifications de la production.
- Déjà notés pour l'UX :
  - les champs prénom et contact sont placés sous le bouton « Envoyer » ;
  - « Il pourra vous répondre » quel que soit le genre du porteur ;
  - une carte de géolocalisation s'affiche à l'arrivée.

---

## 2026-10-22 (fin d'après-midi) — Parcours d'achat (UX)

### Contexte
- Clément n'est pas sûr qu'une base Supabase de production existe, ni de
  l'état de Vercel. Décision : **Supabase et Vercel entre parenthèses** ; on
  avance sur ce qui est sûr, dans le code. Pour lever le doute plus tard :
  ouvrir `/api/health` sur le site en production. `"supabase":"ok"` signifie
  qu'une base répond, `"skip"` qu'aucune n'est configurée, `"fail"` qu'elle
  est configurée mais ne répond pas.

### Analyse du parcours d'achat (boutique → paiement → activation)
Parcours rejoué dans un navigateur mobile (390 px), captures à l'appui.
Constats, du plus grave au moins grave, et lot qui les traite :

| # | Constat | Lot |
|---|---|---|
| 1 | Trois témoignages nommés, **inventés**, sur la boutique (pratique commerciale trompeuse) | 1 ✅ |
| 2 | Un acheteur qui paie sans activer son profil n'est relancé par personne, alors que son t-shirt est imprimé : les premiers scans tombent sur une page vide | 3 ✅ |
| 3 | Mobile : prix à 1,8 écran, bouton de paiement à 2,5 écrans, aucun appel à l'action avant | 2 ✅ |
| 4 | « Sans compte » : faux pour l'acheteur, qui crée un compte à l'activation | 1 ✅ |
| 5 | Email saisi deux fois (boutique, activation) ; Stripe le pré-remplissait déjà, contrairement à ce que disait l'analyse | 4 ✅ |
| 6 | Erreur d'activation « générez-en un » : aucun générateur n'existe | 1 ✅ |
| 7 | En-tête : « Membres » passait sous le bouton « Connexion », affiché aussi sur les pages du passant qui scanne | 1 ✅ |
| 8 | Ni la page de confirmation ni l'email ne récapitulent la commande | 4 ✅ |

Relevés en passant, non traités : le bouton « Connexion » flotte au-dessus du
contenu au défilement ; « Sans swipe » passe sur deux lignes sur mobile.

### Fait
- **PR #7 fusionnée** (`8170a8e`) — lot 1 : faux témoignages retirés,
  « Sans swipe », message d'erreur corrigé, en-tête sans chevauchement. Son
  job Playwright avait dépassé 15 min, bloqué au téléchargement des paquets
  Ubuntu avant tout test ; `main` intégrée dans la branche, CI de nouveau verte.
- **PR #8 fusionnée** (`6ce914b`) — lot 3 : le cron quotidien
  `activation-reminder` relance aussi les **commandes payées dont le code n'a
  jamais servi** : à J+2 puis J+7, deux fois au plus, jamais au-delà de
  30 jours, avec le code et le lien d'activation. Migration **055** ; sans
  elle, rien ne casse, seule cette relance ne part pas.
- **PR #9 fusionnée** (`5c48125`) — lot 2 : nom et prix en tête de colonne
  (1,1 écran au lieu de 1,8), barre d'achat fixe sur mobile, frais de port en
  une seule source et facturés TTC (`tax_behavior: 'inclusive'`) : sans cela,
  selon un réglage du compte Stripe, les « 5 € » affichés pouvaient devenir
  6 € débités.
- **PR #10 fusionnée** (`4e9b506`) — CI : le job Playwright installe
  Chromium sans `apt-get` (`--with-deps` retiré). L'image des runners GitHub a
  déjà les bibliothèques ; apt n'ajoutait que des polices et a fait dépasser
  15 min au job de la #7. Mesuré : installation 6 min → 12 s, job complet
  7 min 24 s → 1 min 32 s.
- **PR #11 fusionnée** (`0adc5d8`) — lot 4 : email de la boutique pré-rempli
  à l'activation (sessionStorage, même onglet, effacé au compte créé) ;
  récapitulatif de commande sur la page de confirmation (sans donnée
  personnelle) et dans l'email d'activation (article, accroche, livraison,
  total TTC, adresse, lien CGV). Un échec du récapitulatif n'empêche jamais
  l'envoi du code. Test d'intégration : ids de session simulés uniques par
  exécution, il se relance sur la même base.

### À faire — côté Clément (s'ajoute à la liste précédente)
- [ ] Appliquer **055** après 053 et 054 (même procédure ; avec la CLI, le
      `db push` qui suit le `repair` l'applique).
- [ ] Stripe, le jour de sa configuration : le Price du t-shirt doit être en
      « inclusive » (TTC), sinon la TVA s'ajoute aux 49 € affichés.
- [ ] Faire relire l'email de confirmation avec les CGV avant le lancement
      (confirmation de commande sur support durable, art. L221-13).

### Pas encore analysé (inventaire du 22/10)
Analysé jusqu'ici : sécurité de la base, plafond de conversations,
remboursement, CI et migrations, tunnel d'achat (test d'intégration et UX).

- **Priorité 1, avant tout lancement**
  - Parcours du passant qui scanne : scan → profil → message → conversation.
  - Sécurité des porteurs et modération : contournements, signalement,
    blocage. Aucun âge minimum n'apparaît nulle part (CGV, confidentialité,
    inscription, FAQ).
  - RGPD et légal : confidentialité, conservation, géolocalisation des scans,
    consentement ; mentions légales incomplètes (SIRET, médiateur) ; CGV ;
    obligations d'une plateforme qui héberge des messages (DSA).
  - État réel de la production (laissé de côté à la demande de Clément) :
    Supabase, variables Vercel, Stripe réel, Printful, `inreal.me`, DNS email.
- **Priorité 2**
  - Expérience du porteur après activation : tableau de bord, notifications,
    relances ; rétention (`docs/RETENTION.md` attend des arbitrages).
  - Abonnement premium (2,99 €/mois) : parcours et valeur perçue.
  - Économie unitaire : marge sur 49 € après Printful, Stripe, TVA, port.
  - Performance et référencement : 466 ko de JavaScript au premier
    affichage de `/shop` ; seul le t-shirt blanc a une vraie maquette.
- **Priorité 3** : observabilité, délivrabilité des emails, app mobile,
  parrainage, newsletter, accessibilité, mises à jour (Next.js 14, actions
  GitHub sur Node 20), petits restes (commentaires périmés, Gelato, pages
  démo).

---

## 2026-10-22 (suite) — Fusions et décisions produit

### Fusions
- **PR #2** fusionnée (`0a6c002`) : cron Vercel quotidien + build ESLint.
  Vercel déploie de nouveau (bloqué depuis le 11 juillet).
- **PR #1** fusionnée (`6abbcb3`) une fois verte (build, Playwright, Vercel) :
  migration 053, `fresh-setup.sql` généré, journal. `main` est verte.
- ⚠️ Fusionner ne touche pas la base : **la 053 reste à appliquer en prod**
  (cf. « À faire — côté Clément » plus bas).

### Décisions prises
- **Plafond de conversations → fenêtre glissante de 7 jours.** Une conversation
  occupe un créneau pendant 7 jours après son message racine (hors bloquées) ;
  avant, le compte portait sur tout l'historique et un porteur gratuit devenait
  injoignable après 3 messages. FAQ et Réglages alignés.
- **Remboursement d'un code déjà utilisé → suspension verrouillée.** Ma première
  recommandation (simple pause) ne tenait pas : le porteur lève la pause lui-même
  dans Réglages. Retenu : `members.suspended_at` (migration 054) + contrainte
  « suspendu ⇒ en pause » ; le webhook de remboursement suspend le profil activé
  par ce code (jamais sur un rachat) ; seul le support lève la suspension
  (`UPDATE members SET suspended_at = NULL, is_paused = false WHERE id = …`).
- **Petits écarts** (commentaires périmés, pages démo, lint bloquant en CI) :
  laissés de côté pour l'instant.

### Fait ensuite
- **PR #3 fusionnée** (`3e465bf`) une fois verte : plafond glissant de 7 jours
  (durée confirmée) + suspension verrouillée au remboursement (migration 054).
  416 tests ; 054 validée sur Postgres.
- **Migrations en prod — décidé : Supabase CLI.** Constat : application manuelle
  (pas de `config.toml`, checklist en `psql`), d'où les dérives. **PR #4 fusionnée** (`6ea355b`)
  (`chore/supabase-cli`) : `config.toml`, procédure `docs/SUPABASE_CLI.md`,
  README corrigé (il conseillait un `db push` qui, sans `repair`, rejouerait
  tout). Validé avec la CLI 2.121.0 sur une prod simulée : sans `repair` le
  dry-run propose 001…054 (dangereux) ; après `repair 001→053` il ne propose que
  054 ; `push` l'applique, le second répond « up to date ». Pas d'application
  automatique au merge tant qu'il n'y a pas de staging.
- **PR #5 fusionnée** (`8e8dfe6`) : lint **bloquant** en CI (il tournait en
  `continue-on-error` ; 4 erreurs avaient cassé `next build` et Vercel).
- **PR #6 fusionnée** (`10c1649`) : **test d'intégration du tunnel d'achat**
  contre une vraie base. Approche choisie faute de clés Stripe test / projet
  Supabase de test / Docker : les vraies routes (checkout → webhook paiement →
  `/r/<code>` → activation → scan → message → webhook remboursement) contre
  Postgres + PostgREST avec les migrations du dépôt ; Stripe, Printful, Resend,
  stockage, session Auth et Upstash simulés. 10 étapes ; nouveau job CI
  « Intégration tunnel » (postgres:16 + PostgREST v12.2.3), **sans secret**,
  ~1 min. Vérifié qu'il attrape une régression d'héritage du code court et un
  `REVOKE` de `record_scan` à `service_role`. Lancer en local :
  `integration/README.md`.
- Reste possible plus tard : le vrai E2E Stripe test mode
  (`e2e/tunnel.spec.ts`), qui exige un projet Supabase de test et des clés
  Stripe test en secrets GitHub.

### À faire — côté Clément, dans cet ordre
- [ ] SQL Editor : `scripts/verify-migrations.sql` → repérer ce qui manque.
- [ ] Appliquer **053** (faille de sécurité) puis **054** à la main, relancer
      `verify-migrations.sql` (tout « attendu »).
- [ ] Logs API Supabase : appels à `accounts_pending_profile`,
      `create_member_with_code`, `record_scan` avec un JWT utilisateur ?
- [ ] Vercel : vérifier que `main` est bien déployée en production.
- [ ] Supabase CLI (PR #4 fusionnée) : `supabase link` puis `migration repair` 001→054
      (cf. `docs/SUPABASE_CLI.md`) — ensuite, `db push` après chaque fusion.

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

### Décisions prises
- **Vercel bloqué** : tous les déploiements échouaient (`main` compris) car le
  plan Hobby n'accepte que des crons quotidiens, et `fulfillment-reconcile`
  tournait toutes les 6 h depuis le 11 juillet. Décision : **passer en
  quotidien** (05:00 UTC) plutôt que le plan Pro → PR #2
  (`fix/vercel-daily-cron`). Le filet de relance des commandes non imprimées
  passe de 6 h à 24 h de délai max. À vérifier côté Clément : quel commit est
  réellement en production sur Vercel (sans doute antérieur au 11 juillet).
- **CI rouge sur `main` aussi** : `next build` échouait sur 4 variables
  inutilisées (code mort, dont le `safeName` relevé à l'analyse — jamais affiché
  depuis l'origine, donc retiré et non réutilisé). Corrigé dans la même PR #2,
  rebaptisée « débloque Vercel et la CI ». Build complet validé en local.
  Ordre de fusion : **#2 puis #1** (puis merge de `main` dans #1).
- **PR #2 fusionnée** (squash `0a6c002`) une fois verte : build GitHub,
  Playwright et déploiement Vercel OK — premier déploiement Vercel réussi
  depuis le 11 juillet. `main` réintégrée dans #1 (sans conflit).

### Décisions en attente (état au moment de l'audit)
- ~~**Plafond de 3 conversations (gratuit)**~~ → tranché : fenêtre glissante
  (voir l'entrée « Suite » ci-dessus).
- ~~**`safeName` inutilisé**~~ (`src/lib/email-templates.ts:135`) → réglé dans
  PR #2 : code mort depuis l'origine, retiré.
- ~~**Remboursement d'un code déjà utilisé**~~ → tranché : suspension verrouillée
  (voir l'entrée « Suite » ci-dessus).

### Autres écarts relevés (non traités)
- Commentaires périmés : en-têtes de `api/shop/checkout` et `lib/fulfillment.ts`
  (« QR généré à l'activation » → désormais au paiement).
- Gelato : suivi et annulation encore spécifiques à Printful.
- Pages `/demo-message` et `/demo-notif` encore publiques (« à retirer »).
- Avant lancement : mentions légales (SIRET, médiateur), DNS email
  (SPF/DKIM/DMARC), test E2E du tunnel d'achat avec Stripe en mode test.
