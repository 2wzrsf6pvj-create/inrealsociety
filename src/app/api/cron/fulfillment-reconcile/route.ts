// GET /api/cron/fulfillment-reconcile
// Filet (M3-3) : un fulfillment Printful échoué (Printful down au moment du
// webhook OU de member/create) laissait une commande PAYÉE sans t-shirt, jamais
// retentée — re-soumettre member/create tombe sur `already_exists` et zappe le
// fulfillment. Ce cron repère les orders `paid` sans `printful_order_id`, résout
// le membre via `activation_code` (orders n'a pas de member_id), et rejoue
// `fulfillOrder` (idempotent via external_id Printful).
//
// Skip si le code n'est pas encore lié à un membre : l'acheteur a payé mais pas
// encore activé son code → le fulfillment se fera naturellement à l'inscription.
//
// Protégé par CRON_SECRET (Vercel Cron envoie Authorization: Bearer).

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { fulfillOrder } from '@/lib/fulfillment';
import { audit } from '@/lib/audit';

const BATCH_SIZE = 50;
// Garde-fou anti-boucle : BATCH_SIZE × MAX_BATCHES = 5000 orders en attente / run.
const MAX_BATCHES = 100;
// Sentinelle keyset : UUID nul, < à tout UUID réel (valide pour le cast Postgres).
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let checked = 0, fulfilled = 0, skipped = 0, failed = 0;

  // Pagination KEYSET par id : les orders fulfillées sortent du filtre
  // (printful_order_id renseigné), celles encore en échec/non activées y restent
  // et seront reprises au prochain run (chaque run re-balaie depuis le début).
  let lastId = ZERO_UUID;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('id, activation_code, tshirt_color, tshirt_size')
      .eq('status', 'paid')
      .is('printful_order_id', null)
      .not('activation_code', 'is', null)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('[cron/fulfillment-reconcile]', error);
      return NextResponse.json({ error: 'Erreur SQL.', checked, fulfilled, skipped, failed }, { status: 500 });
    }
    if (!orders || orders.length === 0) break;

    for (const o of orders) {
      lastId = o.id;
      checked++;

      // Résout le membre via le code d'activation (la RPC create_member_with_code
      // pose activation_codes.member_id à la création — migration 014 §4).
      const { data: codeRow } = await supabaseAdmin
        .from('activation_codes')
        .select('member_id')
        .eq('code', o.activation_code)
        .maybeSingle();

      if (!codeRow?.member_id) { skipped++; continue; } // pas encore activé → plus tard

      const tshirtColor = o.tshirt_color === 'light' ? 'light' : 'dark';
      try {
        const result = await fulfillOrder({ orderId: o.id, memberId: codeRow.member_id, tshirtColor, tshirtSize: o.tshirt_size });
        if (result.ok && !result.alreadyFulfilled) {
          fulfilled++;
          audit({
            action:   'order.fulfilled',
            memberId: codeRow.member_id,
            metadata: { orderId: o.id, printfulOrderId: result.printfulOrderId, trigger: 'cron_reconcile' },
          });
        } else if (!result.ok) {
          failed++;
          audit({
            action:   'order.fulfillment_failed',
            memberId: codeRow.member_id,
            metadata: { orderId: o.id, reason: result.reason, trigger: 'cron_reconcile' },
          });
          console.error('[cron/fulfillment-reconcile] failed', o.id, result.reason);
        }
        // result.ok && alreadyFulfilled : course avec un autre chemin → rien à faire.
      } catch (err) {
        failed++;
        console.error('[cron/fulfillment-reconcile] exception', o.id, err);
      }
    }

    if (orders.length < BATCH_SIZE) break;
  }

  console.log('[cron/fulfillment-reconcile]', { checked, fulfilled, skipped, failed });
  return NextResponse.json({ ok: true, checked, fulfilled, skipped, failed });
}
