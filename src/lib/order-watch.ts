// src/lib/order-watch.ts — Commandes à surveiller, pour /admin (choix de
// Clément) : payées mais pas imprimées, et codes d'activation non utilisés
// après 7 jours. Les alertes email existent déjà ; la liste évite qu'un client
// qui a payé passe entre les mailles. Aussi la recherche d'un porteur ou d'une
// commande (service client). SERVEUR UNIQUEMENT.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { FULFILL_ON_PAYMENT } from '@/lib/constants';

const HOUR = 3_600_000;
const DAY  = 24 * HOUR;

/** Délai laissé à l'impression avant de la signaler (elle part au paiement). */
export const UNPRINTED_AFTER_HOURS = 1;
/** Code d'activation non utilisé depuis ce délai : à relancer. */
export const NOT_ACTIVATED_AFTER_DAYS = 7;
const LOOKBACK_DAYS = 90;

export interface WatchedOrder {
  id:        string;
  email:     string;
  createdAt: string;
  status:    string;
  color:     string;
  size:      string;
  code:      string | null;
  codeUsed:  boolean;
  printed:   boolean;
}

export interface OrderWatch { unprinted: WatchedOrder[]; notActivated: WatchedOrder[] }

/** Impression au paiement (FULFILL_ON_PAYMENT) : toute commande payée doit être
 *  imprimée ; sinon, seulement celles dont le profil est activé. */
export function classifyOrders(orders: WatchedOrder[], now: Date, fulfillOnPayment: boolean): OrderWatch {
  const age = (o: WatchedOrder) => now.getTime() - Date.parse(o.createdAt);
  return {
    unprinted: orders.filter((o) =>
      o.status === 'paid' && !o.printed && age(o) >= UNPRINTED_AFTER_HOURS * HOUR && (fulfillOnPayment || o.codeUsed)),
    notActivated: orders.filter((o) =>
      o.status === 'paid' && !!o.code && !o.codeUsed && age(o) >= NOT_ACTIVATED_AFTER_DAYS * DAY),
  };
}

const ORDER_COLUMNS = 'id, email, created_at, status, tshirt_color, tshirt_size, activation_code, printful_order_id';
type OrderRow = {
  id: string; email: string; created_at: string; status: string; tshirt_color: string; tshirt_size: string;
  activation_code: string | null; printful_order_id: string | null;
};

/** Ajoute l'état du code d'activation (utilisé ou non) aux commandes. */
async function withCodeState(rows: OrderRow[]): Promise<WatchedOrder[]> {
  const codes = [...new Set(rows.map((r) => r.activation_code).filter((c): c is string => !!c))];
  const used = new Set<string>();
  for (let i = 0; i < codes.length; i += 100) {
    const { data, error } = await supabaseAdmin
      .from('activation_codes').select('code').in('code', codes.slice(i, i + 100)).eq('used', true);
    if (error) throw new Error(`[order-watch] codes : ${error.message}`);
    for (const row of data ?? []) used.add(row.code as string);
  }
  return rows.map((r) => ({
    id: r.id, email: r.email, createdAt: r.created_at, status: r.status,
    color: r.tshirt_color, size: r.tshirt_size, code: r.activation_code,
    codeUsed: !!r.activation_code && used.has(r.activation_code), printed: !!r.printful_order_id,
  }));
}

export async function loadOrderWatch(now = new Date()): Promise<OrderWatch> {
  const { data, error } = await supabaseAdmin
    .from('orders').select(ORDER_COLUMNS)
    .eq('status', 'paid')
    .gte('created_at', new Date(now.getTime() - LOOKBACK_DAYS * DAY).toISOString())
    .lte('created_at', new Date(now.getTime() - UNPRINTED_AFTER_HOURS * HOUR).toISOString())
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`[order-watch] commandes : ${error.message}`);
  return classifyOrders(await withCodeState((data ?? []) as OrderRow[]), now, FULFILL_ON_PAYMENT);
}

// ─── Recherche d'un porteur ou d'une commande ─────────────────────────────────

export interface MemberHit {
  id: string; name: string | null; email: string | null; createdAt: string;
  plan: string | null; paused: boolean; suspended: boolean; shortCode: string | null;
}
export interface SearchResults { query: string; members: MemberHit[]; orders: WatchedOrder[] }

/** Recherche littérale : les caractères génériques de LIKE et de PostgREST
 *  (%, *) et l'échappement (\) sont retirés. */
export function cleanQuery(raw: string): string {
  return raw.replace(/[%*\\]/g, '').trim().slice(0, 100);
}

const MEMBER_COLUMNS = 'id, name, email, created_at, plan, is_paused, suspended_at, short_code';
type MemberRow = {
  id: string; name: string | null; email: string | null; created_at: string; plan: string | null;
  is_paused: boolean | null; suspended_at: string | null; short_code: string | null;
};

/** Par prénom ou email (contient), code court du QR ou code d'activation (exact). */
export async function searchAdmin(raw: string): Promise<SearchResults | null> {
  const query = cleanQuery(raw);
  if (query.length < 2) return null;
  const like = `%${query}%`;
  const results = await Promise.all([
    supabaseAdmin.from('members').select(MEMBER_COLUMNS).ilike('name', like).limit(20),
    supabaseAdmin.from('members').select(MEMBER_COLUMNS).ilike('email', like).limit(20),
    supabaseAdmin.from('members').select(MEMBER_COLUMNS).eq('short_code', query.toLowerCase()).limit(5),
    supabaseAdmin.from('orders').select(ORDER_COLUMNS).ilike('email', like).order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('orders').select(ORDER_COLUMNS).eq('activation_code', query.toUpperCase()).limit(5),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`[order-watch] recherche : ${failed.error.message}`);

  const uniqueById = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map((r) => [r.id, r])).values()];
  const memberRows = uniqueById(results.slice(0, 3).flatMap((r) => (r.data ?? []) as MemberRow[]));
  const orderRows  = uniqueById(results.slice(3).flatMap((r) => (r.data ?? []) as OrderRow[]));
  return {
    query,
    members: memberRows.map((m) => ({
      id: m.id, name: m.name, email: m.email, createdAt: m.created_at, plan: m.plan,
      paused: !!m.is_paused, suspended: !!m.suspended_at, shortCode: m.short_code,
    })),
    orders: await withCodeState(orderRows),
  };
}
