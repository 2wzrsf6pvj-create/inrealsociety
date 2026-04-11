// src/app/dashboard/page.tsx — Server Component
// Dashboard sécurisé : accès uniquement par session Supabase Auth.
// Plus d'UUID dans l'URL — le membre est résolu depuis auth.uid().

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Mon espace',
  description: 'Gérez votre profil, consultez vos scans et vos messages sur In Real Society.',
};
import { createClient } from '@/lib/supabase-server';
import { getMemberByAuthUserId, getRecentScans, getMessages, getUnreadMessagesCount } from '@/lib/supabase';
import DashboardClient from './[memberId]/DashboardClient';

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Non authentifié → login
  if (!user) {
    redirect('/auth/login?redirect=/dashboard');
  }

  // Cherche le profil lié à ce compte
  const member = await getMemberByAuthUserId(user.id);

  // Pas encore de profil → onboarding
  if (!member) {
    redirect('/register');
  }

  const [recentScans, messages, unreadCount] = await Promise.all([
    getRecentScans(member.id, 5),
    getMessages(member.id, 10),
    getUnreadMessagesCount(member.id),
  ]);

  return <DashboardClient member={member} recentScans={recentScans} messages={messages} unreadCount={unreadCount} />;
}