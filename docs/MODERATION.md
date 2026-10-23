# Modération : la marche à suivre

> Ce que fait l'équipe quand une alerte arrive : dans quel délai, quels gestes,
> qui prévenir. Les règles affichées aux utilisateurs sont à l'article 9 des
> CGV. Les obligations citées viennent du règlement européen sur les services
> numériques (DSA) : à faire relire par le juriste. État au 23 octobre 2026.

## 1. Ce que l'application fait seule

| Événement | Effet | Alerte (`ADMIN_ALERT_EMAIL`) |
|---|---|---|
| Texte jugé abusif par le filtre (OpenAI et liste de mots) : messages, réponses, prénom et contact du passant ; prénom, présentation et Instagram du porteur | ni transmis ni publié ; l'auteur voit pourquoi et comment contester | aucune (trace `message.moderated` ou `profile.moderated`) |
| Un porteur signale un message | message masqué aussitôt | « Signalement : un porteur a signalé un message » |
| Un appareil est signalé par 3 porteurs différents | appareil banni : il voit pourquoi en essayant d'écrire | « Signalement : appareil banni automatiquement » |
| N'importe qui signale un profil ou une conversation | rien n'est masqué ; accusé de réception à l'auteur qui a laissé son email | « Signalement : un profil a été signalé » ou « une conversation » |
| Nouvelle photo de profil | publiée tout de suite | « Photo de profil à vérifier » |

Sans `OPENAI_API_KEY`, le filtre se réduit à la liste de mots.

## 2. Délais cibles

| Gravité | Exemples | Délai |
|---|---|---|
| Urgence | menace de mort ou de violence, mineur en danger, contenu pédocriminel, incitation au suicide | immédiat : prévenir les autorités (section 5), puis suspendre ou bannir |
| Grave | harcèlement, contenu sexuel non sollicité, photo explicite, propos haineux | 24 heures |
| Courant | photo à vérifier, faux profil, spam, désaccord entre personnes | 72 heures |

Dans la messagerie : une règle qui met en avant les objets commençant par
« Signalement » et « Photo de profil », et les notifications activées sur le
téléphone.

## 3. Les gestes

**Dans l'administration, `/admin`** (réservée aux emails de `ADMIN_EMAILS`,
lien dans chaque alerte) : chaque signalement et chaque photo à vérifier y
figure avec ses boutons (suspendre, retirer la photo, bannir l'appareil,
clore), ainsi que les profils suspendus et les appareils bannis, avec de quoi
lever la mesure.

- Le motif saisi part au porteur concerné, avec la règle et le recours
  (section 4).
- Une case propose de prévenir l'auteur du signalement, s'il a laissé son
  email.
- Chaque décision s'inscrit dans `audit_logs` (qui, quoi, pourquoi) et clôt le
  signalement ; les dernières décisions s'affichent en bas de page.

**En secours**, Supabase → *SQL Editor*. Chaque alerte contient déjà les
requêtes, identifiant rempli. Chaque geste s'inscrit aussi dans `audit_logs` :
c'est la trace en cas de contestation.

```sql
-- Suspendre un profil (le porteur ne peut pas lever la pause lui-même)
UPDATE members SET suspended_at = now(), is_paused = true WHERE id = '<membre>';
INSERT INTO audit_logs (action, member_id, metadata) VALUES ('member.suspended', '<membre>', '{"motif": "modération"}');

-- Lever la suspension
UPDATE members SET suspended_at = NULL, is_paused = false WHERE id = '<membre>';
INSERT INTO audit_logs (action, member_id, metadata) VALUES ('member.unsuspended', '<membre>', '{"motif": "modération"}');

-- Bannir un appareil (jeton donné dans l'alerte)
INSERT INTO banned_devices (sender_token, reason) VALUES ('<jeton>', 'manuel') ON CONFLICT DO NOTHING;
INSERT INTO audit_logs (action, metadata) VALUES ('device.banned', '{"senderToken": "<jeton>", "motif": "modération"}');

-- Lever le bannissement
DELETE FROM banned_devices WHERE sender_token = '<jeton>';
INSERT INTO audit_logs (action, metadata) VALUES ('device.unbanned', '{"senderToken": "<jeton>"}');

-- Retirer une photo, puis supprimer le fichier : Storage → avatars → <membre>
UPDATE members SET photo_url = NULL WHERE id = '<membre>';
INSERT INTO audit_logs (action, member_id, metadata) VALUES ('member.photo_removed', '<membre>', '{"motif": "modération"}');

-- Masquer un message
UPDATE messages SET moderated = true WHERE id = '<message>';
INSERT INTO audit_logs (action, member_id, metadata) VALUES ('message.moderated', '<membre>', '{"messageId": "<message>", "motif": "modération"}');
```

Une conversation signalée par le passant se lit par le lien de l'alerte :
l'ouvrir ne change rien pour ses participants.

## 4. Informer les personnes

Le DSA demande d'informer la personne visée par une décision, avec ses motifs,
quand son adresse est connue (article 17), et l'auteur d'un signalement de la
suite donnée (article 16). Depuis `/admin`, ces emails partent seuls ; les
modèles ci-dessous servent après un geste fait en SQL, ou pour répondre à une
contestation. Envoyer depuis `hello@inrealsociety.com`. Ne jamais donner à
l'un l'identité ou le contact de l'autre.

**Au porteur dont le profil est suspendu**

> Objet : Votre profil In Real Society est suspendu
>
> Bonjour [prénom],
>
> Votre profil In Real Society est suspendu depuis le [date] : il n'est plus
> visible et ne reçoit plus de messages.
>
> Motif : [faits précis, par exemple « votre présentation contenait des propos
> insultants » ou « plusieurs personnes ont signalé des réponses insistantes
> après un refus »]. Cette décision applique l'article 9 de nos CGV
> (https://inrealsociety.com/cgv) [et, pour un contenu illégal, la loi en
> cause]. Elle a été prise par l'équipe après examen [d'un signalement / de
> notre propre initiative].
>
> Vous pouvez la contester en répondant à cet email. Vous pouvez aussi saisir
> le juge compétent.

**Au porteur dont la photo est retirée** : même modèle, avec « Votre photo de
profil a été retirée » et l'invitation à en choisir une autre.

**À l'auteur d'un signalement**

> Objet : Suite de votre signalement
>
> Bonjour,
>
> Votre signalement du [date] concernant [un profil / une conversation] a été
> examiné. Décision : [le profil a été suspendu / la photo a été retirée /
> aucune mesure, parce que le contenu ne nous paraît contraire ni à nos règles
> ni à la loi : …].
>
> Vous pouvez contester cette décision en répondant à cet email.

**Appareil banni** : l'écran lui dit la décision, sa raison et l'adresse pour
la contester. S'il écrit, examiner les messages signalés et lever le
bannissement si la décision était infondée.

## 5. Prévenir les autorités

Le DSA (article 18) impose de prévenir sans délai les autorités de tout
soupçon d'infraction qui menace la vie ou la sécurité d'une personne.

- Danger immédiat (menace de mort, de violence ou de suicide, mineur en
  danger) : **17** (police) ou **112**, sans attendre.
- Contenu illicite en ligne (pédocriminalité, terrorisme, haine, menaces) :
  plateforme **PHAROS**, https://www.internet-signalement.gouv.fr.
- Garder les preuves : ne rien supprimer de la base, masquer ou suspendre
  seulement ; captures d'écran datées.
- Demande de la police ou de la justice : répondre à une réquisition écrite.
  Données disponibles : contenus, dates, jeton d'appareil, adresse IP de
  certaines actions (journal d'audit, conservé 12 à 24 mois selon l'action).

## 6. Registre

Tenir un tableau : date, signalement, décision, motif, personnes informées,
contestation. Le journal d'audit garde déjà la trace des gestes ; le tableau
garde les motifs et le suivi. Les micro et petites entreprises sont dispensées
du rapport de transparence. Sur demande de l'Arcom, il faut pouvoir donner le
nombre moyen d'utilisateurs actifs par mois dans l'UE.

## 7. Avant le lancement

- [ ] `ADMIN_ALERT_EMAIL` sur une boîte lue chaque jour, notifications
      activées sur le téléphone.
- [ ] Accès à `/admin` : créer son compte (Supabase → *Authentication →
      Users → Add user*, case « Auto Confirm User » cochée), mettre son email
      dans `ADMIN_EMAILS` (Vercel), puis se connecter sur `/auth/login` et
      ouvrir `/admin`. Sans adresse confirmée, l'accès est refusé.
- [ ] `OPENAI_API_KEY` renseignée.
- [ ] Faire relire par le juriste : l'article 9 des CGV, ce document et ses
      modèles d'email.
