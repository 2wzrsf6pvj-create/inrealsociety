// src/app/auth/signup/page.tsx
// Redirige vers /register — l'inscription se fait uniquement avec un code d'activation.

import { redirect } from 'next/navigation';

export default function SignupPage() {
  redirect('/register');
}
