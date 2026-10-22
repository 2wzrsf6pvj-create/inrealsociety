/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
// app/opengraph-image.tsx
// Image d'aperçu des liens partagés (WhatsApp, iMessage, réseaux) pour toutes les
// pages qui n'ont pas la leur : accueil, boutique, FAQ, liens de parrainage…
// Visuel typographique de la marque (choix de Clément), généré au build ;
// remplaçable par un visuel conçu (même nom de fichier, en .png ou .jpg).

import { ImageResponse } from 'next/og';
import { brandMarkSvg } from './components/ui/BrandMark';

export const alt = 'In Real Society — le premier vêtement conçu pour les rencontres dans la vraie vie';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  const mark = brandMarkSvg('#ffffff', 96);
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
          gap: '36px',
          fontFamily: 'Georgia, serif',
          position: 'relative',
        }}
      >
        <div style={{
          position: 'absolute', top: '-120px', left: '-120px', width: '520px', height: '520px',
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-90px', right: '-90px', width: '380px', height: '380px',
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)',
        }} />

        <img
          src={`data:image/svg+xml;base64,${Buffer.from(mark.svg).toString('base64')}`}
          width={mark.width}
          height={mark.height}
        />

        <span style={{ color: '#ffffff', fontSize: '72px', fontWeight: 300, letterSpacing: '0.06em' }}>
          In Real Society
        </span>

        <div style={{ width: '64px', height: '1px', background: 'rgba(255,255,255,0.2)' }} />

        <span style={{
          color: 'rgba(255,255,255,0.55)', fontSize: '30px', fontWeight: 300, fontStyle: 'italic',
          maxWidth: '860px', textAlign: 'center', lineHeight: 1.45,
        }}>
          Le premier vêtement conçu pour les rencontres dans la vraie vie.
        </span>

        <span style={{
          color: 'rgba(255,255,255,0.25)', fontSize: '16px', letterSpacing: '0.3em',
          textTransform: 'uppercase', fontFamily: 'system-ui, sans-serif',
        }}>
          Un t-shirt · Un QR · Une rencontre
        </span>
      </div>
    ),
    { ...size },
  );
}
