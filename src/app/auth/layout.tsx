import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connectez-vous à votre espace In Real Society.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
