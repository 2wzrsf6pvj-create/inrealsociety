// src/lib/checkout-email.ts — Email saisi en boutique, réutilisé à l'activation.
// Le parcours boutique → Stripe → /shop/success → /register se fait dans le même
// onglet : on garde l'email en sessionStorage pour pré-remplir le compte, au lieu
// de le faire retaper. sessionStorage : propre à l'onglet, effacé à sa fermeture.
// Jamais dans l'URL (historique, PostHog). Best-effort : le stockage peut être
// bloqué (navigation privée, cookies refusés) → on renonce silencieusement.

const KEY = 'irs_checkout_email';

export function rememberCheckoutEmail(email: string): void {
  try { sessionStorage.setItem(KEY, email); } catch { /* stockage indisponible */ }
}

export function recallCheckoutEmail(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function forgetCheckoutEmail(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
}
