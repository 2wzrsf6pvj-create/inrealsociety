Assets d'impression — POUR LES MOCKUPS MARKETING.

⚠️ Le QR ci-dessous n'est PAS le fichier d'impression des vraies commandes : le QR réel
est généré PAR MEMBRE au fulfillment (src/lib/fulfillment.ts → generatePremiumQRCode),
avec l'URL courte unique du porteur. Celui-ci encode juste https://inrealsociety.com
pour "faire vrai" sur une photo produit.

Le MONOGRAMME poitrine, lui, est bien imprimé sur les vraies commandes — mais généré en
code (generateBrandMonogramSVG) et uploadé dans Supabase Storage, pas lu depuis ce dossier.
Le design est identique. Coupe-le via PRINT_FRONT_LOGO = false (src/lib/constants.ts) —
deux emplacements d'impression coûtent plus cher chez Printful.

  qr-back-dark.svg     ← DOS, t-shirt NOIR  : QR or (#C5A059), fond transparent
  qr-back-light.svg    ← DOS, t-shirt BLANC : QR navy (#0A192F) + logo )( or
  logo-front-dark.svg  ← POITRINE, tee noir  : monogramme )( or
  logo-front-light.svg ← POITRINE, tee blanc : monogramme )( navy

Vectoriels (fond transparent) → scalables sans perte pour l'impression DTF.

USAGE — Printful Mockup Generator (gratuit) :
  1. Produit : Comfort Colors 1717, couleur Noir (puis Blanc).
  2. Placement DOS  → qr-back-{dark|light}.svg   (grand, ~30 cm)
  3. Placement FACE → logo-front-{dark|light}.svg (petit ~8-10 cm, cœur/poitrine gauche)
  4. Générer, télécharger, recadrer en carré ~1000x1000, exporter en .webp
  5. Déposer dans public/shop/ sous les noms attendus (cf. public/shop/README.txt)
     puis passer SHOP_IMAGES_READY = true dans src/lib/constants.ts

Régénérer les QR : appeler generatePremiumQRCode(url, 'dark'|'light') et écrire le SVG.
Les monogrammes )( sont écrits à la main (deux arcs quadratiques, stroke-linecap round).

previews/ (gitignoré) : aperçus PNG des formes de modules (net / arrondi / doux / dots),
utilisés pour comparer. Les dots pleins NE décodent PAS sur tee noir — cf. le test
src/__tests__/qr-decode.test.ts et l'ADR « Formes de QR ».
