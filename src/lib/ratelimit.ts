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

/** Extrait l'IP réelle depuis les headers Next.js / Vercel */
export function getIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
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