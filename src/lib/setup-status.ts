// src/lib/setup-status.ts — Ce que l'app voit de sa configuration, pour /admin
// (chemin vers J0) : variables présentes ou manquantes, paiements réels ou de
// test, domaine encodé dans les QR imprimés. Jamais la valeur d'un secret.
// Le reste (emails de Supabase, DNS, Stripe, Printful) ne se voit pas d'ici :
// docs/MISE_EN_PRODUCTION.md. SERVEUR UNIQUEMENT.

const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
/** Une variante Printful par couleur et par taille (cf. fulfillment). */
export const PRINTFUL_VARIANTS = ['DARK', 'LIGHT'].flatMap((c) => SIZES.map((s) => `PRINTFUL_VARIANT_ID_${c}_${s}`));

export interface SetupCheck {
  label:  string;
  ok:     boolean;
  /** L'état, ou ce qui manque et ce que ça empêche. */
  detail: string;
}
export interface SetupGroup { title: string; checks: SetupCheck[] }

type Env = Record<string, string | undefined>;

export function setupStatus(env: Env, { migration062, migration063 }: { migration062: boolean; migration063: boolean }): SetupGroup[] {
  const absent = (keys: string[]) => keys.filter((k) => !env[k]?.trim());
  const vars = (label: string, keys: string[], ok: string, without: string): SetupCheck => {
    const missing = absent(keys);
    return { label, ok: missing.length === 0, detail: missing.length === 0 ? ok : `${without} (manque : ${missing.join(', ')})` };
  };

  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim() ?? '';
  let host = '';
  try { host = appUrl ? new URL(appUrl).host : ''; } catch { /* adresse illisible */ }
  const provisional = host.endsWith('.vercel.app') || host.startsWith('localhost');
  const stripeKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
  const live = /^(sk|rk)_live_/.test(stripeKey);
  const variants = absent(PRINTFUL_VARIANTS);
  const shortDomain = env.SHORT_DOMAIN?.trim().replace(/\/$/, '');
  let shortHost = '';
  try { shortHost = shortDomain ? new URL(shortDomain).host : ''; } catch { /* adresse illisible */ }
  // Domaine court en place : les QR l'encodent, plus le domaine principal.
  const shortOk = !!shortHost && shortHost !== host;
  const push = vars('Notifications', ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'], 'configurées',
    'aucune notification : un message n’est vu qu’en ouvrant le site');
  // La clé publique sert deux fois : au serveur et au navigateur. Différentes,
  // les abonnements ne correspondent pas à la clé d'envoi : rien n'arrive.
  const pushKeysDiffer = push.ok && env.VAPID_PUBLIC_KEY?.trim() !== env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const migrations = [
    ...(migration062 ? [] : ['062 (téléphone des porteurs)']),
    ...(migration063 ? [] : ['063 (origine des achats)']),
  ];

  return [
    { title: 'Site et base', checks: [
      { label: 'Domaine', ok: !!host && !provisional,
        detail: !host ? 'NEXT_PUBLIC_APP_URL manquante ou illisible'
          : provisional && shortOk ? `${host} : domaine provisoire, à remplacer avant d'ouvrir (liens des emails, pages des profils).`
          : provisional ? `${host} : domaine provisoire. Les QR imprimés l'encoderaient pour toujours.`
          : shortOk ? `${host} : liens des emails et pages des profils.`
          : `${host} : encodé dans les QR imprimés (${appUrl.replace(/\/$/, '')}/r/<code>).` },
      { label: 'Base', ok: migrations.length === 0,
        detail: migrations.length === 0 ? 'migrations à jour (063)'
          : `${migrations.length > 1 ? 'migrations' : 'migration'} ${migrations.join(', ')} à appliquer` },
      vars('Limites de débit', ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'], 'Upstash configuré',
        'scanner un QR, écrire, signaler : erreur'),
    ] },
    { title: 'Paiement et impression', checks: [
      { label: 'Paiements', ok: !!stripeKey,
        detail: !stripeKey ? 'STRIPE_SECRET_KEY manquante : pas de vente'
          : live ? 'réels : une commande payée part à l’impression'
          : 'de test (recette) : les commandes restent en brouillon chez Printful, rien n’est imprimé' },
      vars('Stripe', ['STRIPE_PRICE_ID', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PREMIUM_PRICE_ID'], 'prix et webhook configurés',
        'paiement ou premium indisponible, ou commandes payées non enregistrées'),
      vars('Printful', ['PRINTFUL_API_TOKEN'], 'configuré', 't-shirt payé jamais imprimé'),
      { label: 'Printful : tailles et couleurs', ok: variants.length === 0,
        detail: variants.length === 0 ? '10 variantes sur 10'
          : `${PRINTFUL_VARIANTS.length - variants.length} variantes sur 10 : une taille sans variante part dans la variante par défaut, ou n’est pas imprimée s’il n’y en a pas (manque : ${variants.join(', ')})` },
    ] },
    { title: 'Emails, alertes, tâches', checks: [
      vars('Emails', ['RESEND_API_KEY'], 'Resend configuré', 'aucun email : code d’activation, notifications'),
      vars('Alertes', ['ADMIN_ALERT_EMAIL'], 'configurées', 'personne n’est prévenu d’un signalement ni d’un échec qui touche l’argent'),
      vars('Tâches planifiées', ['CRON_SECRET'], 'configurées', 'purges et relances non lancées'),
      vars('Liens signés', ['INTERNAL_SECRET'], 'configurés', 'emails de scan sans lien de désinscription'),
      vars('Erreurs', ['NEXT_PUBLIC_SENTRY_DSN'], 'Sentry configuré', 'erreurs invisibles au-delà des logs Vercel'),
    ] },
    { title: 'Test terrain', checks: [
      pushKeysDiffer
        ? { label: 'Notifications', ok: false, detail: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY doit être identique à VAPID_PUBLIC_KEY : sinon rien n’arrive' }
        : push,
      // Choix de Clément : QR en inreal.me/<code> (portée ≈ 2,5 m au lieu de 2,0 m).
      { label: 'Domaine court des QR', ok: shortOk,
        detail: !shortDomain
          ? 'vide : les QR encoderaient le domaine principal, portée de scan ≈ 2,0 m au lieu de 2,5 m. À renseigner (https://inreal.me) une fois le domaine ajouté au projet Vercel.'
          : !shortHost ? `${shortDomain} : adresse illisible`
          : shortHost === host ? `${shortHost} : c'est le domaine principal, pas un domaine court`
          : `${shortHost} : les QR encodent ${shortDomain}/<code>. Le domaine doit être ajouté au projet Vercel, sans redirection vers le domaine principal.` },
    ] },
  ];
}
