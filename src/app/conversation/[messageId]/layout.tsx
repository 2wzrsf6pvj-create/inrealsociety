// app/conversation/[messageId]/layout.tsx
// Manifeste de la conversation (cf. lib/web-manifest), posé ici plutôt que dans
// generateMetadata : pour une page dynamique, Next diffuse les métadonnées après
// coup, dans le <body>, où Chrome et Safari ne cherchent pas le manifeste. Rendu
// dans un layout, React le place dans le <head>.

import { z } from 'zod';

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
      {children}
    </>
  );
}
