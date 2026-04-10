// src/lib/email-templates.ts
// Tous les templates d'email Resend au même endroit.
// Modifier le design ici = modifier tous les emails d'un coup.

import { escapeHtml } from '@/lib/escape-html';

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
  dashboardUrl:  string;
}): { subject: string; html: string } {
  const safeName = escapeHtml(params.memberName);
  return {
    subject: `${safeName}, quelqu'un vous a envoyé un signal.`,
    html: layout(`
      <h1 style="font-size:26px;font-weight:300;letter-spacing:0.04em;margin:0 0 8px;text-align:center;">Un signal pour vous,</h1>
      <h2 style="font-size:26px;font-weight:600;letter-spacing:0.04em;margin:0 0 32px;text-align:center;">${safeName}.</h2>
      ${quoteBlock(params.content, params.senderContact)}
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
    subject: `${safeName} vous a répondu.`,
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
    subject: `${safeName}, quelqu'un vient de scanner votre profil.`,
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
    subject: `${safeName}, votre profil InRealSociety est actif.`,
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
    `),
  };
}

// ─── Envoi générique Resend ───────────────────────────────────────────────────

export async function sendEmail(params: {
  to:      string;
  subject: string;
  html:    string;
}): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'InRealSociety <noreply@inrealsociety.com>',
        to:   [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[sendEmail]', err);
    return false;
  }
}