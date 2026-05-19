// src/app/profil/page.tsx
// Redirige vers l'accueil — les profils sont accessibles via /profil/[memberId].

import { redirect } from 'next/navigation';

export default function ProfilPage() {
  redirect('/');
}
