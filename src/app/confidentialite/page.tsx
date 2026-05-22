export const metadata = {
  title: 'Politique de confidentialité — In Real Society',
  description: 'Politique de confidentialité et traitement des données personnelles d\'In Real Society.',
};

// ⚠️ À COMPLÉTER avant la mise en prod :
//  - Identité complète du responsable de traitement (nom, forme juridique, SIRET, adresse)
//  - Email DPO/contact
//  - Faire valider par un juriste pour la conformité RGPD finale.

export default function ConfidentialitePage() {
  return (
    <main className="relative min-h-screen bg-brand-black text-brand-white px-6 py-16 overflow-hidden">
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />

      <div className="relative z-10 max-w-2xl mx-auto flex flex-col gap-10">

        <div className="flex flex-col gap-4 border-b border-brand-gray/10 pb-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-brand-white/40 flex items-center justify-center">
              <span className="font-display text-sm font-light">)(</span>
            </div>
            <span className="font-ui text-sm tracking-[0.25em] uppercase text-brand-gray/50">In Real Society</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-light tracking-[0.04em]">
            Politique de confidentialité
          </h1>
          <p className="font-ui text-sm text-brand-gray/40 tracking-wide">
            Conforme au RGPD (Règlement UE 2016/679) — Dernière mise à jour : 2026
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            1 — Responsable du traitement
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            In Real Society — [À COMPLÉTER : forme juridique, SIRET, adresse postale].
            Contact pour toute question relative à vos données : <span className="text-brand-white/70">hello@inrealsociety.com</span>.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            2 — Données collectées
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Selon votre interaction avec le service, nous collectons :
          </p>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li><strong>Compte et profil :</strong> email, mot de passe (chiffré), prénom/pseudo, pitch, lien Instagram (optionnel), photo (optionnelle).</li>
            <li><strong>Achat :</strong> email, adresse de livraison, taille et couleur du t-shirt, identifiants Stripe (paiement, abonnement).</li>
            <li><strong>Activité :</strong> scans reçus, géolocalisation approximative au scan (si autorisée), messages envoyés et reçus.</li>
            <li><strong>Technique :</strong> adresse IP (rate limiting, logs de sécurité), user-agent, identifiants de session.</li>
            <li><strong>Analytique (avec consentement) :</strong> pages vues, événements de conversion (PostHog, Cloud EU).</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            3 — Finalités et bases légales
          </h2>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li><strong>Exécution du contrat (art. 6.1.b RGPD) :</strong> création du compte, gestion des commandes, envoi du t-shirt, gestion de l&apos;abonnement premium.</li>
            <li><strong>Intérêt légitime (art. 6.1.f) :</strong> sécurité du service (rate limiting, audit logs, modération), prévention de la fraude.</li>
            <li><strong>Consentement (art. 6.1.a) :</strong> mesure d&apos;audience (PostHog), cookies non essentiels.</li>
            <li><strong>Obligation légale (art. 6.1.c) :</strong> conservation des factures (10 ans).</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            4 — Destinataires et sous-traitants
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Vos données sont traitées par les sous-traitants suivants, tous soumis à des accords de protection des données :
          </p>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li><strong>Supabase</strong> (UE) — hébergement base de données et authentification.</li>
            <li><strong>Stripe</strong> (Irlande/USA) — traitement des paiements. Décision d&apos;adéquation UE-USA (Data Privacy Framework).</li>
            <li><strong>Resend</strong> (USA) — envoi des emails transactionnels (DPF).</li>
            <li><strong>PostHog Cloud EU</strong> (Allemagne) — mesure d&apos;audience (uniquement si vous consentez).</li>
            <li><strong>OpenAI</strong> (USA) — modération de contenu des messages (DPF, données non utilisées pour l&apos;entraînement).</li>
            <li><strong>Printful</strong> (Lettonie) — impression et expédition des t-shirts.</li>
            <li><strong>Upstash Redis</strong> (UE) — rate limiting.</li>
            <li><strong>Sentry</strong> (USA, optionnel) — détection des erreurs techniques.</li>
            <li><strong>Vercel</strong> (USA) — hébergement de l&apos;application.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            5 — Durées de conservation
          </h2>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li>Compte et profil : tant que le compte est actif. Suppression sur demande.</li>
            <li>Messages et scans : 24 mois après le dernier scan.</li>
            <li>Données de commande et facturation : 10 ans (obligation comptable).</li>
            <li>Logs techniques (audit, rate limiting) : 12 mois.</li>
            <li>Analytics (PostHog) : 13 mois (recommandation CNIL).</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            6 — Vos droits
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Conformément au RGPD, vous disposez des droits suivants :
          </p>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li><strong>Accès</strong> aux données vous concernant.</li>
            <li><strong>Rectification</strong> des données inexactes.</li>
            <li><strong>Suppression</strong> (« droit à l&apos;oubli »).</li>
            <li><strong>Limitation</strong> du traitement.</li>
            <li><strong>Portabilité</strong> de vos données dans un format structuré.</li>
            <li><strong>Opposition</strong> au traitement basé sur l&apos;intérêt légitime.</li>
            <li><strong>Retrait du consentement</strong> à tout moment (cookies analytics).</li>
          </ul>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Pour exercer ces droits : <span className="text-brand-white/70">hello@inrealsociety.com</span>.
            Vous pouvez aussi adresser une réclamation à la <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener" className="underline underline-offset-4 hover:text-brand-white">CNIL</a>.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            7 — Cookies
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Nous utilisons deux catégories de cookies :
          </p>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li><strong>Essentiels</strong> (toujours actifs) : authentification Supabase, consentement.</li>
            <li><strong>Mesure d&apos;audience</strong> (consentement requis) : PostHog Cloud EU pour comprendre comment le site est utilisé. Vous pouvez accepter ou refuser via le bandeau affiché à votre première visite, et révoquer votre choix en supprimant la clé <code className="text-brand-white/70 font-mono text-xs">irs_consent</code> de votre localStorage.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            8 — Sécurité
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Nous mettons en œuvre des mesures techniques et organisationnelles appropriées :
            chiffrement TLS en transit, RLS (Row-Level Security) sur la base de données,
            rate limiting, modération automatique, audit logs des actions sensibles, séparation
            des secrets et des données utilisateurs.
          </p>
        </section>

        <div className="flex flex-col gap-2 pt-6 border-t border-brand-gray/10">
          <p className="font-ui text-xs text-brand-gray/30 tracking-wide">
            Cette politique peut être mise à jour. La date en haut de page indique la version en vigueur.
          </p>
        </div>

      </div>
    </main>
  );
}
