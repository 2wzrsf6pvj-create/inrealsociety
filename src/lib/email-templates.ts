// src/lib/email-templates.ts
// Tous les templates d'email Resend au même endroit.
// Modifier le design ici = modifier tous les emails d'un coup.

import crypto from 'crypto';
import { escapeHtml } from '@/lib/escape-html';
import { maskLinks } from '@/lib/mask-links';
import {
  EMAIL_FROM, RESEND_API_URL, APP_URL, CONTACT_EMAIL,
  PREMIUM_PERKS, PREMIUM_PRICE_LABEL, PREMIUM_WITHDRAWAL_DAYS,
} from '@/lib/constants';
import type { OrderRecap } from '@/lib/order-recap';

// ─── Wrapper HTML commun ──────────────────────────────────────────────────────

function layout(content: string): string {
  return `
    <div style="background:#000;color:#fff;font-family:Georgia,serif;padding:48px 32px;max-width:480px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:40px;">
        <div style="width:50px;height:50px;border-radius:50%;border:1px solid rgba(255,255,255,0.3);display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
          <span style="font-size:20px;font-weight:300;">✦</span>
        </div>
        <p style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:0.3em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin:0;">In Real Society</p>
      </div>
      ${content}
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.15);text-align:center;margin-top:48px;">
        In Real Society · The IRL Social Club
      </p>
    </div>
  `.trim();
}

/** Relance : compte créé mais profil non finalisé → t-shirt en attente. */
export function emailProfileReminder(params: { registerUrl: string }): { subject: string; html: string } {
  return {
    subject: 'Votre t-shirt attend — finalisez votre profil',
    html: layout(`
      <h1 style="font-size:26px;font-weight:300;letter-spacing:0.04em;margin:0 0 8px;text-align:center;">Il vous reste une étape.</h1>
      <p style="font-size:15px;font-weight:300;color:rgba(255,255,255,0.7);line-height:1.7;text-align:center;margin:0 0 8px;">
        Votre compte est créé, mais votre profil ne l'est pas encore — et c'est lui
        qui active votre t-shirt. Quelques secondes suffisent (gardez votre code
        d'activation sous la main).
      </p>
      ${cta('Finaliser mon profil', params.registerUrl)}
    `),
  };
}

/** Newsletter : enveloppe le contenu (HTML fourni par l'opérateur, de confiance)
 *  dans le layout commun + pied de désinscription avec lien signé PAR destinataire.
 *  unsubscribeUrl est construite côté serveur (token HMAC) → sûre à interpoler. */
export function emailNewsletter(params: { contentHtml: string; unsubscribeUrl: string }): string {
  return layout(`
    ${params.contentHtml}
    <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);text-align:center;margin-top:40px;">
      <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Se désinscrire</a>
    </p>
  `);
}

function cta(label: string, url: string): string {
  // escapeHtml aussi sur l'URL : aujourd'hui toutes les URLs sont construites serveur
  // (APP_URL + UUID/code/token, jamais d'input libre), mais on ferme la porte à un
  // futur appelant qui passerait une URL dérivée d'input → attribut-breakout dans le HTML.
  return `
    <a href="${escapeHtml(url)}" style="display:block;background:#fff;color:#000;text-align:center;padding:16px;font-family:system-ui,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;text-decoration:none;margin-top:32px;">
      ${escapeHtml(label)}
    </a>
  `;
}

/** Message écrit par un passant ou un porteur. Ses liens sont masqués (cf.
 *  mask-links.ts) ; la conversation les garde. */
function quoteBlock(content: string, sender?: string): string {
  const senderLine = sender
    ? `<p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0 0 16px;">De : <strong style="color:#fff;">${escapeHtml(maskLinks(sender))}</strong></p>`
    : `<p style="font-size:13px;color:rgba(255,255,255,0.3);margin:0 0 16px;font-style:italic;">Message anonyme</p>`;

  return `
    <div style="border:1px solid rgba(255,255,255,0.1);padding:24px;margin-bottom:32px;">
      ${senderLine}
      <p style="font-size:18px;font-style:italic;font-weight:300;color:rgba(255,255,255,0.85);margin:0;line-height:1.6;">
        &ldquo;${escapeHtml(maskLinks(content))}&rdquo;
      </p>
    </div>
  `;
}

/** Les réponses par email vont à CONTACT_EMAIL (Reply-To, cf. sendEmail) : on
 *  le dit là où l'on croirait répondre à l'autre personne. `who` : HTML sûr. */
function replyHint(who: string): string {
  return `
    <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.35);text-align:center;line-height:1.7;margin:24px 0 0;">
      Pour répondre à ${who}, passez par le bouton : répondre à cet email écrit à l'équipe In Real Society.
    </p>
  `;
}

// ─── Templates ────────────────────────────────────────────────────────────────

/** Email envoyé au membre quand il reçoit un nouveau message */
export function emailNouveauMessage(params: {
  memberName:    string;
  content:       string;
  senderContact?: string;
  senderName?:   string;
  /** La conversation elle-même : on y lit et on y répond en un clic. */
  conversationUrl: string;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.memberName);
  // Étiquette expéditeur : prénom + contact si les deux, sinon l'un ou l'autre.
  // quoteBlock affiche « Message anonyme » si vide.
  const name    = params.senderName?.trim();
  const contact = params.senderContact?.trim();
  const sender  = name
    ? (contact ? `${name} (${contact})` : name)
    : contact;
  return {
    subject: `${params.memberName}, quelqu'un vous a envoyé un signal.`,
    html: layout(`
      <h1 style="font-size:26px;font-weight:300;letter-spacing:0.04em;margin:0 0 8px;text-align:center;">Un signal pour vous,</h1>
      <h2 style="font-size:26px;font-weight:600;letter-spacing:0.04em;margin:0 0 32px;text-align:center;">${safeName}.</h2>
      ${quoteBlock(params.content, sender)}
      ${cta('Lire et répondre', params.conversationUrl)}
      ${replyHint('cette personne')}
    `),
  };
}

/** Email envoyé à l'expéditeur quand le membre lui répond */
export function emailReponse(params: {
  memberName: string;
  reply:      string;
  convUrl:    string;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.memberName);
  return {
    subject: `${params.memberName} vous a répondu.`,
    html: layout(`
      <h1 style="font-size:22px;font-weight:300;margin:0 0 24px;text-align:center;">
        <strong style="font-weight:600;">${safeName}</strong> vous a répondu.
      </h1>
      ${quoteBlock(params.reply)}
      ${cta('Voir la conversation', params.convUrl)}
      ${replyHint(safeName)}
    `),
  };
}

/** Confirmation de l'email laissé par un passant : tant qu'il n'a pas cliqué,
 *  aucune réponse du porteur ne part vers cette adresse. Aucun contenu du
 *  message ici : l'adresse peut être celle d'un tiers. */
export function emailContactVerification(params: {
  memberName: string;
  verifyUrl:  string;
  ttlDays:    number;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.memberName);
  return {
    subject: 'Confirmez votre adresse pour recevoir la réponse',
    html: layout(`
      <h1 style="font-size:22px;font-weight:300;margin:0 0 24px;text-align:center;line-height:1.4;">
        Confirmez votre adresse.
      </h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0;">
        Vous avez écrit à <strong style="color:#fff;font-weight:600;">${safeName}</strong> sur In Real Society
        et laissé cette adresse pour être prévenu de sa réponse.
      </p>
      ${cta('Confirmer mon adresse', params.verifyUrl)}
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.35);text-align:center;line-height:1.7;margin:24px 0 0;">
        Lien valable ${params.ttlDays} jours.<br/>
        Ce n'est pas vous ? Ignorez cet email : aucune réponse ne vous sera envoyée.
      </p>
    `),
  };
}

/** Email envoyé au membre quand son profil est scanné. `unsubscribeUrl` : lien
 *  signé qui coupe ces emails (migration 061), aussi posé en List-Unsubscribe. */
export function emailNouveauScan(params: {
  memberName:      string;
  scannerName?:    string;
  dashboardUrl:    string;
  unsubscribeUrl?: string;
}): { subject: string; html: string } {
  const unsubscribe = params.unsubscribeUrl
    ? `<br/><a href="${escapeHtml(params.unsubscribeUrl)}" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Ne plus recevoir ces emails</a>, ici ou dans vos réglages.`
    : '';
  const safeScanner = params.scannerName ? escapeHtml(params.scannerName) : null;

  const headline = safeScanner
    ? `<strong style="font-weight:600;">${safeScanner}</strong> vient de voir votre profil.`
    : 'Quelqu\'un vient de voir votre profil.';

  return {
    subject: `${params.memberName}, quelqu'un vient de scanner votre profil.`,
    html: layout(`
      <h1 style="font-size:22px;font-weight:300;margin:0 0 24px;text-align:center;line-height:1.4;">
        ${headline}
      </h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.4);text-align:center;line-height:1.8;margin:0 0 32px;">
        Vos chemins se sont peut-être croisés.<br/>La suite dépend d'eux.
      </p>
      ${cta('Voir mon tableau de bord', params.dashboardUrl)}
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);text-align:center;line-height:1.6;margin:24px 0 0;">
        Un seul email par jour : les scans suivants vous attendent dans votre tableau de bord.${unsubscribe}
      </p>
    `),
  };
}

/**
 * Plafond gratuit atteint : quelqu'un n'a pas pu écrire au porteur. Une fois par
 * semaine au plus (claim_cap_email, migration 059). Rien sur la personne refusée.
 */
export function emailConversationLimit(params: {
  name:         string;
  maxConversations: number;
  windowDays:   number;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.name);
  return {
    subject: `${params.name}, quelqu'un a essayé de vous écrire.`,
    html: layout(`
      <h1 style="font-size:22px;font-weight:300;margin:0 0 24px;text-align:center;line-height:1.4;">
        Quelqu'un a essayé de vous écrire, ${safeName}.
      </h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 16px;">
        Vous avez déjà ${params.maxConversations} conversations ouvertes sur ${params.windowDays} jours :
        son message n'a pas pu partir. Un créneau se libère ${params.windowDays} jours après chaque conversation.
      </p>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(197,160,89,0.8);text-align:center;line-height:1.8;margin:0 0 32px;">
        Avec le premium, les conversations sont illimitées.
      </p>
      ${cta('Voir mes conversations', params.dashboardUrl)}
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);text-align:center;line-height:1.6;margin:24px 0 0;">
        Cet email part une fois par semaine au plus.
      </p>
    `),
  };
}

/** Email de bienvenue après activation du profil */
export function emailBienvenue(params: {
  name:         string;
  dashboardUrl: string;
  profileUrl:   string;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.name);
  return {
    subject: `${params.name}, votre profil In Real Society est actif.`,
    html: layout(`
      <h1 style="font-size:28px;font-weight:300;letter-spacing:0.05em;margin:0 0 16px;text-align:center;">
        Bienvenue, ${safeName}.
      </h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 40px;">
        Votre vêtement est actif. Conservez ce lien précieusement.
      </p>
      <div style="border:1px solid rgba(255,255,255,0.1);padding:24px;margin-bottom:16px;">
        <p style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:0.2em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin:0 0 12px;">Votre tableau de bord</p>
        <a href="${escapeHtml(params.dashboardUrl)}" style="color:#fff;font-family:system-ui,sans-serif;font-size:13px;word-break:break-all;">${escapeHtml(params.dashboardUrl)}</a>
      </div>
      <div style="border:1px solid rgba(255,255,255,0.1);padding:24px;margin-bottom:8px;">
        <p style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:0.2em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin:0 0 12px;">URL de votre QR code</p>
        <a href="${escapeHtml(params.profileUrl)}" style="color:#fff;font-family:system-ui,sans-serif;font-size:13px;word-break:break-all;">${escapeHtml(params.profileUrl)}</a>
      </div>
      ${cta('Accéder à mon tableau de bord', params.dashboardUrl)}
    `),
  };
}

/** Email de relance J+7 : profil créé mais aucun scan reçu */
export function emailScanReminder(params: {
  name:         string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.name);
  return {
    subject: `${params.name}, le monde attend votre première rencontre.`,
    html: layout(`
      <h1 style="font-size:28px;font-weight:300;letter-spacing:0.04em;margin:0 0 16px;text-align:center;">
        Pas encore de scan, ${safeName}.
      </h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 24px;">
        Votre profil est prêt depuis une semaine, mais votre vêtement reste silencieux.
        La règle est simple : il doit être porté, et il doit être vu.
      </p>
      <div style="border:1px solid rgba(255,255,255,0.1);padding:24px;margin-bottom:8px;">
        <p style="font-family:system-ui,sans-serif;font-size:12px;color:rgba(255,255,255,0.5);line-height:1.8;margin:0;">
          ✦ Portez-le où vous allez naturellement<br/>
          ✦ Choisissez les moments lents : café, librairie, vernissage<br/>
          ✦ Faites confiance au hasard
        </p>
      </div>
      ${cta('Voir mon tableau de bord', params.dashboardUrl)}
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;margin:24px 0 0;">
        Cette relance n’est envoyée qu’une seule fois.
      </p>
    `),
  };
}

/** Bienvenue premium. Vaut confirmation du contrat (Code de la consommation,
 *  L221-13) : prix, renouvellement, résiliation, rétractation et son formulaire. */
export function emailPremium(params: {
  name:         string;
  dashboardUrl: string;
  /** Jour de la souscription, en toutes lettres. */
  subscribedOn: string;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.name);
  const p = 'font-family:system-ui,sans-serif;font-size:12px;color:rgba(255,255,255,0.55);line-height:1.8;margin:0 0 12px;';
  return {
    subject: `${params.name}, bienvenue dans le cercle premium.`,
    html: layout(`
      <h1 style="font-size:28px;font-weight:300;letter-spacing:0.04em;margin:0 0 16px;text-align:center;">
        Bienvenue dans le cercle, ${safeName}.
      </h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 32px;">
        Votre abonnement premium est actif. Voici ce qui change :
      </p>
      <div style="border:1px solid rgba(197,160,89,0.3);padding:24px;margin-bottom:24px;">
        <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(197,160,89,0.8);line-height:2;margin:0;">
          ${PREMIUM_PERKS.map((perk) => `✦ ${escapeHtml(perk)}`).join('<br/>')}
        </p>
      </div>
      <div style="border:1px solid rgba(255,255,255,0.1);padding:24px;">
        <p style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin:0 0 12px;">Votre abonnement</p>
        <p style="${p}">
          ${PREMIUM_PRICE_LABEL} TTC par mois, payé d’avance et renouvelé chaque mois jusqu’à ce que vous résiliiez.
          Souscrit le ${escapeHtml(params.subscribedOn)}.
        </p>
        <p style="${p}">
          Résiliable à tout moment depuis vos réglages : le premium reste actif jusqu’à la fin du mois payé,
          sans autre prélèvement.
        </p>
        <p style="${p}margin:0;">
          Vous changez d’avis ? Vous avez ${PREMIUM_WITHDRAWAL_DAYS} jours pour vous rétracter, en écrivant à
          ${CONTACT_EMAIL} : votre paiement vous sera remboursé en entier.
        </p>
      </div>
      ${cta('Voir mon tableau de bord', params.dashboardUrl)}
      <p style="font-family:system-ui,sans-serif;font-size:10px;color:rgba(255,255,255,0.3);line-height:1.7;margin:32px 0 0;">
        Formulaire de rétractation, à renvoyer à ${CONTACT_EMAIL} : « Je vous notifie par la présente ma
        rétractation du contrat portant sur la prestation de services ci-dessous : abonnement premium
        In Real Society, souscrit le ${escapeHtml(params.subscribedOn)}. Nom, adresse, date. »
        Conditions générales de vente, article 8 :
        <a href="${escapeHtml(`${APP_URL}/cgv#premium`)}" style="color:rgba(255,255,255,0.45);">${escapeHtml(`${APP_URL}/cgv`)}</a>
      </p>
    `),
  };
}

/** Confirmation de résiliation (Code de la consommation, L215-1-1) : date de fin
 *  et effets. Part quand la résiliation est programmée, une fois. */
export function emailPremiumCancelled(params: {
  name:        string;
  /** Dernier jour du premium, en toutes lettres. */
  endsOn:      string;
  settingsUrl: string;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.name);
  const p = 'font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 16px;';
  return {
    subject: `${params.name}, votre résiliation est enregistrée.`,
    html: layout(`
      <h1 style="font-size:24px;font-weight:300;letter-spacing:0.04em;margin:0 0 16px;text-align:center;">
        Résiliation enregistrée.
      </h1>
      <p style="${p}">
        ${safeName}, votre abonnement premium est résilié. Il reste actif jusqu’au
        ${escapeHtml(params.endsOn)} ; votre profil repasse ensuite en formule gratuite, et aucun
        autre prélèvement n’aura lieu.
      </p>
      <p style="${p}">
        Vos scans et vos conversations restent dans votre tableau de bord.
      </p>
      <p style="${p}margin:0;">
        Vous changez d’avis ? Vous pouvez réactiver l’abonnement depuis vos réglages jusqu’à cette date.
      </p>
      ${cta('Mes réglages', params.settingsUrl)}
    `),
  };
}

/** Fin du premium : résiliation arrivée à son terme, impayé, ou compte supprimé. */
export function emailPremiumEnded(params: {
  name:            string;
  /** Jour de la fin, en toutes lettres. */
  endedOn:         string;
  settingsUrl:     string;
  /** Le porteur a supprimé son compte : pas de lien vers des réglages disparus. */
  accountDeleted?: boolean;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.name);
  const endedOn  = escapeHtml(params.endedOn);
  const p = 'font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 16px;';
  if (params.accountDeleted) {
    return {
      subject: `${params.name}, votre abonnement premium est résilié.`,
      html: layout(`
        <h1 style="font-size:24px;font-weight:300;letter-spacing:0.04em;margin:0 0 16px;text-align:center;">
          Abonnement résilié.
        </h1>
        <p style="${p}margin:0;">
          ${safeName}, votre compte est supprimé. Votre abonnement premium est résilié depuis le
          ${endedOn} : aucun autre prélèvement n’aura lieu.
        </p>
      `),
    };
  }
  return {
    subject: `${params.name}, votre abonnement premium a pris fin.`,
    html: layout(`
      <h1 style="font-size:24px;font-weight:300;letter-spacing:0.04em;margin:0 0 16px;text-align:center;">
        Votre premium a pris fin.
      </h1>
      <p style="${p}">
        ${safeName}, votre abonnement premium a pris fin le ${endedOn}. Votre profil est repassé en
        formule gratuite : vos scans et vos conversations restent dans votre tableau de bord.
      </p>
      <p style="${p}margin:0;">
        Vous pouvez vous réabonner à tout moment depuis vos réglages.
      </p>
      ${cta('Mes réglages', params.settingsUrl)}
    `),
  };
}

/** Email de relance quand un paiement d'abonnement premium échoue */
export function emailPaymentFailed(params: {
  name:         string;
  dashboardUrl: string;
  attemptNumber?: number;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.name);
  const attempt  = params.attemptNumber ?? 1;
  return {
    subject: `${params.name}, votre paiement premium n’a pas pu être traité.`,
    html: layout(`
      <h1 style="font-size:24px;font-weight:300;letter-spacing:0.04em;margin:0 0 16px;text-align:center;">
        Le paiement n’est pas passé.
      </h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 24px;">
        ${safeName}, nous avons essayé de renouveler votre abonnement premium mais votre carte n’a pas pu être débitée.
        Cela peut venir d’une carte expirée, d’un plafond atteint ou d’un blocage temporaire.
      </p>
      <p style="font-family:system-ui,sans-serif;font-size:12px;color:rgba(255,255,255,0.4);text-align:center;line-height:1.8;margin:0 0 24px;">
        Stripe va automatiquement réessayer dans les prochains jours. Pour éviter une coupure de votre abonnement,
        mettez à jour votre moyen de paiement depuis vos réglages (« Gérer ou résilier mon abonnement »).
      </p>
      ${cta('Mettre à jour ma carte', params.dashboardUrl)}
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;margin:24px 0 0;">
        Tentative ${attempt} — Si rien n’est mis à jour, votre abonnement passera en free automatiquement.
      </p>
    `),
  };
}

/** Relance d'un acheteur payé dont le profil n'est pas activé (cron, J+2 puis J+7).
 *  Reprend le code : l'acheteur a pu perdre le premier email. */
export function emailOrderActivationReminder(params: {
  code:           string;
  registerUrl:    string;
  reminderNumber: 1 | 2;
}): { subject: string; html: string } {
  const safeCode = escapeHtml(params.code);
  const first = params.reminderNumber === 1;
  return {
    subject: first
      ? 'Votre t-shirt arrive — il manque votre profil'
      : 'Votre t-shirt est peut-être déjà là — activez votre profil',
    html: layout(`
      <h1 style="font-size:26px;font-weight:300;letter-spacing:0.04em;margin:0 0 16px;text-align:center;">
        ${first ? 'Votre t-shirt est en route.' : 'Il ne manque que vous.'}
      </h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 32px;">
        Tant que votre profil n'est pas activé, ceux qui scannent votre dos tombent
        sur une page « pas encore activé ». Une minute suffit, avec ce code.
      </p>
      <div style="border:1px solid rgba(255,255,255,0.2);padding:28px;text-align:center;margin-bottom:8px;">
        <p style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:0.2em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin:0 0 16px;">Votre code d'activation</p>
        <p style="font-family:monospace;font-size:30px;font-weight:700;letter-spacing:0.3em;color:#fff;margin:0;">${safeCode}</p>
      </div>
      ${cta('Activer mon profil', params.registerUrl)}
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);text-align:center;margin:20px 0 0;">
        Déjà activé ? Ignorez ce message.
      </p>
    `),
  };
}

/** Récapitulatif de commande (email d'activation). Toutes les valeurs sont
 *  échappées : l'adresse vient de la saisie du client chez Stripe. */
function recapBlock(r: OrderRecap): string {
  const rows: [string, string][] = [
    ['Article', r.article],
    ['Accroche', r.tagline ? `« ${r.tagline} »` : 'QR seul, sans accroche'],
  ];
  if (r.shipping) rows.push(['Livraison', r.shipping]);
  if (r.total)    rows.push(['Total payé', `${r.total} TTC`]);
  if (r.address)  rows.push(['Livré à', r.address]);
  return `
    <div style="margin-top:40px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;">
      <p style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:0.2em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin:0 0 12px;">Votre commande</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        ${rows.map(([label, value]) => `
        <tr>
          <td style="font-family:system-ui,sans-serif;font-size:12px;color:rgba(255,255,255,0.4);padding:6px 16px 6px 0;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.85);padding:6px 0;text-align:right;line-height:1.5;">${escapeHtml(value)}</td>
        </tr>`).join('')}
      </table>
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.35);line-height:1.7;margin:16px 0 0;">
        Fabriqué à la demande (2 à 5 jours), puis expédié. Commande soumise à nos
        <a href="${APP_URL}/cgv" style="color:rgba(255,255,255,0.6);text-decoration:underline;">conditions générales de vente</a>.
      </p>
    </div>
  `;
}

/** Email d'activation après achat Stripe. `recap` : récapitulatif de la commande
 *  (absent au renvoi du code, qui ne sert qu'à le retrouver). */
export function emailActivation(params: {
  code:        string;
  registerUrl: string;
  recap?:      OrderRecap;
}): { subject: string; html: string } {
  const safeCode = escapeHtml(params.code);
  return {
    subject: "Votre code d'activation In Real Society.",
    html: layout(`
      <h1 style="font-size:28px;font-weight:300;letter-spacing:0.04em;margin:0 0 16px;text-align:center;">Votre vêtement arrive.</h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 40px;">
        Configurez dès maintenant votre profil avec ce code unique.
      </p>
      <div style="border:1px solid rgba(255,255,255,0.2);padding:32px;text-align:center;margin-bottom:8px;">
        <p style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:0.2em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin:0 0 16px;">Votre code d'activation</p>
        <p style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:0.3em;color:#fff;margin:0;">${safeCode}</p>
      </div>
      ${cta('Créer mon profil maintenant', params.registerUrl)}
      <p style="font-family:system-ui,sans-serif;font-size:12px;color:rgba(255,255,255,0.4);text-align:center;margin:20px 0 0;">
        <a href="${APP_URL}/commande?code=${encodeURIComponent(params.code)}" style="color:rgba(255,255,255,0.6);text-decoration:underline;">Suivre ma commande</a>
      </p>
      ${params.recap ? recapBlock(params.recap) : ''}
    `),
  };
}

/** Alerte à l'équipe (ADMIN_ALERT_EMAIL) : un porteur a signalé un message.
 *  `outcome` null = le signalement n'a pas pu être enregistré (voir les logs). */
/** Ligne « libellé : valeur » des alertes à l'équipe (valeur déjà échappée). */
function alertRow(label: string, value: string): string {
  return `
    <tr>
      <td style="font-family:system-ui,sans-serif;font-size:12px;color:rgba(255,255,255,0.4);padding:6px 16px 6px 0;vertical-align:top;white-space:nowrap;">${label}</td>
      <td style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.85);padding:6px 0;line-height:1.5;">${value}</td>
    </tr>`;
}

/**
 * Alerte à l'équipe : un profil a été signalé (règlement européen sur les services
 * numériques : tout hébergeur offre un moyen simple de signaler un contenu).
 * Rien n'est masqué automatiquement : l'équipe décide, SQL fourni.
 */
export function emailProfileReportAlert(params: {
  memberName: string | null;
  memberId:   string;
  profileUrl: string;
  reason:     string;
  contact:    string | null;
}): { subject: string; html: string } {
  const id = escapeHtml(params.memberId);
  const url = escapeHtml(params.profileUrl);
  return {
    subject: 'Signalement : un profil a été signalé',
    html: layout(`
      <h1 style="font-size:22px;font-weight:300;margin:0 0 16px;text-align:center;">Profil signalé</h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 24px;">
        Rien n'est masqué automatiquement : à vous de décider.
      </p>
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        ${alertRow('Porteur', `${escapeHtml(params.memberName ?? '—')} <span style="color:rgba(255,255,255,0.35);">(${id})</span>`)}
        ${alertRow('Profil', `<a href="${url}" style="color:#fff;word-break:break-all;">${url}</a>`)}
        ${alertRow('Motif', `« ${escapeHtml(params.reason)} »`)}
        ${alertRow('Contact', params.contact ? escapeHtml(params.contact) : 'non fourni')}
      </table>
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.4);margin:24px 0 8px;">SQL (Supabase → SQL Editor)</p>
      <pre style="font-family:monospace;font-size:11px;color:rgba(255,255,255,0.75);background:#111;padding:12px;white-space:pre-wrap;margin:0;">-- Suspendre le profil (le porteur ne peut pas lever la suspension)
UPDATE members SET suspended_at = now(), is_paused = true WHERE id = '${id}';
-- Lever la suspension
UPDATE members SET suspended_at = NULL, is_paused = false WHERE id = '${id}';</pre>
    `),
  };
}

export function emailReportAlert(params: {
  memberName:  string | null;
  memberId:    string;
  content:     string;
  senderToken: string | null;
  outcome:     { reporters: number; banned: boolean } | null;
  threshold:   number;
}): { subject: string; html: string } {
  const { outcome, threshold } = params;
  const token = params.senderToken ? escapeHtml(params.senderToken) : null;
  const excerpt = escapeHtml(params.content.length > 500 ? `${params.content.slice(0, 500)}…` : params.content);
  const status = !outcome
    ? 'Signalement non enregistré (erreur) : voir les logs. Le message est tout de même masqué.'
    : outcome.banned
      ? `Appareil banni automatiquement de toute la plateforme (${outcome.reporters} porteurs l'ont signalé).`
      : token
        ? `Pas encore banni : ${outcome.reporters} porteur(s) sur ${threshold}.`
        : 'Appareil inconnu (message ancien) : pas de bannissement possible.';
  const sql = token ? `
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.4);margin:24px 0 8px;">SQL (Supabase → SQL Editor)</p>
      <pre style="font-family:monospace;font-size:11px;color:rgba(255,255,255,0.75);background:#111;padding:12px;white-space:pre-wrap;margin:0;">-- Bannir à la main
INSERT INTO banned_devices (sender_token, reason) VALUES ('${token}', 'manuel') ON CONFLICT DO NOTHING;
-- Lever le bannissement
DELETE FROM banned_devices WHERE sender_token = '${token}';</pre>` : '';
  return {
    subject: outcome?.banned ? 'Signalement : appareil banni automatiquement' : 'Signalement : un porteur a signalé un message',
    html: layout(`
      <h1 style="font-size:22px;font-weight:300;margin:0 0 16px;text-align:center;">Message signalé</h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 24px;">
        Le message est masqué pour le porteur.
      </p>
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        ${alertRow('Porteur', `${escapeHtml(params.memberName ?? '—')} <span style="color:rgba(255,255,255,0.35);">(${escapeHtml(params.memberId)})</span>`)}
        ${alertRow('Message', `« ${excerpt} »`)}
        ${alertRow('Appareil', token ?? 'inconnu')}
        ${alertRow('Suite', escapeHtml(status))}
      </table>
      ${sql}
    `),
  };
}

// ─── Envoi générique Resend ───────────────────────────────────────────────────

/** Essais par requête. Resend refuse au-delà de 10 requêtes par seconde pour
 *  tout le compte (429 rate_limit_exceeded) et peut tomber en panne (5xx) :
 *  ceux-là se réessaient. Un quota épuisé (daily_/monthly_quota_exceeded), un
 *  domaine non vérifié ou une adresse invalide, non. */
export const SEND_ATTEMPTS = 3;

export interface EmailParams {
  to:       string;
  subject:  string;
  html:     string;
  headers?: Record<string, string>;   // ex. List-Unsubscribe
}

/** Corps attendu par l'API. Les réponses vont à CONTACT_EMAIL (Reply-To). */
function apiEmail(params: EmailParams) {
  return {
    from:     EMAIL_FROM,
    to:       [params.to],
    reply_to: CONTACT_EMAIL,
    subject:  params.subject,
    html:     params.html,
    ...(params.headers ? { headers: params.headers } : {}),
  };
}

/** Attente avant l'essai suivant : celle que Resend demande (Retry-After, en
 *  secondes), plafonnée à 2 s pour ne pas tenir la requête en cours, sinon un
 *  délai croissant. */
function retryDelayMs(res: Response | null, attempt: number): number {
  const asked = Number(res?.headers.get('retry-after'));
  return asked > 0 ? Math.min(asked * 1000, 2000) : 500 * attempt;
}

/** POST vers Resend, avec les nouveaux essais. `null` si rien n'est parti : la
 *  raison est dans les logs, jamais en exception. */
async function postToResend(
  url: string,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ data: unknown } | null> {
  const body = JSON.stringify(payload);
  // Même clé pour tous les essais de CETTE requête : si Resend l'a traitée mais
  // que sa réponse s'est perdue, l'essai suivant ne crée pas de doublon (24 h).
  const idempotencyKey = crypto.randomUUID();

  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null;
    let reason: string;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':    'application/json',
          'Authorization':   `Bearer ${process.env.RESEND_API_KEY}`,
          'Idempotency-Key': idempotencyKey,
          ...extraHeaders,
        },
        body,
      });
      if (res.ok) return { data: await res.json().catch(() => null) };
      const error = await res.json().catch(() => null) as { name?: string; message?: string } | null;
      reason = [res.status, error?.name, error?.message].filter(Boolean).join(' ');
      const retryable = res.status >= 500 || (res.status === 429 && error?.name === 'rate_limit_exceeded');
      if (!retryable) {
        console.error(`[sendEmail] refusé par Resend : ${reason}`);
        return null;
      }
    } catch (err) {
      reason = `Resend injoignable : ${err instanceof Error ? err.message : String(err)}`;
    }
    if (attempt >= SEND_ATTEMPTS) {
      console.error(`[sendEmail] échec après ${SEND_ATTEMPTS} essais : ${reason}`);
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res, attempt)));
  }
}

/** Envoie un email. `false` si rien n'est parti : la raison est toujours dans
 *  les logs (`[sendEmail]`), ne jamais l'attendre en exception. */
export async function sendEmail(params: EmailParams): Promise<boolean> {
  return (await postToResend(RESEND_API_URL, apiEmail(params))) !== null;
}

/** Taille maximale d'un lot Resend. Un lot compte pour UNE requête dans la
 *  limite de débit. */
export const BATCH_MAX = 100;

/**
 * Envoie jusqu'à BATCH_MAX emails en une requête. Validation « permissive » :
 * une adresse refusée n'empêche pas les autres de partir. Renvoie le nombre
 * d'emails acceptés par Resend.
 */
export async function sendEmailBatch(emails: EmailParams[]): Promise<number> {
  if (emails.length === 0) return 0;
  if (emails.length > BATCH_MAX) throw new Error(`[sendEmailBatch] ${emails.length} emails > ${BATCH_MAX}`);
  const result = await postToResend(`${RESEND_API_URL}/batch`, emails.map(apiEmail), {
    'x-batch-validation': 'permissive',
  });
  if (!result) return 0;
  const errors = (result.data as { errors?: { index: number; message: string }[] } | null)?.errors ?? [];
  for (const e of errors) console.error(`[sendEmailBatch] email n°${e.index} refusé : ${e.message}`);
  return emails.length - errors.length;
}
