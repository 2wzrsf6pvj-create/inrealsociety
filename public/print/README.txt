Assets d'impression.

Régénérer :  npx tsx scripts/print-assets.mts
Le code est la source de vérité (src/lib/generate-qr-svg.ts). Ne PAS éditer ces SVG à la main.

  qr-back-dark.svg     ← DOS, t-shirt NOIR  : QR BLANC, fond transparent
  qr-back-light.svg    ← DOS, t-shirt BLANC : QR NOIR,  fond transparent
  logo-front-dark.svg  ← POITRINE, tee noir  : monogramme )( BLANC
  logo-front-light.svg ← POITRINE, tee blanc : monogramme )( NOIR
  scan-test-A4.svg     ← feuille de test de distance (voir plus bas)

LE PRINT EST MONOCHROME. Une seule encre par tee : blanc sur noir, noir sur blanc.
C'est le contraste maximal pour un lecteur de QR — la scannabilité à distance EST la
fonction du produit. L'or #C5A059 reste la couleur de la marque à l'écran, plus sur le
vêtement.

PAS DE QUIET ZONE dans le fichier. Le fond est transparent : le tissu la fournit, à
l'infini et gratuitement. Les 2 modules de marge qu'on imprimait mangeaient 12 % de la
largeur utile, donc 12 % de distance de scan.
  ⚠️ Corollaire : ne RIEN imprimer d'autre dans les ~3,5 cm autour du QR.

TAILLE = DISTANCE DE SCAN. La distance de lecture fiable ≈ 10× la largeur du QR (le
capteur doit résoudre chaque module) ; ce ratio tombe à ~7:1 en lumière faible.
  BACK_POSITION = 1476 px = 25,0 cm  →  ~2,5 m en bonne lumière, ~1,8 m le soir.
Un 2,5 m garanti EN TOUTES CONDITIONS demanderait 36 cm : impossible sur une zone de
30,5 cm (12"). Il faudrait un produit à zone 16".

⚠️ SHORT_DOMAIN change la portée. Sans lui, le QR encode
`https://<app>.vercel.app/r/<code>` → 37 modules au lieu de 29 → modules plus petits →
portée ~2,0 m au lieu de ~2,5 m. fulfillOrder émet un warning si ça arrive.

Le QR ci-dessus n'est PAS le fichier des vraies commandes : le QR réel est généré PAR
MEMBRE au fulfillment, avec l'URL courte unique du porteur. Celui-ci sert aux mockups.
Le MONOGRAMME poitrine, lui, est bien celui des vraies commandes (généré en code, uploadé
dans Supabase Storage, pas lu depuis ce dossier). Coupe-le via PRINT_FRONT_LOGO = false —
deux emplacements coûtent plus cher chez Printful.


TESTER LA DISTANCE AVANT DE COMMANDER  (scan-test-A4.svg)
---------------------------------------------------------
Le rapport distance/taille est INVARIANT D'ÉCHELLE. 25 cm ne rentre pas sur une A4 — mais
un QR de 15 cm lisible à 1,50 m prouve qu'un QR de 25 cm le sera à 2,50 m (même angle
sous-tendu, même nombre de modules par pixel de capteur).

  1. Imprimer scan-test-A4.svg à 100 % (surtout PAS « ajuster à la page »).
  2. Vérifier à la règle que la barre d'étalonnage fait bien 100 mm.
  3. Reculer jusqu'à 1,50 m et scanner.

La feuille encode une URL de la MÊME longueur que la vraie (29 modules) : elle teste le
bon QR. Le lien ne mène nulle part — on teste la lecture, pas la destination.

Papier blanc, plat, bien éclairé = meilleur cas. Sur tissu (texture, plis, dos courbe,
lumière du soir) compter ~30 % de moins. Le test sur un échantillon physique reste le
juge final.


USAGE — Printful Mockup Generator (gratuit)
-------------------------------------------
  1. Produit : Comfort Colors 1717, couleur Noir (puis Blanc).
  2. Placement DOS  → qr-back-{dark|light}.svg   (25 cm de large)
  3. Placement FACE → logo-front-{dark|light}.svg (petit ~8-10 cm, poitrine gauche)
  4. Générer, télécharger, recadrer en carré ~1000x1000, exporter en .webp
  5. Déposer dans public/shop/ (cf. public/shop/README.txt) puis passer
     SHOP_IMAGES_READY = true dans src/lib/constants.ts

  ⚠️ À VALIDER dans le Mockup Generator : les dimensions RÉELLES de la zone d'impression
  pour le DOS et pour la FACE. Le code suppose 1800x2400 pour les deux, ce que Printful
  ne garantit pas. Vérifier aussi de quel côté tombe le monogramme.

previews/ (gitignoré) : aperçus PNG des formes de modules. Les dots pleins NE décodent
PAS sur tee noir — cf. src/__tests__/qr-decode.test.ts et l'ADR « Formes de QR ».
