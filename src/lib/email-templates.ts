// src/lib/email-templates.ts
// Tous les templates d'email Resend au même endroit.
// Modifier le design ici = modifier tous les emails d'un coup.

import { escapeHtml } from '@/lib/escape-html';
import { EMAIL_FROM, RESEND_API_URL, APP_URL } from '@/lib/constants';

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
        InRealSociety · The IRL Social Club
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
      <a href="${params.unsubscribeUrl}" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Se désinscrire</a>
    </p>
  `);
}

function cta(label: string, url: string): string {
  return `
    <a href="${url}" style="display:block;background:#fff;color:#000;text-align:center;padding:16px;font-family:system-ui,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;text-decoration:none;margin-top:32px;">
      ${escapeHtml(label)}
    </a>
  `;
}

function quoteBlock(content: string, sender?: string): string {
  const senderLine = sender
    ? `<p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0 0 16px;">De : <strong style="color:#fff;">${escapeHtml(sender)}</strong></p>`
    : `<p style="font-size:13px;color:rgba(255,255,255,0.3);margin:0 0 16px;font-style:italic;">Message anonyme</p>`;

  return `
    <div style="border:1px solid rgba(255,255,255,0.1);padding:24px;margin-bottom:32px;">
      ${senderLine}
      <p style="font-size:18px;font-style:italic;font-weight:300;color:rgba(255,255,255,0.85);margin:0;line-height:1.6;">
        &ldquo;${escapeHtml(content)}&rdquo;
      </p>
    </div>
  `;
}

// ─── Templates ────────────────────────────────────────────────────────────────

/** Email envoyé au membre quand il reçoit un nouveau message */
export function emailNouveauMessage(params: {
  memberName:    string;
  content:       string;
  senderContact?: string;
  senderName?:   string;
  dashboardUrl:  string;
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
      ${cta('Voir mes messages', params.dashboardUrl)}
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
    `),
  };
}

/** Email envoyé au membre quand son profil est scanné */
export function emailNouveauScan(params: {
  memberName:   string;
  scannerName?: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const safeName    = escapeHtml(params.memberName);
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
    subject: `${params.name}, votre profil InRealSociety est actif.`,
    html: layout(`
      <h1 style="font-size:28px;font-weight:300;letter-spacing:0.05em;margin:0 0 16px;text-align:center;">
        Bienvenue, ${safeName}.
      </h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 40px;">
        Votre vêtement est actif. Conservez ce lien précieusement.
      </p>
      <div style="border:1px solid rgba(255,255,255,0.1);padding:24px;margin-bottom:16px;">
        <p style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:0.2em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin:0 0 12px;">Votre tableau de bord</p>
        <a href="${params.dashboardUrl}" style="color:#fff;font-family:system-ui,sans-serif;font-size:13px;word-break:break-all;">${params.dashboardUrl}</a>
      </div>
      <div style="border:1px solid rgba(255,255,255,0.1);padding:24px;margin-bottom:8px;">
        <p style="font-family:system-ui,sans-serif;font-size:10px;letter-spacing:0.2em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin:0 0 12px;">URL de votre QR code</p>
        <a href="${params.profileUrl}" style="color:#fff;font-family:system-ui,sans-serif;font-size:13px;word-break:break-all;">${params.profileUrl}</a>
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

/** Email de bienvenue premium */
export function emailPremium(params: {
  name:         string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.name);
  return {
    subject: `${params.name}, bienvenue dans le cercle premium.`,
    html: layout(`
      <h1 style="font-size:28px;font-weight:300;letter-spacing:0.04em;margin:0 0 16px;text-align:center;">
        Bienvenue dans le cercle, ${safeName}.
      </h1>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.8;margin:0 0 32px;">
        Votre abonnement premium est actif. Voici ce qui change :
      </p>
      <div style="border:1px solid rgba(197,160,89,0.3);padding:24px;margin-bottom:8px;">
        <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(197,160,89,0.8);line-height:2;margin:0;">
          ✦ Fenêtre scanner étendue à 48h<br/>
          ✦ Conversations illimitées<br/>
          ✦ Badge ✦ visible sur votre profil<br/>
          ✦ Stats avancées à venir
        </p>
      </div>
      ${cta('Voir mon tableau de bord', params.dashboardUrl)}
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
        mettez à jour votre moyen de paiement depuis votre tableau de bord.
      </p>
      ${cta('Mettre à jour ma carte', params.dashboardUrl)}
      <p style="font-family:system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.6;margin:24px 0 0;">
        Tentative ${attempt} — Si rien n’est mis à jour, votre abonnement passera en free automatiquement.
      </p>
    `),
  };
}

/** Email d'activation après achat Stripe */
export function emailActivation(params: {
  code:        string;
  registerUrl: string;
}): { subject: string; html: string } {
  const safeCode = escapeHtml(params.code);
  return {
    subject: "Votre code d'activation InRealSociety.",
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
    `),
  };
}

// ─── Envoi générique Resend ───────────────────────────────────────────────────

export async function sendEmail(params: {
  to:       string;
  subject:  string;
  html:     string;
  headers?: Record<string, string>;   // ex. List-Unsubscribe (newsletter)
}): Promise<boolean> {
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to:   [params.to],
        subject: params.subject,
        html: params.html,
        ...(params.headers ? { headers: params.headers } : {}),
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[sendEmail]', err);
    return false;
  }
}