// src/app/confirmation/page.tsx
// Redirige vers /shop/success — l'ancienne page de confirmation est obsolète.

import { redirect } from 'next/navigation';

export default function ConfirmationPage() {
  redirect('/shop/success');
}
