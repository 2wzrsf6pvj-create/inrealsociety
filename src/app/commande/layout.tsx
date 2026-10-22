import type { Metadata } from 'next';

// Suivi d'une commande par son code : page personnelle, rien à indexer.
export const metadata: Metadata = {
  title: 'Ma commande',
  robots: { index: false, follow: false },
};

export default function CommandeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
