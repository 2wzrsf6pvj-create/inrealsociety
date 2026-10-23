// GET /conversation/[messageId]/manifest.webmanifest — l'app installée depuis
// une conversation la rouvre (cf. lib/web-manifest). Aucune lecture en base :
// l'adresse de départ reprend l'identifiant de la page, validé.

import { z } from 'zod';
import { manifestResponse } from '@/lib/web-manifest';

export async function GET(_req: Request, props: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await props.params;
  if (!z.string().uuid().safeParse(messageId).success) {
    return new Response('Not found', { status: 404 });
  }
  return manifestResponse(`/conversation/${messageId}`);
}
