import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/app/components/ui/BrandMark';

// Page affichée quand on scanne un t-shirt DÉJÀ imprimé mais dont le porteur n'a
// pas encore activé son profil (modèle « imprimer au paiement »). Sobre, cohérente
// avec la marque : on n'affiche pas d'erreur, on invite à revenir. noindex.
export const metadata: Metadata = {
  title: 'Profil pas encore activé',
  robots: { index: false, follow: false },
};

export default function TeeEnAttentePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-16 overflow-hidden">
      {/* halos discrets, comme l'accueil */}
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8 text-center">
        {/* signature */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl text-brand-white/70 leading-none"><BrandMark /></span>
          <span className="font-ui text-[0.7rem] text-brand-gray/55 tracking-[0.35em] uppercase">In Real Society</span>
        </div>

        <div className="flex flex-col items-center gap-3">
          <h1 className="font-display text-2xl md:text-3xl font-light leading-snug">
            Ce porteur n’a pas<br />encore activé son profil.
          </h1>
          <p className="font-ui text-sm font-light text-brand-gray/50 leading-relaxed">
            Le t-shirt existe, le profil arrive. Revenez scanner un peu plus tard&nbsp;:
            il sera peut-être en ligne.
          </p>
        </div>

        {/* Rappel discret pour le porteur qui scanne son propre tee. */}
        <div className="w-full pt-2 border-t border-brand-gray/10 flex flex-col items-center gap-2">
          <p className="font-ui text-xxs text-brand-gray/55 tracking-[0.15em] uppercase">C’est votre t-shirt&nbsp;?</p>
          <p className="font-ui text-xs font-light text-brand-gray/50 leading-relaxed">
            Activez votre profil depuis le lien reçu par email après votre commande.
          </p>
          <Link
            href="/faq"
            className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors py-3"
            style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
          >
            Besoin d’aide&nbsp;?
          </Link>
        </div>
      </div>
    </main>
  );
}
