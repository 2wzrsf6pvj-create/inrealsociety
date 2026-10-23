# App mobile — app installable, puis iOS et Android

## Décision (23/10/2026)
D'abord **l'app installable depuis le site** (écran d'accueil, notifications du
site). Les apps des magasins viendront **après le test terrain, si les porteurs
la demandent**.

Pourquoi : une app des magasins ferait aujourd'hui moins que le site (pas de
notifications sans push natif, cf. plus bas). Elle demanderait aussi plusieurs
semaines, des frais, et s'exposerait aux risques de refus listés au § « Le jour
des magasins ».

## L'app installable (aujourd'hui)
- **iPhone** : dans Safari, Partager (sous « ⋯ » depuis iOS 26) → « Sur l'écran
  d'accueil ». Les notifications n'existent que dans l'app ouverte depuis
  l'icône (iOS 16.4+) ; dans Safari, l'API n'existe même pas. « Mon espace »
  l'explique au porteur sur iPhone, la conversation l'explique au passant.
- **Android** : Chrome propose l'installation. Les notifications marchent aussi
  dans le navigateur.
- **Où elle s'ouvre** : sur l'adresse de départ du manifeste, pas sur la page
  elle-même (`src/lib/web-manifest.ts`) :
  - accueil du site (`/manifest.json`) ;
  - « Mon espace » (`/dashboard/manifest.webmanifest`) ;
  - la conversation (`/conversation/<id>/manifest.webmanifest`).
- **Piège de Safari** : il ne lit le manifeste qu'une fois, au chargement de la
  page (WebKit, `DocumentLoader::loadApplicationManifest`). Arrivé par une
  navigation interne de Next, le visiteur installerait le manifeste de la page
  précédente. On arrive donc sur la conversation et, après la connexion, sur
  « Mon espace » par un chargement complet (`src/lib/full-page.ts`, ou `<a href>`
  plutôt que `<Link>`). Chrome, lui, suit les changements.
- **Piège de Next.js 16** : quand `generateMetadata` attend la base (profil,
  conversation…), Next envoie les métadonnées de la page après coup, dans le
  `<body>`. Il ne remet ensuite dans le `<head>` que les icônes. Or Chrome et
  Safari n'y cherchent pas le manifeste. La conversation pose donc le sien, et
  les balises Apple, dans son `layout.tsx`, rendu sans attente : React les place
  dans le `<head>`. Une autre page à rendre installable devra faire de même.
- **Icônes** : `node scripts/build-app-icons.mjs` régénère les PNG depuis le
  monogramme (écran d'accueil iPhone, Android normale et adaptative, badge des
  notifications). `app-installable.test.ts` échoue si un fichier n'est plus à jour.
- **Notifications** : déjà accordées, l'abonnement de l'appareil est renvoyé au
  serveur à chaque visite de « Mon espace » ; s'il n'existe plus, le bouton
  revient. Un échec d'activation n'est plus annoncé comme une réussite. À la
  déconnexion, l'appareil est désabonné : il ne reçoit plus l'aperçu des
  messages du porteur.
- **Mesure** (/admin, « Notifications ») : à chaque ouverture de « Mon espace »
  depuis un téléphone, le serveur relève iPhone ou Android. L'app installée
  s'ouvre sur `/dashboard?src=app` (`/?src=app` installée depuis une autre page,
  que le proxy fait suivre) : la première ouverture depuis l'app est datée
  (`src/lib/phone.ts`, migration 062). D'où la part des porteurs sur iPhone qui
  ont installé l'app, et de ceux qui sont prévenus. Sur iPhone, une app
  installée avant cette mesure garde son ancienne adresse de départ : la
  réinstaller pour qu'elle compte.
- **Hors connexion** : le service worker ne garde que les pages publiques
  fixes (accueil, boutique, manifeste, CGV, confidentialité), sans cookies.
  Ailleurs, l'app installée affiche une page « Pas de connexion » avec
  « Réessayer ». Rien de personnel n'entre dans Cache Storage.
- **Session** : depuis iOS 17.2, l'ajout à l'écran d'accueil copierait les
  cookies (iGeneration ; Apple l'a annoncé pour macOS). Le porteur resterait
  connecté, et le passant garderait le droit de répondre (cookie de l'appareil
  d'origine). Safari et l'app partagent alors la même session Supabase : une
  déconnexion des deux est possible quand l'un renouvelle la session. Avant
  iOS 17.2, le porteur se reconnecte dans l'app ; le passant peut y activer les
  notifications, mais répond depuis Safari.
- **À vérifier sur un vrai iPhone avant le test terrain** :
  - icône sur l'écran d'accueil ;
  - ouverture sur « Mon espace », toujours connecté, après quelques jours ;
  - barre d'état noire, sans texte par-dessus ;
  - notification reçue app fermée ;
  - /admin, recherche du porteur : « iPhone · app installée » après une
    ouverture depuis l'icône ;
  - parcours réel du passant : QR → profil → message → « Voir la
    conversation » → ajout à l'écran d'accueil. L'app doit rouvrir la
    conversation, et le passant doit pouvoir y répondre ;
  - mode avion : page « Pas de connexion ».

## Le jour des magasins : ce qu'il faudra

### 1. Des notifications natives (indispensable)
Le push du site (Web Push, VAPID) **n'existe pas dans une WebView**, ni sur
iPhone ni sur Android (données MDN `browser-compat-data` : `PushManager` et
`Notification` absents de « WebView iOS » et « WebView Android »). Dans l'app,
le bouton « Être prévenu·e » disparaîtrait. Il faut :
- le plugin `@capacitor/push-notifications` ;
- Firebase (FCM) pour Android (`google-services.json` dans `android/app/`), une
  clé APNs (.p8) et la capability Push dans Xcode pour iOS ;
- l'envoi côté serveur (FCM HTTP v1, compte de service en variable Vercel) ;
- une table des jetons natifs, à côté de `push_subscriptions` (endpoints web),
  migration comprise ;
- côté site : détecter l'app native et proposer le bon bouton.

### 2. Un écran hors connexion
`capacitor.config.ts` charge le site en ligne (`server.url`). La documentation
de Capacitor 8.4 l'écrit sous cette option : « This is intended for use with
live-reload servers. **This is not intended for use in production.** » Sans
`server.errorPath`, l'app hors connexion affiche un écran vide. Le code de
Capacitor ne charge une page locale qu'avec cette option. C'est ce que testent
les vérificateurs d'Apple pour repérer un site emballé. À faire :
`server.errorPath` vers une page locale de `mobile-shell/` avec « Réessayer ».

### 3. Le premium
- **iPhone** : un abonnement qui débloque des fonctions passe par l'achat
  intégré d'Apple (règle 3.1.1). Un premium acheté sur le site et seulement
  utilisé dans l'app doit en principe exister aussi en achat intégré (3.1.3(b)).
  Le plus simple : aucun achat, prix ni lien vers le premium dans l'app iPhone
  (hors États-Unis). Le risque restant (3.1.3(b)) est à assumer ou à poser à
  Apple.
- **Android** : Google Play Billing ; ou, depuis le 30/06/2026 dans l'UE, un
  paiement externe avec commission (de l'ordre de 10 % sur les abonnements, à
  vérifier dans la console).
- **Le t-shirt** reste payé par Stripe : bien physique (3.1.3(e)).

### 4. Les risques de refus chez Apple (règles du 16/10/2026)
- **1.2** : les apps de « random or anonymous chat » « do not belong on the
  App Store and may be removed without notice » (ajout de début 2026). Le passant
  écrit sans compte : présenter la rencontre en personne, l'email du passant
  vérifié, le filtre, le signalement, le blocage, les 18 ans.
- **4.3(b)** : Apple n'accepte plus de nouvelle app de rencontre (« dating »)
  sans « a meaningfully different or improved experience ».
- **4.2** : l'app doit être plus qu'« a repackaged website ». D'où les
  notifications natives, l'écran hors connexion, et éventuellement
  `@capacitor/haptics` (`navigator.vibrate` n'existe pas sur iPhone).
- **Déjà conformes** :
  - 1.2 : filtre, signalement, blocage, contact publié ;
  - 5.1.1(v) : suppression du compte dans l'app (Réglages) ;
  - 18 ans minimum.

### 5. Comptes, frais, délais
- **Apple Developer** : environ 99 € par an. Il faut un Mac avec Xcode, ou un
  service de compilation en ligne. Un compte individuel affiche ton nom légal
  comme vendeur ; un compte d'organisation demande un numéro D-U-N-S (gratuit).
- **Google Play** : 25 $ une fois. Un compte personnel créé après le 13/11/2023
  doit faire tester l'app en test fermé par 12 testeurs pendant 14 jours
  d'affilée avant la production ; un compte d'organisation en est dispensé
  (D-U-N-S). Chiffres de sources secondaires, à confirmer dans la console.
- **DSA** : déclarer son statut de professionnel (« trader »). Apple publie
  l'adresse, le téléphone et l'email sur la fiche de l'app dans l'UE.
- **Fiches des magasins** :
  - données collectées (App Privacy, Data safety) : email, prénom, photo,
    messages, ville des scans, mesure d'audience, erreurs ;
  - classification 18+ ;
  - icône 1024 × 1024 plein cadre, sans transparence. `public/print/app-icon.png`
    a des coins transparents.

## Commandes Capacitor
Config : `capacitor.config.ts` (racine). Contenu local : `mobile-shell/`.

### Prérequis
- iOS : macOS, Xcode, CocoaPods (`sudo gem install cocoapods`), compte Apple
  Developer.
- Android : Android Studio (SDK), compte Google Play.

### Générer les projets natifs (une fois, en local)
```bash
npm install                       # déps Capacitor déjà dans package.json
npm run cap:add:ios               # crée ios/   (Xcode + CocoaPods)
npm run cap:add:android           # crée android/ (Android Studio)
npm run cap:sync                  # copie la config + plugins dans les projets natifs
```
`cap add` génère de gros dossiers `ios/` et `android/`. Les committer pour
versionner la config native (signature, entitlements push).

### Pointer vers le bon serveur
Par défaut `capacitor.config.ts` pointe sur `https://inrealsociety.vercel.app`.
Surcharge avant un `cap sync` :
```bash
CAPACITOR_SERVER_URL="https://staging.inrealsociety.app" npm run cap:sync
```

### Lancer / déboguer
```bash
npm run cap:ios       # ouvre Xcode → Run sur simulateur/appareil
npm run cap:android   # ouvre Android Studio → Run
```

### Icônes et écran de lancement
```bash
npm i -D @capacitor/assets
npx capacitor-assets generate   # depuis assets/icon.png (1024², plein cadre) + assets/splash.png (2732², fond noir)
```

### Compilation et soumission
- iOS : Xcode → Archive → App Store Connect → TestFlight → review.
- Android : Android Studio → Generate Signed Bundle (.aab) → Play Console → review.

## Notes
- Le passant ne télécharge jamais l'app : il scanne, le navigateur s'ouvre. Les
  magasins visent le porteur et la présence de la marque.

## Sources (consultées le 23/10/2026)
- Règles d'Apple, mises à jour le 16/10/2026 :
  https://developer.apple.com/app-store/review/guidelines/
- Apple, DSA et vendeurs :
  https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements
- Google, facturation dans l'UE depuis le 30/06/2026 :
  https://support.google.com/googleplay/android-developer/answer/17161464
- 12 testeurs, 14 jours (source secondaire) :
  https://www.testerscommunity.com/blog/google-play-closed-testing-requirements-2026
- Compatibilité des navigateurs : `@mdn/browser-compat-data` 8.1.7 (`api.PushManager`,
  `api.Notification`, `manifests.webapp.icons`, `api.Navigator.vibrate`).
- Capacitor 8.4.3 : `node_modules/@capacitor/cli/dist/declarations.d.ts` (`server.url`,
  `server.errorPath`) et `WebViewDelegationHandler.swift` / `BridgeWebViewClient.java`.
- WebKit, lecture du manifeste une fois par chargement (`loadApplicationManifest`) :
  https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/DocumentLoader.cpp
- Cookies copiés à l'ajout (iOS 17.2) :
  https://www.igen.fr/ios/2023/12/ios-172-et-macos-142-ameliorent-leur-gestion-des-web-apps-141013
- Partager sous « ⋯ » (iOS 26) :
  https://www.ithinkdiff.com/add-web-app-bookmark-iphone-home-screen-ios-26/
