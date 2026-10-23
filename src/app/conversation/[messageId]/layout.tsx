// app/conversation/[messageId]/layout.tsx
// Manifeste de la conversation (cf. lib/web-manifest) et balises Apple de l'app
// installée, posés ici plutôt que dans les métadonnées : generateMetadata attend
// la base, et Next envoie alors toutes les métadonnées de la page après coup,
// dans le <body>. Chrome et Safari n'y cherchent pas le manifeste, et Next ne
// remet dans le <head> que les icônes. Ce layout se rend sans attente : React
// place ses balises dans le <head>.

import { z } from 'zod';
import { APPLE_WEB_APP } from '@/lib/web-manifest';

export default async function ConversationLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ messageId: string }>;
}) {
  const { messageId } = await params;
  return (
    <>
      {z.string().uuid().safeParse(messageId).success && (
        <link rel="manifest" href={`/conversation/${messageId}/manifest.webmanifest`} />
      )}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content={APPLE_WEB_APP.title} />
      <meta name="apple-mobile-web-app-status-bar-style" content={APPLE_WEB_APP.statusBarStyle} />
      {children}
    </>
  );
}
