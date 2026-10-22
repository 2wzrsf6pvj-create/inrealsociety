import type { Metadata } from 'next';

// Étape du passant avant d'écrire à un porteur : rien à indexer.
export const metadata: Metadata = {
  title: 'Avant d’écrire',
  robots: { index: false, follow: false },
};

export default function UnlockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
