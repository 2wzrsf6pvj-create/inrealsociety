# App mobile (Capacitor) — iOS + Android

Wrapping natif de l'app web déployée, en **mode `server.url`** : la coque native
charge le site déployé (l'app est SSR + API routes → pas d'export statique possible).
→ MAJ web instantanées dans l'app, 100% du code réutilisé.

Config : `capacitor.config.ts` (racine). Écran de repli : `mobile-shell/index.html`.

## Prérequis
- **iOS** : macOS + **Xcode** + CocoaPods (`sudo gem install cocoapods`) + compte
  **Apple Developer** (99 $/an).
- **Android** : **Android Studio** (SDK) + compte **Google Play** (25 $ une fois).

## 1. Générer les projets natifs (une fois, en local)
```bash
npm install                       # déps Capacitor déjà dans package.json
npm run cap:add:ios               # crée ios/   (nécessite Xcode + CocoaPods)
npm run cap:add:android           # crée android/ (nécessite Android Studio)
npm run cap:sync                  # copie la config + plugins dans les projets natifs
```
> ⚠️ `cap add` génère de gros dossiers `ios/` et `android/`. À committer si tu veux
> versionner la config native (signing, entitlements push…) — recommandé pour shipper.

## 2. Pointer vers le bon serveur
Par défaut `capacitor.config.ts` pointe sur `https://inrealsociety.vercel.app`.
Surcharge via env avant un `cap sync` :
```bash
CAPACITOR_SERVER_URL="https://staging.inrealsociety.app" npm run cap:sync
```

## 3. Lancer / debugger
```bash
npm run cap:ios       # ouvre Xcode → Run sur simulateur/appareil
npm run cap:android   # ouvre Android Studio → Run
```

## 4. Icônes & splash
```bash
npm i -D @capacitor/assets
npx capacitor-assets generate   # à partir d'un logo source (1024x1024) + splash
```
Place un `assets/icon.png` (1024²) et `assets/splash.png` (2732², fond noir, logo )( ).

## 5. Notifications push (le porteur en a besoin)
La PWA utilise le web push (VAPID). En natif, il faut le push NATIF :
```bash
npm i @capacitor/push-notifications
```
- **iOS** : APNs (clé .p8 dans Apple Developer) + capability Push dans Xcode.
- **Android** : Firebase (FCM) → `google-services.json` dans `android/app/`.
- Côté code : enregistrer le token natif et l'envoyer à `/api/push/subscribe`
  (à adapter — le schéma push actuel est web/VAPID).

## 6. ⚠️ Apple Guideline 4.2 (« minimum functionality »)
Apple **refuse** souvent les apps qui ne sont « qu'un site web ». Pour passer :
- Utiliser de vrais **plugins natifs** : `@capacitor/push-notifications`,
  `@capacitor/haptics` (remplace le `navigator.vibrate` web), éventuellement
  `@capacitor/camera`/un scanner de QR natif.
- Offrir une vraie valeur « app » au porteur (notifs, accès rapide dashboard).
- Le scanneur, lui, **reste web** (QR → navigateur) — l'app native vise le porteur.

## 7. Build & soumission
- **iOS** : Xcode → Archive → App Store Connect → TestFlight → review.
- **Android** : Android Studio → Generate Signed Bundle (.aab) → Play Console → review.

## Notes
- Le scanneur ne télécharge JAMAIS l'app (scan → navigateur). L'app store vise le
  porteur + la présence de marque. Cf. ADR app mobile.
- Pré-PMF : c'est optionnel. La PWA couvre déjà l'install + push web.
