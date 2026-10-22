// src/app/preview/dashboard/page.tsx
// ⚠️ PREVIEW DEV UNIQUEMENT — rend le dashboard connecté avec des données
// factices, SANS Supabase ni authentification. 404 en production.
//
// But : voir/tester l'UI connectée (Accueil / Messages / Réglages) en local
// sans backend. Les actions qui appellent une API (répondre, bloquer, toggles,
// premium, parrainage) échoueront silencieusement — c'est un aperçu visuel.
//
//   /preview/dashboard          → membre actif (scans, messages, premium)
//   /preview/dashboard?empty=1  → état cold-start (0 scan : guide d'activation)

import { notFound } from 'next/navigation';
import DashboardClient from '../../dashboard/[memberId]/DashboardClient';
import type { Member, Scan, Message } from '@/lib/types';
import { CONVERSATION_WINDOW_DAYS } from '@/lib/constants';

export const metadata = { title: 'Preview dashboard (dev)' };

export default function PreviewDashboardPage({ searchParams }: { searchParams: { empty?: string } }) {
  // Jamais accessible en prod.
  if (process.env.NODE_ENV === 'production') notFound();

  const empty = searchParams?.empty === '1';
  const now = Date.now();
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const H = 3_600_000, D = 24 * H;

  const member: Member = {
    id:                     '00000000-0000-4000-8000-000000000001',
    name:                   'Clément',
    pitch:                  "Si tu lis ça, c'est qu'on s'est croisés pour de vrai.",
    instagram:              empty ? null : 'clement',
    email:                  'clement@example.com',
    photo_url:              null,
    scan_count:             empty ? 0 : 27,
    is_paused:              false,
    require_contact:        false,
    plan:                   'premium',
    stripe_customer_id:     null,
    stripe_subscription_id: null,
    plan_expires_at:        null,
    marketing_consent:      false,
    marketing_consent_at:   null,
    created_at:             ago(12 * D),
    updated_at:             ago(1 * D),
    auth_user_id:           null,
  };

  const recentScans: Scan[] = empty ? [] : [
    { id: 's1', member_id: member.id, scanner_name: null,   scanned_at: ago(42 * 60_000), first_scan_at: null, latitude: null, longitude: null, location: 'Paris 11e' },
    { id: 's2', member_id: member.id, scanner_name: 'Léa',  scanned_at: ago(5 * H),       first_scan_at: null, latitude: null, longitude: null, location: 'Lyon' },
    { id: 's3', member_id: member.id, scanner_name: null,   scanned_at: ago(26 * H),      first_scan_at: null, latitude: null, longitude: null, location: null },
  ];

  const messages: Message[] = empty ? [] : [
    { id: 'm1', member_id: member.id, content: 'Belle audace.', sender_contact: '@lea', sender_name: 'Léa', is_quick_reply: true, moderated: false, read_at: null, created_at: ago(40 * 60_000) },
    { id: 'm2', member_id: member.id, content: "On s'est croisés au café ce matin — j'ai trouvé ça gonflé, ton t-shirt.", sender_contact: 'lea@example.com', sender_name: 'Léa', is_quick_reply: false, moderated: false, read_at: ago(3 * H), reply: "Merci ! Ça arrive plus souvent qu'on croit.", replied_at: ago(2 * H), reply_read_at: ago(1 * H), created_at: ago(6 * H) },
    { id: 'm3', member_id: member.id, content: 'Message d’une personne bloquée.', sender_contact: null, sender_name: null, is_quick_reply: false, moderated: false, read_at: ago(30 * H), blocked_at: ago(29 * H), created_at: ago(30 * H) },
  ];

  const scansByDay = empty ? [] : [1, 0, 3, 2, 5, 4, 12].map((count, i) => ({
    date: ago((6 - i) * D).slice(0, 10),
    count,
  }));

  const totalConversations = messages.length;
  const activeConversations = messages.filter(m => !m.blocked_at).length;
  const recentConversations = messages.filter(m => !m.blocked_at && Date.parse(m.created_at) > Date.now() - CONVERSATION_WINDOW_DAYS * D).length;
  const unreadCount = messages.filter(m => !m.read_at && !m.blocked_at).length;

  return (
    <DashboardClient
      member={member}
      recentScans={recentScans}
      messages={messages}
      unreadCount={unreadCount}
      activeConversations={activeConversations}
      recentConversations={recentConversations}
      totalConversations={totalConversations}
      scansByDay={scansByDay}
      weekScans={scansByDay.reduce((sum, d) => sum + d.count, 0)}
    />
  );
}
