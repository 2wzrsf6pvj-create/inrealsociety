// Image Open Graph du profil (aperçu des liens partagés). Depuis Next 16, params
// arrive en promesse : lu sans await, getPublicMember recevait undefined et
// l'aperçu montrait « In Real Society » au lieu du prénom du porteur.

import { describe, it, expect, vi } from 'vitest';

const getPublicMember = vi.fn<(id: string) => Promise<{ name: string; pitch: string }>>(
  async () => ({ name: 'Alex Martin', pitch: 'Bonjour' }),
);
vi.mock('@/lib/supabase', () => ({ getPublicMember: (id: string) => getPublicMember(id) }));

describe('image Open Graph du profil', () => {
  it('cherche le porteur avec l’identifiant de la route', async () => {
    const { default: OGImage } = await import('@/app/profil/[memberId]/opengraph-image');
    const res = await OGImage({ params: Promise.resolve({ memberId: 'm-1' }) });
    expect(getPublicMember).toHaveBeenCalledWith('m-1');
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});
