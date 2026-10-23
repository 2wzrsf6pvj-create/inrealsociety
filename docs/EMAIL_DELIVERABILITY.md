# Délivrabilité des emails

Les emails automatiques partent par Resend depuis **`mail.inrealsociety.com`** :
codes d'activation, scans, messages, réponses, premium, newsletter. C'est un
choix de Clément, qui suit la recommandation de Resend : une plainte pour spam
sur un email automatique ne pèse pas sur `hello@inrealsociety.com`. Les réponses
des destinataires vont à `hello@` (Reply-To).

Sources, lues le 22/10/2026 :
[domaine](https://resend.com/docs/add-a-domain),
[limites](https://resend.com/docs/api-reference/rate-limit),
[quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits),
[suppressions](https://resend.com/docs/dashboard/emails/email-suppressions),
[SMTP](https://resend.com/docs/send-with-smtp),
[règles Gmail](https://support.google.com/mail/answer/81126),
[SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

---

## 1. Domaine d'envoi dans Resend

1. Resend → *Domains* → *Add Domain* : **`mail.inrealsociety.com`**, pas le
   domaine principal.
2. Chez le registrar, copier **exactement** les enregistrements affichés par
   Resend. En général :
   - **SPF** : un `TXT` et un `MX` sur `send.mail` (le `TXT` contient
     `include:amazonses.com`, le `MX` pointe vers `feedback-smtp.<région>.amazonses.com`).
     Les domaines récents peuvent recevoir des `CNAME` à la place : suivre
     Resend ;
   - **DKIM** : un `TXT` sur `resend._domainkey.mail`.
3. Ne rien ajouter au SPF du domaine principal : Resend ne le demande pas.
4. Pièges fréquents :
   - la plupart des registrars attendent le nom relatif (`send.mail`), sans
     `inrealsociety.com` ;
   - certains ajoutent le domaine à la valeur du `MX` : terminer la valeur par
     un point.
5. Resend → *Verify*. La propagation peut prendre jusqu'à 72 h.
6. Vercel : `EMAIL_FROM` n'est à renseigner que pour changer d'expéditeur.
   Par défaut : `In Real Society <noreply@mail.inrealsociety.com>`.

## 2. DMARC, sur le domaine principal

`TXT` sur `_dmarc.inrealsociety.com` :

```
v=DMARC1; p=none; rua=mailto:dmarc@inrealsociety.com
```

- Il couvre aussi `mail.inrealsociety.com`.
- `rua` : une boîte qui existe, sinon retirer ce paramètre.
- `p=none` ne bloque rien et fait remonter des rapports. Avant de passer à
  `p=quarantine`, vérifier dans ces rapports que `hello@`, et tout service qui
  écrit au nom du domaine, passe SPF ou DKIM.
- Gmail exige DMARC au-delà de 5 000 emails par jour vers ses boîtes ; en
  dessous, il demande SPF ou DKIM. Le poser dès le départ ne coûte rien.

## 3. Offre et réglages Resend

- **Offre gratuite** : 100 emails par jour (journée UTC) et 3 000 par mois. Au
  delà, Resend refuse tout, codes d'activation compris, jusqu'à minuit UTC ou
  jusqu'au mois suivant.
- **Offre Pro** : 20 $/mois, 50 000 emails par mois, sans plafond quotidien.
  Recommandée dès le lancement.
- **Débit** : 10 requêtes par seconde pour tout le compte, quelle que soit
  l'offre. L'app réessaie quand Resend refuse pour débit, et la newsletter part
  par lots de 100 (un lot compte pour une requête).
- **Suivi des ouvertures et des clics** : laisser désactivé dans les réglages
  du domaine. L'app n'en a pas besoin, et le suivi des clics réécrit les liens
  des emails.

## 4. (Supabase) Emails d'inscription et de mot de passe

Sans SMTP personnalisé, Supabase n'envoie qu'aux membres de l'équipe du
projet, à raison de 2 emails par heure. La confirmation d'inscription
(obligatoire, cf. `MISE_EN_PRODUCTION.md`) et le mot de passe oublié ne
partiraient pas.

Supabase → *Authentication* → *Emails* → *SMTP Settings* :
- hôte `smtp.resend.com`, port `465`, utilisateur `resend` ;
- mot de passe : une clé API Resend ;
- expéditeur : une adresse en `@mail.inrealsociety.com`.

Puis *Rate Limits* : avec un SMTP personnalisé, Supabase part de 30 emails par
heure ; relever si besoin.

## 5. Vérifier

- Resend : le domaine est *Verified*.
- Depuis un terminal :
  ```bash
  dig TXT resend._domainkey.mail.inrealsociety.com +short
  dig TXT send.mail.inrealsociety.com +short
  dig MX  send.mail.inrealsociety.com +short
  dig TXT _dmarc.inrealsociety.com +short
  ```
- [mail-tester.com](https://www.mail-tester.com) : y envoyer un email de l'app,
  par exemple « Code perdu ? Renvoyer l'email » sur `/register`. Viser 9/10.
- Gmail → *Afficher l'original* : SPF, DKIM et DMARC à `PASS`.

## 6. Suivre

- **Google Postmaster Tools** : ajouter `inrealsociety.com`. C'est le seul
  endroit où voir le taux de plainte de Gmail, qui ne transmet pas les plaintes
  à Resend. À garder sous 0,1 %, jamais 0,3 %.
- **Resend → Emails** : rebonds et plaintes. Resend bloque d'office ces
  adresses pour tout le compte (liste de suppression).
- **Sentry et logs Vercel** : chaque refus de Resend est noté `[sendEmail]`,
  avec sa raison (quota, débit, domaine non vérifié, adresse invalide), et
  remonte dans Sentry, un problème par raison (`MONITORING.md`).

## 7. Ce que l'app fait déjà

- Version texte de chaque email : générée par Resend.
- Désinscription en un clic (`List-Unsubscribe`, reconnue par Gmail) :
  newsletter et emails de scan. Les emails de scan se coupent aussi dans les
  réglages (« Email au premier scan du jour »).
- Fréquences : un email de scan par jour au plus, un email de plafond par
  semaine au plus.
- Réponses dirigées vers `hello@`. Les emails de conversation précisent que
  répondre à l'email écrit à l'équipe, pas à l'autre personne.
- Liens écrits par un passant ou un porteur : masqués dans les emails
  (« [lien] »), lisibles dans la conversation.
- Email du passant confirmé avant toute réponse, avec un plafond par adresse.
