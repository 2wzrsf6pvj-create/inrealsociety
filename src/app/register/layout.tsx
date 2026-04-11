import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Créer mon profil',
  description: 'Activez votre t-shirt In Real Society et créez votre profil en quelques minutes.',
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
