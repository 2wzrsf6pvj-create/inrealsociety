// POST /api/newsletter/send
// Broadcast d'une newsletter à l'audience consentie. Route INTERNE protégée par
// INTERNAL_SECRET (x-internal-secret), comme /api/push/notify. L'envoi est une
// action sortante irréversible → deux garde-fous : `dryRun` (renvoie la taille
// d'audience sans rien envoyer) et idempotence « au plus une fois » via la `key`.
//
// Body : { key, subject, html, dryRun? }
//   - key  : slug idempotent fourni par l'opérateur (1 key = 1 envoi).
//   - html : contenu HTML de la newsletter (opérateur de confiance).
//
// Audience = (newsletter unsubscribed_at IS NULL) ∪ (members marketing_consent=true)
//            MOINS tout email opt-out (members consent=false OU newsletter unsub).
// La soustraction garantit qu'on ne contacte JAMAIS un opt-out, même si les deux
// surfaces de consentement sont temporairement désynchronisées (defense-in-depth).
//
// Chaque email porte un lien de désinscription signé (HMAC, par destinataire) +
// les headers List-Unsubscribe / List-Unsubscribe-Post (RFC 8058, one-click).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, emailNewsletter } from '@/lib/email-templates';
import { signUnsubscribe } from '@/lib/unsubscribe-token';
import { APP_URL } from '@/lib/constants';

const schema = z.object({
  key:     z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  html:    z.string().min(1).max(100_000),
  dryRun:  z.boolean().optional(),
});

// Resend ~10 req/s — on envoie par lots concurrents bornés.
const CHUNK = 10;

function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

const norm = (e: string) => e.trim().toLowerCase();

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get('x-internal-secret'), process.env.INTERNAL_SECRET)) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
  }
  const { key, subject, html, dryRun } = body.data;

  // ─── Audience (consentis − opt-out) ───────────────────────────────────────
  const [nlSubscribed, nlUnsub, mConsent, mNoConsent] = await Promise.all([
    supabaseAdmin.from('newsletter_subscribers').select('email').is('unsubscribed_at', null),
    supabaseAdmin.from('newsletter_subscribers').select('email').not('unsubscribed_at', 'is', null),
    supabaseAdmin.from('members').select('email').eq('marketing_consent', true).not('email', 'is', null),
    supabaseAdmin.from('members').select('email').eq('marketing_consent', false).not('email', 'is', null),
  ]);

  const optedOut = new Set<string>();
  for (const r of [...(nlUnsub.data ?? []), ...(mNoConsent.data ?? [])]) {
    if (r.email) optedOut.add(norm(r.email));
  }
  const audience = new Set<string>();
  for (const r of [...(nlSubscribed.data ?? []), ...(mConsent.data ?? [])]) {
    if (!r.email) continue;
    const e = norm(r.email);
    if (!optedOut.has(e)) audience.add(e);
  }
  const recipients = Array.from(audience);

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, audience: recipients.length });
  }

  // ─── Idempotence : claim de la campagne (sent_at posé AVANT l'envoi) ───────
  const { data: existing } = await supabaseAdmin
    .from('newsletter_campaigns').select('id, sent_at').eq('key', key).maybeSingle();
  if (existing?.sent_at) {
    return NextResponse.json({ ok: true, alreadySent: true, key });
  }

  // INSERT avec sent_at = now() → toute ré-invocation (retry, double-clic) voit
  // sent_at != null et s'arrête. UNIQUE(key) tranche une vraie course concurrente.
  const { data: campaign, error: claimErr } = await supabaseAdmin
    .from('newsletter_campaigns')
    .insert({ key, subject, sent_at: new Date().toISOString() })
    .select('id')
    .maybeSingle();
  if (claimErr || !campaign) {
    // 23505 (UNIQUE) ou ligne déjà créée par une invocation concurrente.
    return NextResponse.json({ ok: true, alreadySent: true, key });
  }

  // ─── Envoi par lots ───────────────────────────────────────────────────────
  let sent = 0, failures = 0;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const batch = recipients.slice(i, i + CHUNK);
    const oks = await Promise.all(batch.map(async (email) => {
      const token          = signUnsubscribe(email);
      const unsubscribeUrl = `${APP_URL}/api/newsletter/unsubscribe?e=${encodeURIComponent(email)}&t=${token}`;
      return sendEmail({
        to:      email,
        subject,
        html:    emailNewsletter({ contentHtml: html, unsubscribeUrl }),
        headers: {
          'List-Unsubscribe':      `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
    }));
    for (const ok of oks) { if (ok) sent++; else failures++; }
  }

  await supabaseAdmin.from('newsletter_campaigns')
    .update({ recipients: sent, failures })
    .eq('id', campaign.id);

  return NextResponse.json({ ok: true, key, sent, failures, audience: recipients.length });
}
