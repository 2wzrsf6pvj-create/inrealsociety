import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Commande confirmée',
  description: 'Votre commande In Real Society a été confirmée. Votre code d\'activation arrive par email.',
};

export default function ShopSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
