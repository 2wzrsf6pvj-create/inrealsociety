// GET /api/shop/tagline/<id> — tracé vectoriel d'UNE accroche, pour l'aperçu en
// direct sur la photo du t-shirt. Avant, la boutique embarquait les tracés de
// TOUTES les accroches (~230 ko compressés, la moitié de son JavaScript) pour
// n'en afficher qu'une. Généré au build (une réponse statique par accroche).

import { NextResponse } from 'next/server';
import { BAKED_TAGLINES } from '@/lib/taglines.generated';

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(BAKED_TAGLINES).map((id) => ({ id }));
}

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const baked = Object.hasOwn(BAKED_TAGLINES, params.id) ? BAKED_TAGLINES[params.id] : null;
  if (!baked) return NextResponse.json({ error: 'Accroche inconnue.' }, { status: 404 });
  return NextResponse.json({ path: baked.path, bbox: baked.bbox });
}
