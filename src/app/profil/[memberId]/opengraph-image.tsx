// app/profil/[memberId]/opengraph-image.tsx
// Génère une image OG dynamique pour chaque profil

import { ImageResponse } from 'next/og';
import { getMemberById } from '@/lib/supabase';

export const runtime = 'edge';
export const alt = 'InRealSociety — Profil';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function OGImage({
  params,
}: {
  params: { memberId: string };
}) {
  const member = await getMemberById(params.memberId);

  const name    = member?.name  ?? 'InRealSociety';
  const pitch   = member?.pitch ?? 'The IRL Social Club';
  const initials = getInitials(name);

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#000000',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '40px',
          fontFamily: 'Georgia, serif',
          position: 'relative',
        }}
      >
        {/* Halo */}
        <div style={{
          position: 'absolute',
          top: '-100px',
          left: '-100px',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-80px',
          right: '-80px',
          width: '350px',
          height: '350px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
        }} />

        {/* Avatar */}
        <div style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
        }}>
          {member?.photo_url ? (
            <img
              src={member.photo_url}
              style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '48px', fontWeight: 300 }}>
              {initials}
            </span>
          )}
        </div>

        {/* Nom */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <span style={{
            color: '#ffffff',
            fontSize: '56px',
            fontWeight: 300,
            letterSpacing: '0.06em',
          }}>
            {name}
          </span>

          {/* Séparateur */}
          <div style={{ width: '60px', height: '1px', background: 'rgba(255,255,255,0.15)' }} />

          {/* Pitch */}
          <span style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: '24px',
            fontWeight: 300,
            fontStyle: 'italic',
            maxWidth: '800px',
            textAlign: 'center',
            lineHeight: 1.5,
          }}>
            "{pitch.length > 100 ? pitch.slice(0, 100) + '…' : pitch}"
          </span>
        </div>

        {/* Footer */}
        <span style={{
          color: 'rgba(255,255,255,0.15)',
          fontSize: '14px',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          fontFamily: 'system-ui, sans-serif',
        }}>
          IN REAL SOCIETY
        </span>
      </div>
    ),
    { ...size }
  );
}