// app/conversation/[messageId]/page.tsx
// Page publique — le scanner revient voir la réponse du membre

import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ConversationClient from './ConversationClient';

interface Props { params: { messageId: string } }

export default async function ConversationPage({ params }: Props) {
  const { data: message } = await supabase
    .from('messages')
    .select('*, members(name, photo_url, instagram)')
    .eq('id', params.messageId)
    .single();

  if (!message || message.moderated) notFound();

  // Marque la réponse comme lue si elle existe
  if (message.reply && !message.reply_read_at) {
    await supabase
      .from('messages')
      .update({ reply_read_at: new Date().toISOString() })
      .eq('id', params.messageId);
  }

  return <ConversationClient message={message} />;
}