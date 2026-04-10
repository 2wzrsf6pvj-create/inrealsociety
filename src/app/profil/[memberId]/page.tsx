// app/profil/[memberId]/page.tsx — Server Component
import { notFound } from 'next/navigation';
import { getMemberById, getFirstScanAt } from '@/lib/supabase';
import ProfilClient from './ProfilClient';

interface Props { params: { memberId: string } }

export async function generateMetadata({ params }: Props) {
  const member = await getMemberById(params.memberId);
  if (!member) return { title: 'In Real Society' };
  return {
    title: `${member.name} — In Real Society`,
    description: member.pitch,
    openGraph: {
      title: `${member.name} — In Real Society`,
      description: member.pitch,
    },
  };
}

export default async function ProfilPage({ params }: Props) {
  const [member, firstScanAt] = await Promise.all([
    getMemberById(params.memberId),
    getFirstScanAt(params.memberId),
  ]);

  if (!member) notFound();

  return <ProfilClient member={member} firstScanAt={firstScanAt} />;
}