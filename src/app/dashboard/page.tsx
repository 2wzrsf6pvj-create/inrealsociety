// src/app/dashboard/page.tsx — Server Component
// Dashboard sécurisé : accès uniquement par session Supabase Auth.
// Plus d'UUID dans l'URL — le membre est résolu depuis auth.uid().

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getMemberByAuthUserId, getRecentScans } from '@/lib/supabase';
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

  const recentScans = await getRecentScans(member.id, 5);

  return <DashboardClient member={member} recentScans={recentScans} />;
}