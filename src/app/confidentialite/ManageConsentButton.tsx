'use client';

// Révocation du consentement analytics (CNIL : le retrait doit être aussi simple
// que le consentement). Efface le choix applicatif ET coupe PostHog (opt_out
// nettoie sa propre clé persistée __ph_opt_in_out — sinon supprimer seulement
// irs_consent ne stoppait pas le tracking), puis recharge → le bandeau ré-apparaît.

import posthog from 'posthog-js';

export default function ManageConsentButton() {
  const reset = () => {
    try { localStorage.removeItem('irs_consent'); } catch { /* ignore */ }
    if (posthog.__loaded) posthog.opt_out_capturing();
    location.reload();
  };

  return (
    <button
      type="button"
      onClick={reset}
      className="underline underline-offset-4 hover:text-brand-white transition-colors"
    >
      gérer ou révoquer mon consentement
    </button>
  );
}
