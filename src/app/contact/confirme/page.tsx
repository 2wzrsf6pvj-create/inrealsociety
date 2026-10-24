import type { Metadata } from 'next';
import { BrandMark } from '@/app/components/ui/BrandMark';
import { CONTACT_VERIFY_TTL_DAYS } from '@/lib/contact-verification';

// Arrivée du lien de confirmation envoyé au passant qui a laissé son email
// (cf. /api/contact/verify). Transactionnelle : noindex.
export const metadata: Metadata = {
  title: 'Confirmation de votre adresse',
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATES = {
  ok: {
    title: 'Adresse confirmée.',
    text:  'Vous serez prévenu par email quand votre message recevra une réponse.',
  },
  expire: {
    title: 'Lien expiré.',
    text:  `Ce lien de confirmation avait plus de ${CONTACT_VERIFY_TTL_DAYS} jours. Vous pouvez toujours suivre la conversation depuis l’appareil d’où vous avez écrit.`,
  },
  invalide: {
    title: 'Lien invalide.',
    text:  "Ce lien de confirmation n’est pas reconnu. Vérifiez qu’il est complet, ou suivez la conversation depuis l’appareil d’où vous avez écrit.",
  },
  reessayer: {
    title: 'Un instant.',
    text:  'La confirmation n’a pas pu aboutir. Réessayez dans quelques minutes en cliquant de nouveau sur le lien.',
  },
} as const;

export default async function ContactConfirmePage(
  props: { searchParams: Promise<{ statut?: string; conversation?: string }> }
) {
  const searchParams = await props.searchParams;
  const statut = (searchParams.statut ?? '') in STATES ? (searchParams.statut as keyof typeof STATES) : 'invalide';
  const { title, text } = STATES[statut];
  const conversation = statut === 'ok' && UUID_RE.test(searchParams.conversation ?? '') ? searchParams.conversation : null;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-16 overflow-hidden">
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl text-brand-white/70 leading-none"><BrandMark /></span>
          <span className="font-ui text-[0.7rem] text-brand-gray/55 tracking-[0.35em] uppercase">In Real Society</span>
        </div>

        <div className="flex flex-col items-center gap-3">
          <h1 className="font-display text-2xl md:text-3xl font-light leading-snug">{title}</h1>
          <p className="font-ui text-sm font-light text-brand-gray/50 leading-relaxed">{text}</p>
        </div>

        {conversation && (
          // <a> et non <Link> : chargement complet, pour que l'app ajoutée à l'écran
          // d'accueil rouvre la conversation (cf. lib/full-page).
          <a href={`/conversation/${conversation}`}
            className="w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 transition-colors"
            style={{ minHeight: '44px' }}>
            Voir la conversation
          </a>
        )}
      </div>
    </main>
  );
}
