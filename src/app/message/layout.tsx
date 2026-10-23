import type { Metadata } from 'next';

// Titre de l'onglet, annoncé aussi par les lecteurs d'écran à l'arrivée : la
// page est un composant client, sans metadata.
export const metadata: Metadata = {
  title: 'Envoyer un message',
};

export default function MessageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
