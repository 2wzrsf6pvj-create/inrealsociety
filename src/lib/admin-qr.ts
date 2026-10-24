// src/lib/admin-qr.ts — « Voir le QR » dans /admin (demande de Clément : tester
// de A à Z). Le QR d'un porteur, noir sur blanc et avec sa marge, à scanner
// depuis l'écran avec un téléphone, comme un passant : en mode test, rien
// n'est imprimé. Il encode l'adresse qu'encoderait le QR imprimé aujourd'hui
// (SHORT_DOMAIN, sinon <site>/r/<code>). Le fichier d'impression, lui, n'a pas
// de marge et il est blanc pour un t-shirt noir : illisible sur une page.
// SERVEUR UNIQUEMENT.

import { generatePremiumQRCode } from '@/lib/generate-qr-svg';
import { buildShortUrl } from '@/lib/short-code';

export function adminQr(shortCode: string): { url: string; image: string } {
  const url = buildShortUrl(shortCode);
  const { buffer } = generatePremiumQRCode(url, 'light', { quietModules: 4 });
  return { url, image: `data:image/svg+xml;base64,${buffer.toString('base64')}` };
}
