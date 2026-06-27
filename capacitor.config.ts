import type { CapacitorConfig } from '@capacitor/cli';

// Wrapping natif iOS + Android de l'app web déployée.
//
// Mode `server.url` (PAS d'export statique) : l'app IRS est SSR + API routes
// (auth, Stripe, webhooks) → elle ne peut pas être exportée en HTML statique. La
// coque native charge donc le SITE DÉPLOYÉ. Conséquences :
//   ✅ les mises à jour web sont instantanées dans l'app (pas de re-review store)
//   ✅ 100% du code web réutilisé, zéro duplication
//   ⚠️ Apple Guideline 4.2 (« minimum functionality ») : une app qui n'est qu'un
//      site peut être refusée → on justifie par des plugins natifs (push, haptics,
//      scan caméra). Voir docs/CAPACITOR.md.
//
// `webDir` = écran de repli LOCAL (mobile-shell/) affiché si le serveur est
// injoignable. L'URL réelle se surcharge via CAPACITOR_SERVER_URL (staging/prod).

const config: CapacitorConfig = {
  appId: 'com.inrealsociety.app',
  appName: 'In Real Society',
  webDir: 'mobile-shell',
  backgroundColor: '#000000',
  server: {
    url: process.env.CAPACITOR_SERVER_URL || 'https://inrealsociety.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#000000',
  },
  android: {
    backgroundColor: '#000000',
  },
};

export default config;
