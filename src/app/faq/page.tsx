import Link from 'next/link';
import { headers } from 'next/headers';
import FaqAccordion, { type FaqGroup } from './FaqAccordion';
import { MAX_CONVERSATIONS, CONVERSATION_WINDOW_DAYS, TSHIRT_PRICE_EUR, SHIPPING_COUNTRIES_LABEL, PREMIUM_PRICE_LABEL, PREMIUM_WITHDRAWAL_DAYS } from '@/lib/constants';

export const metadata = {
  title: 'FAQ — Comment ça marche',
  description: 'Le t-shirt à QR code pour les rencontres IRL\u00a0: comment ça marche, vie privée, livraison, premium. Toutes les réponses.',
  alternates: { canonical: '/faq' },
};

// Source unique : sert l'accordéon ET le JSON-LD (rich snippets Google).
const FAQ_GROUPS: FaqGroup[] = [
  {
    label: 'comment ça marche',
    items: [
      { q: 'C’est quoi, In Real Society\u00a0?',
        a: 'Un t-shirt avec un QR code imprimé dans le dos. Quand quelqu’un vous remarque dans la vraie vie, il scanne le code et peut vous envoyer un message. Pas d’algorithme, pas de swipe\u00a0: une rencontre qui commence par un vrai regard.' },
      { q: 'Comment quelqu’un me contacte\u00a0?',
        a: 'Il scanne votre QR, arrive sur votre profil, et vous envoie un signal — un message court. Vous recevez une notification ou un email, et vous choisissez de répondre. La personne qui scanne reste anonyme si elle le souhaite.' },
      { q: 'Pourquoi « éphémère » ?',
        a: 'Après un scan, une fenêtre de 24 h (48 h en premium) s’ouvre pour vous écrire\u00a0; passé ce délai, l’occasion est passée — sauf nouveau scan. Et chaque conversation est volontairement limitée à quelques échanges\u00a0: la suite se passe ailleurs, en vrai.' },
      { q: 'Je dois faire quoi, moi\u00a0?',
        a: 'Porter le t-shirt et sortir. C’est tout. Le reste vient des gens qui vous remarquent.' },
    ],
  },
  {
    label: 'vie privée & contrôle',
    items: [
      { q: 'C’est vraiment anonyme\u00a0?',
        a: 'Oui. La personne qui scanne reste anonyme par défaut (elle peut laisser un @instagram ou un email pour que vous puissiez lui répondre). Vous, vous ne montrez que ce que vous mettez sur votre profil.' },
      { q: 'Et si je reçois un message déplacé\u00a0?',
        a: 'Vous gardez le contrôle\u00a0: modération automatique des messages, blocage d’une personne (elle ne pourra plus vous écrire, ici comme ailleurs), signalement, et option «\u00a0exiger un contact\u00a0» pour filtrer l’anonyme. Vous pouvez aussi mettre votre profil en pause à tout moment.' },
      { q: 'Y a-t-il un âge minimum\u00a0?',
        a: 'Oui\u00a0: 18 ans, pour porter un t-shirt In Real Society comme pour écrire à un porteur. Le porteur le déclare en activant son profil\u00a0; la personne qui écrit le confirme en envoyant son message.' },
      { q: 'Le scanneur voit-il où je suis\u00a0?',
        a: 'Non. Il voit votre profil public (prénom ou pseudo, pitch, éventuellement Instagram et photo), jamais votre position. De votre côté, vous voyez une ville approximative des scans reçus, si la personne l’autorise.' },
      { q: 'Que deviennent mes données\u00a0?',
        a: 'Vous pouvez exporter ou supprimer toutes vos données à tout moment depuis votre compte (RGPD). Les détails figurent dans la politique de confidentialité.' },
    ],
  },
  {
    label: 'le t-shirt & la commande',
    items: [
      { q: 'C’est quel t-shirt\u00a0?',
        a: 'Un Stanley/Stella Creator 2.0 en coton bio, coupe droite, avec le QR code premium imprimé dans le dos (impression DTF durable). En noir ou blanc, du S au XXL.' },
      { q: 'Combien ça coûte\u00a0?',
        a: `${TSHIRT_PRICE_EUR}\u00a0€ le t-shirt, livraison offerte en ${SHIPPING_COUNTRIES_LABEL}.` },
      { q: 'Quels sont les délais de livraison\u00a0?',
        a: 'Production à la demande (2 à 5 jours), puis expédition (5 à 10 jours ouvrés). Vous pouvez suivre votre commande à tout moment depuis «\u00a0Ma commande\u00a0».' },
      { q: 'Comment j’active mon profil\u00a0?',
        a: 'Après l’achat, vous recevez un code d’activation (sur la page de confirmation et par email). Dès réception du t-shirt, créez votre profil avec ce code.' },
    ],
  },
  {
    label: 'compte & premium',
    items: [
      { q: 'Le premium, ça apporte quoi\u00a0?',
        a: `Une fenêtre de réponse étendue à 48 h (au lieu de 24 h), des conversations illimitées (au lieu de ${MAX_CONVERSATIONS.free} sur ${CONVERSATION_WINDOW_DAYS} jours glissants), le badge ✦ sur votre profil et vos scans des 7 derniers jours, jour par jour. ${PREMIUM_PRICE_LABEL}/mois, sans engagement, résiliable à tout moment depuis vos réglages\u00a0; si vous changez d’avis dans les ${PREMIUM_WITHDRAWAL_DAYS} jours, votre paiement vous est remboursé en entier.` },
      { q: 'Je peux avoir un compte sans acheter de t-shirt\u00a0?',
        a: 'Le profil s’active avec le code reçu à l’achat\u00a0: c’est le t-shirt qui ouvre l’accès. Sans t-shirt, il n’y a pas de QR à faire scanner.' },
    ],
  },
];

export default async function FaqPage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_GROUPS.flatMap(g => g.items).map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return (
    <main className="relative min-h-screen bg-brand-black text-brand-white px-6 py-16 overflow-hidden">
      {/* JSON-LD FAQPage — rich snippets Google */}
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />

      <div className="relative z-10 max-w-2xl mx-auto flex flex-col gap-10">
        <div className="flex flex-col gap-3 text-center animate-stagger-1">
          <p className="font-ui text-xs text-brand-gray/50 tracking-[0.3em] uppercase">Comment ça marche</p>
          <h1 className="font-display text-3xl md:text-4xl font-light tracking-[0.04em]">Questions fréquentes</h1>
          <p className="font-ui text-sm font-light text-brand-gray/55 leading-relaxed">
            Un t-shirt, un QR code, des rencontres dans la vraie vie. Tout ce qu’il faut savoir.
          </p>
        </div>

        <FaqAccordion groups={FAQ_GROUPS} />

        {/* CTA + liens */}
        <div className="flex flex-col items-center gap-4 pt-4">
          <Link href="/shop"
            className="animate-shimmer w-full max-w-xs py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 text-center">
            Découvrir le t-shirt
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-2">
            <Link href="/commande" className="font-ui text-xs text-brand-gray/50 tracking-[0.1em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors">Suivre ma commande</Link>
            <Link href="/confidentialite" className="font-ui text-xs text-brand-gray/50 tracking-[0.1em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors">Confidentialité</Link>
            <Link href="/" className="font-ui text-xs text-brand-gray/50 tracking-[0.1em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors">Accueil</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
