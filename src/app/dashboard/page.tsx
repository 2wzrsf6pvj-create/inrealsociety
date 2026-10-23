// src/app/dashboard/page.tsx — Server Component
// Dashboard sécurisé : accès uniquement par session Supabase Auth.
// Plus d'UUID dans l'URL — le membre est résolu depuis auth.uid().

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Mon espace',
  description: 'Gérez votre profil, consultez vos scans et vos messages sur In Real Society.',
  // Installée depuis ici, l'app s'ouvre sur « Mon espace » (cf. lib/web-manifest).
  manifest: '/dashboard/manifest.webmanifest',
};
import { createClient } from '@/lib/supabase-server';
import { getMemberByAuthUserId } from '@/lib/supabase';
import { getRecentScans, getScansByDay, getScanCountSince, claimOrphanedMember } from '@/lib/queries-server';
import { getMessages, getMessagesCount, getActiveConversationsCount, getConversationsTotal, getUnreadMessagesCount } from '@/lib/inbox';
import DashboardClient from './[memberId]/DashboardClient';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Non authentifié → login
  if (!user) {
    redirect('/auth/login?redirect=/dashboard');
  }

  // Cherche le profil lié à ce compte. On passe le client AUTHENTIFIÉ (porteur
  // du cookie) car la RPC get_own_member() s'appuie sur auth.uid().
  let member = await getMemberByAuthUserId(supabase);

  // Self-heal (M4) : aucun profil lié, mais peut-être un profil ORPHELIN (compte
  // auth supprimé → auth_user_id nullé) récupérable via l'email VÉRIFIÉ. Évite le
  // lockout (le code d'activation est consommé, /register ne sauverait pas). Gate
  // sur email_confirmed_at : sans email vérifié, revendiquer un profil serait
  // usurpable.
  if (!member && user.email && user.email_confirmed_at) {
    member = await claimOrphanedMember(user.id, user.email);
  }

  // Pas encore de profil → onboarding
  if (!member) {
    redirect('/register');
  }

  const [recentScans, messages, unreadCount, activeConversations, recentConversations, totalConversations, scansByDay, weekScans] = await Promise.all([
    getRecentScans(member.id, 5),
    getMessages(member.id, 10),
    getUnreadMessagesCount(member.id),
    getMessagesCount(member.id),
    getActiveConversationsCount(member.id),
    getConversationsTotal(member.id),
    member.plan === 'premium' ? getScansByDay(member.id, 7) : Promise.resolve([]),
    getScanCountSince(member.id, 7),
  ]);

  return <DashboardClient member={member} recentScans={recentScans} messages={messages} unreadCount={unreadCount} activeConversations={activeConversations} recentConversations={recentConversations} totalConversations={totalConversations} scansByDay={scansByDay} weekScans={weekScans} />;
}