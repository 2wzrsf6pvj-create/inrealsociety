import Link from 'next/link';
import { BrandMark } from '@/app/components/ui/BrandMark';
import { CONTACT_EMAIL, VAT_EXEMPT, VAT_EXEMPT_NOTICE } from '@/lib/constants';

export const metadata = {
  // Le gabarit du layout ajoute « — In Real Society ».
  title: 'Mentions légales',
  description: 'Mentions légales du site inrealsociety.com (LCEN art. 6).',
  alternates: { canonical: '/mentions-legales' },
};

// ⚠️ À COMPLÉTER avant la mise en prod :
//  - Raison sociale + forme juridique + capital (SAS, SARL, micro-entreprise…)
//  - SIRET + numéro RCS + ville d'immatriculation
//  - Adresse postale du siège
//  - Téléphone
//  - Email de contact (réel, qui répond)
//  - Numéro TVA intracommunautaire (si > seuil franchise)
//  - Nom du directeur de publication (personne physique responsable)
//  - Si activité réglementée : numéro et autorité d'enregistrement
//  - Médiateur de la consommation : nom + adresse + URL (CM2C, FEVAD, etc.)
//
// Conforme LCEN art. 6-III, Code consommation art. L612-1 (médiation),
// Code de commerce art. R123-237 (mention RCS), CGI art. 286ter (TVA).

export default function MentionsLegalesPage() {
  return (
    <main className="relative min-h-screen bg-brand-black text-brand-white px-6 py-16 overflow-hidden">
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />

      <div className="relative z-10 max-w-2xl mx-auto flex flex-col gap-10">

        <div className="flex flex-col gap-4 border-b border-brand-gray/10 pb-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-brand-white/40 flex items-center justify-center">
              <span className="font-display text-sm font-light"><BrandMark /></span>
            </div>
            <span className="font-ui text-sm tracking-[0.25em] uppercase text-brand-gray/50">In Real Society</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-light tracking-[0.04em]">
            Mentions légales
          </h1>
          <p className="font-ui text-sm text-brand-gray/50 tracking-wide">
            Conforme à la LCEN (art. 6) — Dernière mise à jour&nbsp;: 2026
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            1 — Éditeur du site
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            <strong>Raison sociale&nbsp;:</strong> In Real Society — [À COMPLÉTER&nbsp;: forme juridique (SAS, SARL, micro-entreprise…), capital social si applicable].<br />
            <strong>Siège social&nbsp;:</strong> [À COMPLÉTER&nbsp;: adresse postale complète].<br />
            <strong>Immatriculation&nbsp;:</strong> RCS [À COMPLÉTER&nbsp;: ville d’immatriculation et numéro], SIRET [À COMPLÉTER].<br />
            {VAT_EXEMPT
              ? <><strong>TVA&nbsp;:</strong> franchise en base ({VAT_EXEMPT_NOTICE}).<br /></>
              : <><strong>TVA intracommunautaire&nbsp;:</strong> [À COMPLÉTER].<br /></>}
            <strong>Email de contact&nbsp;:</strong> <span className="text-brand-white/70">hello@inrealsociety.com</span><br />
            <strong>Téléphone&nbsp;:</strong> [À COMPLÉTER].
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            2 — Directeur de la publication
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            [À COMPLÉTER&nbsp;: nom et prénom de la personne physique responsable des contenus publiés sur le site].
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            3 — Hébergeur
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            <strong>Hébergeur&nbsp;:</strong> Vercel Inc.<br />
            <strong>Adresse&nbsp;:</strong> 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis.<br />
            <strong>Site&nbsp;:</strong> <a href="https://vercel.com" target="_blank" rel="noopener" className="underline underline-offset-4 hover:text-brand-white">vercel.com</a>
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            <strong>Base de données&nbsp;:</strong> Supabase (Frankfurt, Allemagne — région EU).
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            4 — Propriété intellectuelle
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            L’ensemble du site (textes, graphismes, logo, code, vidéos, illustrations, photographies)
            est protégé par le droit d’auteur. Toute reproduction, totale ou partielle, sans
            autorisation expresse de In Real Society est interdite et constituerait une contrefaçon
            sanctionnée par les articles L335-2 et suivants du Code de la propriété intellectuelle.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            5 — Données personnelles
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Le traitement des données personnelles est détaillé dans notre{' '}
            <Link href="/confidentialite" className="underline underline-offset-4 hover:text-brand-white">
              politique de confidentialité
            </Link>. Conformément au RGPD, vous disposez d’un droit d’accès, de
            rectification, de suppression, d’opposition et de portabilité de vos données.
            Contact&nbsp;: <span className="text-brand-white/70">hello@inrealsociety.com</span>.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            6 — Médiation de la consommation
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Conformément aux articles L611-1 à L616-3 du Code de la consommation, In Real Society
            adhère à un médiateur de la consommation&nbsp;:
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed pl-4 border-l border-brand-gray/10">
            <strong>[À COMPLÉTER&nbsp;: nom du médiateur, ex. CM2C — Centre de la Médiation de la Consommation de Conciliateurs de Justice]</strong><br />
            [Adresse postale du médiateur]<br />
            [URL&nbsp;: https://cm2c.net ou autre]
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Le consommateur peut également recourir à la plateforme européenne de règlement
            en ligne des litiges (ODR)&nbsp;: {' '}
            <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener" className="underline underline-offset-4 hover:text-brand-white">
              ec.europa.eu/consumers/odr
            </a>.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            7 — Cookies
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Le site utilise des cookies essentiels (authentification, panier) sans recueillir de
            consentement préalable, et des cookies de mesure d’audience soumis à votre consentement
            via le bandeau affiché à la première visite. Détails dans la{' '}
            <Link href="/confidentialite" className="underline underline-offset-4 hover:text-brand-white">
              politique de confidentialité
            </Link>.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            8 — Signaler une faille de sécurité
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Si vous découvrez une vulnérabilité de sécurité sur ce site, merci de nous contacter
            directement à <span className="text-brand-white/70">security@inrealsociety.com</span>
            {' '}avant toute divulgation publique. Voir aussi notre{' '}
            <a href="/.well-known/security.txt" className="underline underline-offset-4 hover:text-brand-white">
              fichier security.txt
            </a>.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            9 — Point de contact et signalements
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Point de contact unique des utilisateurs et des autorités (règlement européen sur les
            services numériques, articles 11 et 12)&nbsp;:{' '}
            <span className="text-brand-white/70">{CONTACT_EMAIL}</span>, en français ou en anglais.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Pour signaler un contenu&nbsp;: «&nbsp;Signaler ce profil&nbsp;» sur la page d’un profil, «&nbsp;Signaler
            cette conversation&nbsp;» dans une conversation, ou la même adresse. Les règles de modération
            figurent à l’article 9 des{' '}
            <Link href="/cgv" className="underline underline-offset-4 hover:text-brand-white">CGV</Link>.
            Une personne est en danger&nbsp;? Appelez le 17 ou le 112.
          </p>
        </section>

        <div className="border-t border-brand-gray/10 pt-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-ui text-sm text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white transition-colors"
          >
            ← Retour à l’accueil
          </Link>
          <span className="font-ui text-xs text-brand-gray/50 tracking-wide">
            In Real Society © {new Date().getFullYear()}
          </span>
        </div>

      </div>
    </main>
  );
}
