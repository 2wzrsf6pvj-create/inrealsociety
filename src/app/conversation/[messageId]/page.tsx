// app/conversation/[messageId]/page.tsx
// Page conversation — pour le scanner (voir la réponse) ET le membre (répondre).

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
// Lectures via supabaseAdmin : le scanner n'est jamais authentifié et la RLS
// messages est owner-only. L'accès est protégé par le messageId non-devinable
// (modèle lien-capability, comme les liens envoyés par email).
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import { SENDER_TOKEN_COOKIE, isOriginDevice } from '@/lib/sender-token';
import ConversationClient from './ConversationClient';

interface Props { params: { messageId: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data: message } = await supabaseAdmin
    .from('messages')
    .select('members(name)')
    .eq('id', params.messageId)
    .maybeSingle();

  const members = message?.members as unknown as { name: string } | null;
  const name = members?.name ?? 'Un membre';
  return {
    title: `Conversation avec ${name}`,
    description: `Échangez avec ${name} sur In Real Society.`,
    robots: { index: false, follow: false },
  };
}

export default async function ConversationPage({ params }: Props) {
  const { data: message } = await supabaseAdmin
    .from('messages')
    .select('*, members(name, photo_url, instagram, auth_user_id)')
    .eq('id', params.messageId)
    .maybeSingle();

  if (!message || message.moderated) notFound();

  // Charge les réponses du thread (avec read_at pour décider quoi marquer)
  const { data: threadReplies } = await supabaseAdmin
    .from('messages')
    .select('id, content, author, created_at, read_at')
    .eq('parent_id', params.messageId)
    .eq('moderated', false)
    .order('created_at', { ascending: true });

  // Détecte si le visiteur est le propriétaire du profil (le membre)
  let isOwner = false;
  try {
    const serverSupabase = createClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (user && message.members?.auth_user_id === user.id) {
      isOwner = true;
    }
  } catch {}

  // Le lien suffit pour lire (autre appareil, aperçu de lien d'une messagerie) ;
  // seul l'appareil d'origine du passant répond en son nom et vaut lecture.
  const originDevice = isOriginDevice(message.sender_token, cookies().get(SENDER_TOKEN_COOKIE)?.value);

  // Marque comme lu les messages que le visiteur n'a pas écrits :
  //   * membre qui visite → marque les messages du scanner (root + thread)
  //   * scanner qui revient sur son appareil → marque les replies du membre
  //     (« Lu ✓ » côté porteur : pas pour un simple aperçu de lien)
  const now = new Date().toISOString();
  const otherAuthor = isOwner ? 'scanner' : 'member';
  const unreadFromOther = isOwner || originDevice
    ? (threadReplies ?? []).filter(r => r.author === otherAuthor && !r.read_at)
    : [];

  if (unreadFromOther.length > 0) {
    await supabaseAdmin
      .from('messages')
      .update({ read_at: now })
      .in('id', unreadFromOther.map(r => r.id));
  }

  // Le message racine est toujours écrit par le scanner. Si c'est le membre qui
  // visite et que c'est non lu, on le marque.
  if (isOwner && !message.read_at) {
    await supabaseAdmin.from('messages').update({ read_at: now }).eq('id', params.messageId);
  }

  // Ne pas exposer l'auth_user_id du membre au navigateur : isOwner est déjà
  // calculé côté serveur, le client n'en a pas besoin.
  if (message.members && typeof message.members === 'object') {
    (message.members as { auth_user_id?: string | null }).auth_user_id = null;
  }

  // Jeton device du scanneur : donnée de sécurité, jamais exposée au navigateur.
  const blocked = !!message.blocked_at;
  (message as { sender_token?: string | null }).sender_token = null;

  return <ConversationClient message={message} isOwner={isOwner} originDevice={originDevice} thread={threadReplies || []} blocked={blocked} />;
}