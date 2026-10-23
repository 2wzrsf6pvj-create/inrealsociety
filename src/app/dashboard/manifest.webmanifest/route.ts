// GET /dashboard/manifest.webmanifest — l'app installée depuis « Mon espace »
// s'y rouvre (cf. lib/web-manifest). Identique pour tous : généré au build.

import { manifestResponse } from '@/lib/web-manifest';
import { FROM_APP } from '@/lib/constants';

export const dynamic = 'force-static';

export function GET() {
  return manifestResponse('/dashboard', `/dashboard?${FROM_APP.param}=${FROM_APP.value}`);
}
