// src/app/dashboard/[memberId]/page.tsx — Server Component
// Conservé pour rétrocompatibilité (liens emails existants).
// Vérification d'ownership : si le membre a un auth_user_id,
// seul l'utilisateur authentifié correspondant peut accéder.

import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getMemberById, getRecentScans, getScansByDay, getScanCountSince } from '@/lib/queries-server';
import { getMessages, getMessagesCount, getActiveConversationsCount, getConversationsTotal, getUnreadMessagesCount } from '@/lib/inbox';
import { recordPhone } from '@/lib/phone';
import DashboardClient from './DashboardClient';

interface Props {
  params: Promise<{ memberId: string }>;
}

export default async function DashboardByIdPage(props: Props) {
  const params = await props.params;
  const { memberId } = params;

  const member = await getMemberById(memberId);
  if (!member) notFound();

  // ─── Auth + ownership OBLIGATOIRES (pas de bypass legacy) ─────────────────
  // getMemberById renvoie le record complet (email, stripe_*) via le client
  // admin. Sans ce check, un membre sans auth_user_id (legacy / auth supprimé)
  // était lisible par N'IMPORTE QUEL user connecté en devinant l'UUID public
  // (/profil/<uuid>) → IDOR. Un membre sans auth_user_id n'a pas de
  // propriétaire → personne ne peut ouvrir ce dashboard.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?redirect=/dashboard/${memberId}`);
  }
  if (member.auth_user_id !== user.id) {
    redirect('/dashboard');
  }

  // iPhone ou Android : pour les chiffres de /admin (cf. lib/phone). L'app
  // installée s'ouvre sur /dashboard, jamais ici.
  recordPhone(member, (await headers()).get('user-agent'), false);

  const [recentScans, messages, unreadCount, activeConversations, recentConversations, totalConversations, scansByDay, weekScans] = await Promise.all([
    getRecentScans(memberId, 5),
    getMessages(memberId, 10),
    getUnreadMessagesCount(memberId),
    getMessagesCount(memberId),
    getActiveConversationsCount(memberId),
    getConversationsTotal(memberId),
    member.plan === 'premium' ? getScansByDay(memberId, 7) : Promise.resolve([]),
    getScanCountSince(memberId, 7),
  ]);

  return <DashboardClient member={member} recentScans={recentScans} messages={messages} unreadCount={unreadCount} activeConversations={activeConversations} recentConversations={recentConversations} totalConversations={totalConversations} scansByDay={scansByDay} weekScans={weekScans} />;
}