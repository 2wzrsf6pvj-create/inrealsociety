// GET /dashboard/manifest.webmanifest — l'app installée depuis « Mon espace »
// s'y rouvre (cf. lib/web-manifest). Identique pour tous : généré au build.

import { manifestResponse } from '@/lib/web-manifest';

export const dynamic = 'force-static';

export function GET() {
  return manifestResponse('/dashboard');
}
