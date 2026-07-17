// src/lib/ratelimit.ts
// Rate limiting via Upstash Redis — double protection IP + memberId.
// Installation : npm install @upstash/ratelimit @upstash/redis
// Variables d'env : UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let redis: Redis;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redis;
}

// ─── Limiteurs ────────────────────────────────────────────────────────────────

/** 5 messages par IP par 10 minutes */
const limitMessageByIp = () => new Ratelimit({
  redis:   getRedis(),
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  prefix:  'rl:msg:ip',
});

/** 3 messages par membre cible par 10 minutes */
const limitMessageByMember = () => new Ratelimit({
  redis:   getRedis(),
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  prefix:  'rl:msg:member',
});

/** 20 scans par IP par minute */
const limitScanByIp = () => new Ratelimit({
  redis:   getRedis(),
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix:  'rl:scan:ip',
});

/** 10 scans par membre cible par minute */
const limitScanByMember = () => new Ratelimit({
  redis:   getRedis(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix:  'rl:scan:member',
});

/** 5 requêtes par user authentifié par 10 minutes (routes coûteuses) */
const limitAuthByUser = () => new Ratelimit({
  redis:   getRedis(),
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  prefix:  'rl:auth:user',
});

/** 30 requêtes par IP par minute (routes publiques à faible coût) */
const limitPublicByIp = () => new Ratelimit({
  redis:   getRedis(),
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix:  'rl:public:ip',
});

/** 3 renvois de code par EMAIL cible par heure (anti email-bombing).
 *  Le rate-limit par IP seul ne protège pas la victime : un attaquant peut
 *  spammer le renvoi de code vers un email tiers. On plafonne aussi par email. */
const limitResendByEmail = () => new Ratelimit({
  redis:   getRedis(),
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  prefix:  'rl:resend:email',
});

/** Déduplication des scans : 1 comptage par (membre, IP) toutes les 30 min.
 *  Distinct du rate-limit (anti-abus) : ici on évite juste de gonfler
 *  scan_count + de spammer l'email du membre quand un scanneur recharge /profil. */
const limitScanDedup = () => new Ratelimit({
  redis:   getRedis(),
  limiter: Ratelimit.fixedWindow(1, '30 m'),
  prefix:  'scan:dedup',
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  success:   boolean;
  limit:     number;
  remaining: number;
  reset:     number;
  reason?:   'ip' | 'member';
}

// ─── Fonctions publiques ──────────────────────────────────────────────────────

/**
 * Vérifie le rate limit pour l'envoi d'un message.
 * Double vérification : par IP ET par membre cible.
 */
export async function checkMessageRateLimit(
  ip: string,
  memberId: string,
): Promise<RateLimitResult> {
  const [byIp, byMember] = await Promise.all([
    limitMessageByIp().limit(ip),
    limitMessageByMember().limit(memberId),
  ]);

  if (!byIp.success) {
    return {
      success:   false,
      limit:     byIp.limit,
      remaining: byIp.remaining,
      reset:     byIp.reset,
      reason:    'ip',
    };
  }

  if (!byMember.success) {
    return {
      success:   false,
      limit:     byMember.limit,
      remaining: byMember.remaining,
      reset:     byMember.reset,
      reason:    'member',
    };
  }

  return {
    success:   true,
    limit:     byIp.limit,
    remaining: byIp.remaining,
    reset:     byIp.reset,
  };
}

/**
 * Vérifie le rate limit pour un scan QR.
 * Double vérification : par IP ET par membre cible.
 */
export async function checkScanRateLimit(
  ip: string,
  memberId: string,
): Promise<RateLimitResult> {
  const [byIp, byMember] = await Promise.all([
    limitScanByIp().limit(ip),
    limitScanByMember().limit(memberId),
  ]);

  if (!byIp.success) {
    return {
      success:   false,
      limit:     byIp.limit,
      remaining: byIp.remaining,
      reset:     byIp.reset,
      reason:    'ip',
    };
  }

  if (!byMember.success) {
    return {
      success:   false,
      limit:     byMember.limit,
      remaining: byMember.remaining,
      reset:     byMember.reset,
      reason:    'member',
    };
  }

  return {
    success:   true,
    limit:     byIp.limit,
    remaining: byIp.remaining,
    reset:     byIp.reset,
  };
}

/**
 * Rate limit pour les routes authentifiées coûteuses (checkout, send-email, reply).
 * Limite par userId Supabase Auth.
 */
export async function checkAuthRateLimit(userId: string): Promise<RateLimitResult> {
  try {
    const result = await limitAuthByUser().limit(userId);
    return {
      success:   result.success,
      limit:     result.limit,
      remaining: result.remaining,
      reset:     result.reset,
    };
  } catch (err) {
    // Fail-open CENTRALISÉ : une panne Redis ne doit pas casser les actions d'un
    // utilisateur DÉJÀ authentifié (identité connue, risque d'abus faible). Évite
    // que chaque route ait à wrapper l'appel — comportement uniforme. Les routes
    // PUBLIQUES gardent au contraire le fail-closed (throw → 500) anti-abus.
    console.warn('[ratelimit] auth limiter indisponible, fail-open:', err);
    return { success: true, limit: 0, remaining: 0, reset: Date.now() };
  }
}

/** Rate limit du renvoi de code d'activation, par EMAIL cible (anti email-bombing).
 *  Fail-open si Redis tombe (le renvoi de code n'est pas un vecteur d'abus majeur). */
export async function checkResendEmailRateLimit(email: string): Promise<RateLimitResult> {
  try {
    const result = await limitResendByEmail().limit(email);
    return {
      success:   result.success,
      limit:     result.limit,
      remaining: result.remaining,
      reset:     result.reset,
    };
  } catch {
    return { success: true, limit: 0, remaining: 0, reset: Date.now() };
  }
}

/**
 * Rate limit pour les routes publiques légères (push/subscribe).
 * Limite par IP.
 */
export async function checkPublicRateLimit(ip: string): Promise<RateLimitResult> {
  const result = await limitPublicByIp().limit(ip);
  return {
    success:   result.success,
    limit:     result.limit,
    remaining: result.remaining,
    reset:     result.reset,
  };
}

/**
 * Déduplication d'un scan : renvoie true si c'est un scan « neuf » pour ce
 * couple (membre, IP) dans la fenêtre, false si c'est un rechargement récent.
 * Permet de ne compter (et n'emailer) qu'une rencontre unique par scanneur.
 */
export async function isNewScan(memberId: string, ip: string): Promise<boolean> {
  // IP inconnue : impossible de dédupliquer de façon fiable (tous les scanneurs
  // sans IP partageraient le même bucket → faux doublons). On laisse passer.
  if (!ip || ip === 'anonymous') return true;
  try {
    const { success } = await limitScanDedup().limit(`${memberId}:${ip}`);
    return success;
  } catch {
    // Panne Redis : best-effort comme le reste du scan (RPC/email) → on compte.
    return true;
  }
}

/**
 * Libère le créneau de déduplication d'un scan. À appeler quand l'ÉCRITURE du scan
 * a échoué APRÈS que `isNewScan` a déjà consommé le créneau : sans ça, le marqueur
 * de dédup reste posé 30 min et tout retry est vu « doublon » → le scan est perdu
 * (sous-comptage + email manqué). Best-effort : une panne de reset ne casse rien.
 */
export async function releaseScanDedup(memberId: string, ip: string): Promise<void> {
  if (!ip || ip === 'anonymous') return;
  try {
    await limitScanDedup().resetUsedTokens(`${memberId}:${ip}`);
  } catch {
    // Reset best-effort : au pire le créneau expire naturellement (30 min).
  }
}

/** Extrait l'IP réelle depuis les headers Next.js / Vercel.
 *
 * ⚠️ Sécurité : `x-real-ip` D'ABORD. Sur Vercel c'est l'IP réelle du pair, posée
 * par la plateforme et non-spoofable. `x-forwarded-for` est APPENDÉ par Vercel
 * (vraie IP à DROITE) → son segment de GAUCHE est fourni par le client : le lire
 * en premier laissait un attaquant varier l'IP à chaque requête et contourner
 * TOUT le rate limiting par IP. On ne retombe sur x-forwarded-for (segment gauche)
 * qu'en dev/local où x-real-ip est absent. */
export function getIp(req: Request): string {
  return (
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anonymous'
  );
}

/** Headers HTTP standard pour les réponses 429 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit':     String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset':     String(result.reset),
    'Retry-After':           String(Math.ceil((result.reset - Date.now()) / 1000)),
  };
}