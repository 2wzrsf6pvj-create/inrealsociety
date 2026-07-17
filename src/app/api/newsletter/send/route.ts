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
// Laisse le maximum de budget à la boucle d'envoi séquentielle (anti-timeout).
export const maxDuration = 60;

// Plafond d'audience par run : au-delà, on REFUSE bruyamment (avant de claim la
// campagne) plutôt que de risquer un timeout serverless à mi-parcours qui
// marquerait la campagne « envoyée » en laissant des destinataires jamais servis.
// Segmenter l'envoi (sous-listes) au-dessus de cette taille.
const MAX_AUDIENCE_PER_RUN = 3000;

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

// Récupère TOUS les emails d'une requête, page par page. PostgREST plafonne le
// nombre de lignes (`db-max-rows`, souvent 1000) : un `.select()` simple TRONQUE
// silencieusement au-delà. Critique pour les listes d'OPT-OUT — une troncature y
// ferait passer un désinscrit dans l'audience (envoi marketing non consenti = RGPD).
// On boucle jusqu'à épuisement.
type EmailRow = { email: string | null };
type PagedQuery = { range: (from: number, to: number) => PromiseLike<{ data: EmailRow[] | null; error: unknown }> };
async function pageEmails(build: () => PagedQuery): Promise<string[]> {
  const PAGE = 1000;
  const out: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) if (r.email) out.push(r.email);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get('x-internal-secret'), process.env.INTERNAL_SECRET)) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  // try/catch : un corps malformé/vide fait rejeter req.json() → sans ça, 500 nu.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }
  const body = schema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
  }
  const { key, subject, html, dryRun } = body.data;

  // ─── Audience (consentis − opt-out) — TOUTES les listes paginées ──────────
  let nlSubscribed: string[], nlUnsub: string[], mConsent: string[], mNoConsent: string[];
  try {
    [nlSubscribed, nlUnsub, mConsent, mNoConsent] = await Promise.all([
      pageEmails(() => supabaseAdmin.from('newsletter_subscribers').select('email').is('unsubscribed_at', null) as unknown as PagedQuery),
      pageEmails(() => supabaseAdmin.from('newsletter_subscribers').select('email').not('unsubscribed_at', 'is', null) as unknown as PagedQuery),
      pageEmails(() => supabaseAdmin.from('members').select('email').eq('marketing_consent', true).not('email', 'is', null) as unknown as PagedQuery),
      pageEmails(() => supabaseAdmin.from('members').select('email').eq('marketing_consent', false).not('email', 'is', null) as unknown as PagedQuery),
    ]);
  } catch (err) {
    console.error('[newsletter/send] audience fetch failed:', err);
    return NextResponse.json({ error: 'Erreur de calcul d\'audience.' }, { status: 500 });
  }

  const optedOut = new Set<string>();
  for (const email of [...nlUnsub, ...mNoConsent]) optedOut.add(norm(email));
  const audience = new Set<string>();
  for (const email of [...nlSubscribed, ...mConsent]) {
    const e = norm(email);
    if (!optedOut.has(e)) audience.add(e);
  }
  const recipients = Array.from(audience);

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, audience: recipients.length });
  }

  // Refus BRUYANT si l'audience dépasse ce qu'un run peut envoyer sûrement — AVANT
  // de claim la campagne, donc la key reste réutilisable après segmentation.
  if (recipients.length > MAX_AUDIENCE_PER_RUN) {
    return NextResponse.json({
      error:    `Audience trop grande pour un seul envoi (${recipients.length} > ${MAX_AUDIENCE_PER_RUN}). Segmentez l'envoi pour éviter un timeout à mi-parcours.`,
      audience: recipients.length,
    }, { status: 413 });
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
