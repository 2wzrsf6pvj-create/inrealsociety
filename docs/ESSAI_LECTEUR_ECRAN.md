# Essai au lecteur d'écran (10 minutes)

Écouter le parcours du passant comme une personne aveugle ou malvoyante, sur
ton téléphone. Les tests automatiques (axe-core, clavier :
`e2e/db/accessibilite.spec.ts`) vérifient la structure des pages. Seule une
vraie écoute dit si le parcours se comprend.

**Il te faut** : ton téléphone, ton QR (ou le lien `/r/<code>` de ton profil),
ce guide ouvert sur un autre écran, un endroit calme, le volume à mi-hauteur.

**Fais l'essai en passant** : ouvre le lien dans un onglet de **navigation
privée** (ou déconnecte-toi). Connecté, tu verrais ton profil en tant que
propriétaire, pas ce que voit un passant. Le scan et le message de l'étape 4
compteront dans tes chiffres, et tu recevras les emails habituels : c'est
normal.

## 1. Allumer le lecteur d'écran (1 minute)

### iPhone : VoiceOver

- **Allumer** : Réglages > Accessibilité > VoiceOver. Plus simple pour la
  suite : Réglages > Accessibilité > Raccourci accessibilité > VoiceOver ;
  ensuite, trois clics sur le bouton latéral l'allument ou l'éteignent.
  Siri marche aussi : « Active VoiceOver ».
- **Gestes** :
  - balayer vers la droite (un doigt) : élément suivant ; vers la gauche :
    précédent ;
  - toucher deux fois, n'importe où : activer l'élément qui vient d'être lu ;
  - balayer vers le haut avec deux doigts : tout lire depuis le haut ;
  - **rotor** : tourner deux doigts sur l'écran, comme une molette, jusqu'à
    « Titres » ; ensuite, balayer vers le bas (un doigt) : titre suivant ;
  - faire défiler : balayer avec trois doigts ;
  - écrire : toucher deux fois le champ, puis taper ou dicter.

### Android : TalkBack

- **Allumer** : Paramètres > Accessibilité > TalkBack. Raccourci : maintenir
  les deux touches de volume 3 secondes (à activer une fois dans les réglages
  de TalkBack). L'Assistant marche aussi : « Active TalkBack ».
- **Gestes** :
  - balayer vers la droite : élément suivant ; vers la gauche : précédent ;
  - appuyer deux fois : activer l'élément qui vient d'être lu ;
  - menu TalkBack : appui à trois doigts (ou balayer vers le bas puis vers la
    droite), puis la lecture depuis le haut ;
  - **commandes de lecture** : balayer vers le haut puis vers le bas jusqu'à
    « Titres » ; ensuite, balayer vers le bas : titre suivant ;
  - faire défiler : balayer avec deux doigts.

Les noms des menus varient un peu selon la version du téléphone. Les mots que
tu entendras aussi (« titre » ou « en-tête », « bouton », « lien », « champ
de texte », « onglet », « boîte de dialogue ») dépendent du lecteur d'écran.
Ce qui compte, c'est le texte lu et l'ordre.

## 2. Le parcours du passant (6 minutes)

Coche chaque étape, ou note ce qui coince (ce que tu as entendu, mot pour
mot si possible).

- [ ] **1. Le profil.** Scanne ton QR avec l'appareil photo, puis balaie vers
  la droite d'élément en élément.
  - Tu dois entendre, dans l'ordre :
    - « Aller au contenu principal » et « Connexion », deux liens ;
    - « Mode plein soleil (haute lisibilité) », bouton ;
    - « profil », puis **ton prénom, lu comme un mot** ;
    - « Quelque chose vous a arrêté. C'est rare. », titre de niveau 1 ;
    - ta présentation, puis « Ce vêtement est une invitation à la
      conversation… » ;
    - « Lui envoyer un message », lien ;
    - ton Instagram ;
    - la question « Partager votre ville approximative… » et ses deux
      boutons ;
    - « Occasion éphémère » et le temps restant ;
    - « retour » (souvent précédé de « flèche gauche » : c'est normal),
      « Signaler ce profil », « Vos données ».
  - Problème si :
    - ton prénom est épelé lettre par lettre ;
    - une lettre seule est lue avant lui (l'initiale de l'avatar) ;
    - un symbole est lu (« étoile », « losange »…).
- [ ] **2. Les titres.** Rotor ou commandes de lecture sur « Titres » : un seul
  titre, celui de l'étape 1.
- [ ] **3. La page message.** Active « Lui envoyer un message ».
  - Tu dois entendre :
    - le nom de la page, « Envoyer un message — In Real Society » ;
    - puis, en balayant, « Un signal discret. », titre de niveau 1 ;
    - la mention « Réservé aux 18 ans et plus… » ;
    - les champs « Votre prénom (optionnel) » et « Votre @instagram ou email
      (recommandé) », chacun avec sa phrase d'aide. Le nom est lu deux fois,
      une fois comme texte et une fois avec le champ : c'est normal ;
    - les boutons « Belle audace. », « J'aime la démarche. », « Envoyer un
      clin d'œil » ;
    - le champ « Message libre ».
  - Problème si :
    - un champ est annoncé sans son nom (« champ de texte » seul) ;
    - un symbole est lu devant les réponses rapides ;
    - tu entends « œil » deux fois.
- [ ] **4. L'envoi.** Écris « Essai lecteur d'écran » dans « Message libre »,
  puis active « Envoyer ».
  - Tu dois entendre aussitôt, sans rien chercher : « Signal envoyé. », titre
    de niveau 1. C'est le point le plus important : une personne aveugle doit
    savoir que son message est parti.
  - Problème si : silence, ou la lecture repart du haut de la page.
- [ ] **5. La conversation.** Active « Voir la conversation ».
  - Tu dois entendre :
    - « Conversation avec » suivi de ton prénom, titre de niveau 1 ;
    - ton message ;
    - « En attente de réponse » ;
    - « Me notifier de sa réponse », bouton.
- [ ] **6. Une réponse qui arrive** (avec un deuxième appareil). Laisse le
  téléphone sur la conversation, lecteur d'écran allumé. Sur l'autre appareil,
  connecte-toi et réponds depuis « Mon espace ».
  - Tu dois entendre ta réponse **sans toucher au téléphone**, quelques
    secondes après l'envoi.
- [ ] **7. Plein soleil.** Active « Mode plein soleil ».
  - Tu dois entendre le bouton changer de nom : « Revenir au mode sombre ».

## 3. Côté porteur (3 minutes, facultatif)

- [ ] **8. « Mon espace ».** Connecte-toi.
  - Tu dois entendre :
    - le nom de la page, « Mon espace — In Real Society » ;
    - « Bienvenue » et ton prénom, titre de niveau 1 ;
    - les onglets « Accueil », « Messages » (avec le nombre de messages non
      lus) et « Réglages », celui affiché annoncé comme sélectionné ;
    - si tu as déjà des scans, des chiffres lus en phrases, par exemple « 2
      scans au total », « 1 scan ces 7 derniers jours ».
- [ ] **9. La présentation** (visible une seule fois par appareil : pour la
  revoir, ouvre « Mon espace » en navigation privée).
  - Tu dois entendre une boîte de dialogue « Bienvenue, … », puis « Suivant ».
  - En balayant, tu restes dans la fenêtre : « Passer », le texte, l'écran
    « 1 sur 3 », « Suivant ».
  - « Suivant » fait lire l'écran suivant.
- [ ] **10. Répondre.** Onglet « Messages », puis « Répondre ».
  - Tu dois entendre le champ « Votre réponse ».

## 4. Me renvoyer le résultat

Copie la liste avec, pour chaque étape, « OK » ou ce que tu as entendu.
Ajoute :
- le modèle du téléphone et sa version (iOS ou Android) ;
- le navigateur (Safari, Chrome) ;
- si le site était ouvert dans l'app installée ou dans le navigateur.
