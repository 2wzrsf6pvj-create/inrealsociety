// app/conversation/[messageId]/page.tsx
// Page conversation — pour le scanner (voir la réponse) ET le membre (répondre).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { createClient } from '@/lib/supabase-server';
import ConversationClient from './ConversationClient';

interface Props { params: { messageId: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data: message } = await supabase
    .from('messages')
    .select('members(name)')
    .eq('id', params.messageId)
    .single();

  const members = message?.members as unknown as { name: string } | null;
  const name = members?.name ?? 'Un membre';
  return {
    title: `Conversation avec ${name}`,
    description: `Échangez avec ${name} sur In Real Society.`,
  };
}

export default async function ConversationPage({ params }: Props) {
  const { data: message } = await supabase
    .from('messages')
    .select('*, members(name, photo_url, instagram, auth_user_id)')
    .eq('id', params.messageId)
    .single();

  if (!message || message.moderated) notFound();

  // Détecte si le visiteur est le propriétaire du profil (le membre)
  let isOwner = false;
  try {
    const serverSupabase = createClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (user && message.members?.auth_user_id === user.id) {
      isOwner = true;
    }
  } catch {}

  // Marque la réponse comme lue si le scanner revient
  if (!isOwner && message.reply && !message.reply_read_at) {
    await supabase
      .from('messages')
      .update({ reply_read_at: new Date().toISOString() })
      .eq('id', params.messageId);
  }

  return <ConversationClient message={message} isOwner={isOwner} />;
}