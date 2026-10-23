// Page d'invitation /join/<code>. Le parrain est résolu côté serveur : le code de
// parrainage (migration 060) n'est pas lisible côté client, et le lien ne mène
// jamais à l'identifiant du profil. Les anciens liens à identifiant restent valables.

import type { Metadata } from 'next';
import { resolveReferrer } from '@/lib/referral';
import JoinClient from './JoinClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Invitation',
  robots: { index: false, follow: false },
};

export default async function JoinPage(props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  const referrer = await resolveReferrer(params.code);
  return <JoinClient code={referrer ? params.code : null} referrerName={referrer?.name ?? null} />;
}
