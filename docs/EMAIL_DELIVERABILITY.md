# Email deliverability — SPF / DKIM / DMARC

Sans ces 3 enregistrements DNS sur `inrealsociety.com`, les emails d'activation
envoyés via Resend ont une probabilité significative d'atterrir en spam — ce qui
casse silencieusement le tunnel d'onboarding (client paie → ne reçoit jamais son
code → support overload).

Cette doc explique **exactement quels enregistrements ajouter** chez ton
registrar (OVH, Gandi, Cloudflare, etc.) et **comment vérifier** que la config
est bonne.

---

## 1. SPF (Sender Policy Framework)

**Quoi** : autorise Resend à envoyer des emails au nom de ton domaine.

**Type d'enregistrement** : `TXT` sur `inrealsociety.com` (ou `@`)

**Valeur** :
```
v=spf1 include:_spf.resend.com ~all
```

Si tu utilises d'autres services qui envoient au nom du domaine (ex. Google
Workspace pour la boîte support), ajoute-les :
```
v=spf1 include:_spf.resend.com include:_spf.google.com ~all
```

⚠️ Un seul enregistrement SPF par domaine. Si tu en as déjà un, complète-le.

---

## 2. DKIM (DomainKeys Identified Mail)

**Quoi** : signe cryptographiquement chaque email pour prouver qu'il vient bien
de ton domaine.

Resend génère **automatiquement** les enregistrements DKIM quand tu vérifies ton
domaine dans leur dashboard.

**Étapes** :
1. Aller sur [resend.com/domains](https://resend.com/domains)
2. Cliquer "Add Domain" → entrer `inrealsociety.com`
3. Resend affiche 3 enregistrements DKIM à ajouter — typiquement :
   ```
   resend._domainkey.inrealsociety.com  CNAME  resend._domainkey.<resend-id>.dkim.resend.com
   resend2._domainkey.inrealsociety.com CNAME  resend2._domainkey.<resend-id>.dkim.resend.com
   resend3._domainkey.inrealsociety.com CNAME  resend3._domainkey.<resend-id>.dkim.resend.com
   ```
4. Coller ces 3 lignes dans ton DNS
5. Retourner sur Resend → cliquer "Verify" — doit passer en vert

---

## 3. DMARC (Domain-based Message Authentication)

**Quoi** : indique aux serveurs receveurs (Gmail, Outlook, etc.) quoi faire des
emails qui échouent SPF/DKIM, et où envoyer les rapports.

**Type d'enregistrement** : `TXT` sur `_dmarc.inrealsociety.com`

**Valeur** (mode démarrage, mode permissif) :
```
v=DMARC1; p=none; rua=mailto:dmarc-reports@inrealsociety.com; pct=100
```

- `p=none` : ne rejette rien pour l'instant, mais collecte des rapports
- `rua=mailto:...` : où recevoir les rapports d'agrégation (doit être un email
  qui existe — sinon, omets cette ligne)
- `pct=100` : applique la politique à 100% des emails

**Après 2-4 semaines de monitoring**, passer en mode strict :
```
v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@inrealsociety.com; pct=100
```

Puis éventuellement `p=reject` quand SPF/DKIM sont stables sur 100% du trafic.

---

## 4. Vérification

Après propagation DNS (5-30 min) :

```bash
# Vérifier SPF
dig TXT inrealsociety.com +short | grep spf

# Vérifier DKIM (remplace <selector> par 'resend')
dig TXT resend._domainkey.inrealsociety.com +short

# Vérifier DMARC
dig TXT _dmarc.inrealsociety.com +short
```

**Outils en ligne** :
- [mxtoolbox.com/SuperTool](https://mxtoolbox.com/SuperTool.aspx) — analyse tout d'un coup
- [mail-tester.com](https://www.mail-tester.com) — envoie un test, donne un score /10
- [dmarcian.com/dmarc-inspector](https://dmarcian.com/dmarc-inspector/) — analyse DMARC

**Cible** : score mail-tester ≥ 9/10. En dessous, lire les recommandations.

---

## 5. Test final manuel

1. Envoyer un email de test via Resend à :
   - une Gmail
   - une Outlook/Hotmail
   - une Yahoo
   - une Apple iCloud
2. Vérifier qu'il arrive **dans la boîte de réception, pas en spam**
3. Vérifier les headers (Gmail : trois points → "Afficher l'original") :
   - `SPF: PASS`
   - `DKIM: PASS`
   - `DMARC: PASS`

Si l'un de ces 3 est `FAIL`, retourner aux étapes correspondantes.

---

## 6. Bonnes pratiques complémentaires

- **From address** : utiliser `<nom-de-personne>@inrealsociety.com`, pas
  `noreply@`. Les filtres anti-spam pénalisent `noreply`.
- **Reply-To** : configurer un Reply-To qui pointe sur une vraie boîte mail
  (pour que les utilisateurs puissent répondre).
- **Limite d'envoi initial** : Resend limite à ~3000 emails/jour sur les
  nouveaux domaines. Augmente progressivement le volume au fil des semaines.
- **Liste de désinscription** : pour les emails marketing (pas transactionnels),
  ajouter un header `List-Unsubscribe` avec lien de désinscription en 1 clic
  (obligatoire Gmail/Yahoo depuis 2024 pour les envois en masse).

---

## 7. Monitoring continu

- **Rapports DMARC hebdomadaires** : Resend les agrège dans son dashboard,
  ou tu reçois des XML à parser sur `rua=mailto:`
- **Alerte si bounce rate > 5%** : config Sentry alert sur l'event
  `order.email_failed` qu'on a déjà câblé (voir [src/lib/audit.ts](../src/lib/audit.ts))
- **Suivi délivrabilité** : Resend dashboard → tab "Logs" pour voir les bounces,
  complaints, ouvertures.
