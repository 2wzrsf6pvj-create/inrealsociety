// src/app/dashboard/[memberId]/page.tsx — Server Component
// Conservé pour rétrocompatibilité (liens emails existants).
// Vérification d'ownership : si le membre a un auth_user_id,
// seul l'utilisateur authentifié correspondant peut accéder.

import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getMemberById, getRecentScans } from '@/lib/supabase';
import DashboardClient from './DashboardClient';

interface Props {
  params: { memberId: string };
}

export default async function DashboardByIdPage({ params }: Props) {
  const { memberId } = params;

  const member = await getMemberById(memberId);
  if (!member) notFound();

  // ─── Si le membre a un compte Auth → vérification obligatoire ────────────
  if (member.auth_user_id) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Non authentifié → login (avec redirect de retour)
    if (!user) {
      redirect(`/auth/login?redirect=/dashboard/${memberId}`);
    }

    // Authentifié mais mauvais compte → son propre dashboard
    if (user.id !== member.auth_user_id) {
      redirect('/dashboard');
    }
  }
  // Si auth_user_id est null → membre legacy, accès par UUID conservé

  const recentScans = await getRecentScans(memberId, 5);

  return <DashboardClient member={member} recentScans={recentScans} />;
}