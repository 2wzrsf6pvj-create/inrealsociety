'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SHOP_IMAGES_READY } from '@/lib/constants';

// Visuel produit de la hero — affiché seulement quand un mockup existe (flag +
// onError). Tant que false : rendu null → l'accueil reste exactement comme avant.
// `className` porte le dimensionnement/visibilité : le mobile garde son instance en
// flux (lg:hidden), le desktop en a une dédiée dans la colonne de gauche (hidden lg:block).
function ProductHero({ className = '' }: { className?: string }) {
  const [missing, setMissing] = useState(false);
  const showPhoto = SHOP_IMAGES_READY && !missing;
  return (
    <div className={`relative aspect-square animate-stagger-2 ${className}`}>
      {showPhoto ? (
        <Image
          src="/shop/tee-noir-dos.webp"
          alt="T-shirt In Real Society — dos avec QR code"
          fill sizes="(min-width: 1024px) 340px, 240px" className="object-cover rounded-[2px]"
          onError={() => setMissing(true)} priority
        />
      ) : (
        /* Présence produit INTENTIONNELLE (plus d'état vide) en attendant les vraies
           photos : cadre « impression dos » avec le monogramme )( + signature or.
           Même langage visuel que la galerie shop (AbstractTee). */
        <div className="absolute inset-0 rounded-[2px] border border-brand-gray/12 bg-brand-dark overflow-hidden flex flex-col items-center justify-center gap-4">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.05), transparent 70%)' }} />
          <span className="absolute top-3 right-3 font-ui text-[0.55rem] text-brand-accent/70 tracking-[0.2em] uppercase">Édition limitée</span>
          <div className="relative flex items-center justify-center">
            <div className="absolute w-28 h-28 rounded-full border border-brand-white/5" />
            <div className="w-20 h-20 rounded-full border border-brand-white/20 flex items-center justify-center">
              <span className="font-display text-4xl font-light leading-none text-brand-accent/70">)(</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-px bg-brand-accent/50" />
            <p className="font-ui text-xxs text-brand-gray/50 tracking-[0.22em] uppercase">Comfort Colors 1717</p>
          </div>
        </div>
      )}
    </div>
  );
}


const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function LandingContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const [scannerName, setScannerName] = useState('');
  const [hasMemberId, setHasMemberId] = useState(false);
  const [memberName, setMemberName]   = useState('');
  const [qrError, setQrError]         = useState('');

  useEffect(() => {
    // Compat legacy : t-shirts imprimés avec QR pointant sur /?id=<UUID>.
    // Les nouveaux QR utilisent les URLs courtes /r/<code>. On valide le format
    // UUID avant de rediriger pour ne pas envoyer le visiteur sur un /profil/xxx
    // qui crashera. Si l'id est malformé, on affiche l'erreur QR au lieu de
    // rediriger vers une route morte.
    const id = searchParams.get('id');
    if (id) {
      if (UUID_REGEX.test(id)) {
        router.replace(`/profil/${id}`);
        return;
      }
      setQrError('Ce QR code est invalide.');
    }
    // QR code invalide (passé en query par /profil/[id]/page.tsx quand notFound)
    const err = searchParams.get('error');
    if (err === 'qr_invalid')        setQrError('Ce QR code est invalide.');
    else if (err === 'qr_not_found') setQrError('Ce QR code ne correspond à aucun membre.');

    const saved = localStorage.getItem('scannerName');
    const mid   = localStorage.getItem('memberId');
    const mName = localStorage.getItem('memberName');
    if (saved) setScannerName(saved);
    if (mid) setHasMemberId(true);
    if (mName) setMemberName(mName);
  }, [searchParams, router]);

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-brand-black text-brand-white px-6 py-10 overflow-x-hidden">

      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] lg:w-[40rem] lg:h-[40rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 lg:w-96 lg:h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />

      {/* Signature de marque : monogramme )( géant en filigrane, ANCRÉ EN DÉBORD
          (bas-gauche) et non centré. Centré, ses arcs traversaient la copie du héros
          et le )( se lisait une 3e fois (logo + cadre produit) → il se diluait au lieu
          de s'imposer. En débord, il lit comme une texture de marque. */}
      <div aria-hidden="true" className="pointer-events-none select-none absolute inset-0 overflow-hidden">
        <span
          className="absolute font-display font-light leading-none text-brand-white/[0.018]"
          style={{ fontSize: 'min(72vw, 58vh)', left: '-18%', bottom: '-16%' }}
        >
          )(
        </span>
      </div>

      {/* Zone héros : occupe l'espace disponible et centre le contenu, quel que
          soit le viewport (mobile court → desktop haut). Le footer reste en flux.
          MOBILE/TABLETTE : colonne unique, strictement inchangée (le mobile est le cas
          dominant — un scanneur arrive au téléphone). À partir de lg (≥1024px) seulement :
          héros en DEUX COLONNES (visuel produit | accroche + preuves + CTA), sinon la
          colonne de ~450px se perdait dans un écran de 1500px. */}
      <div className="z-10 flex-1 flex flex-col items-center w-full">
      <div className="w-full my-auto py-4 flex flex-col items-center lg:flex-row lg:items-center lg:justify-center lg:gap-16 lg:max-w-5xl">

        {/* Colonne GAUCHE (desktop only) — le visuel produit, plus grand. */}
        {!(scannerName && hasMemberId) && (
          <ProductHero className="hidden lg:block w-[340px] shrink-0" />
        )}

        {/* Colonne DROITE (= la colonne unique du mobile, inchangée). */}
        <div className="flex flex-col items-center text-center gap-10 md:gap-12 w-full max-w-xs md:max-w-sm lg:max-w-md lg:items-start lg:text-left">

        <div className="relative flex items-center justify-center animate-stagger-1">
          <div className="absolute w-24 h-24 lg:w-28 lg:h-28 rounded-full border border-brand-white/10 animate-ring-pulse" />
          <div className="w-[72px] h-[72px] lg:w-[88px] lg:h-[88px] rounded-full border border-brand-white/40 flex items-center justify-center">
            <span className="font-display text-3xl md:text-4xl lg:text-5xl font-light tracking-[0.05em]">)(</span>
          </div>
        </div>

        <div className="flex flex-col gap-5 animate-stagger-2">
          {/* Sur-titre de marque : ce n'est PAS le titre de la page. Le <h1> est
              l'accroche (proposition de valeur) — cf. les deux branches ci-dessous. */}
          <p className="font-ui text-xs md:text-sm font-light tracking-[0.35em] uppercase text-brand-gray/60">
            In Real Society
          </p>
          {qrError && (
            <div className="px-4 py-3 border border-red-500/20 rounded-[2px] mb-2">
              <p className="font-ui text-sm text-red-400/80 text-center">{qrError}</p>
            </div>
          )}
          {scannerName && hasMemberId ? (
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-2xl md:text-3xl font-light leading-snug">
                Vous êtes de retour,<br />
                <span className="font-semibold italic">{scannerName}</span>.
              </h1>
              {memberName && (
                <p className="font-ui text-xs text-brand-gray/55 tracking-[0.1em]">
                  Profil de <span className="text-brand-white/50">{memberName}</span>
                </p>
              )}
              <button
                onClick={() => { localStorage.removeItem('scannerName'); localStorage.removeItem('memberId'); setScannerName(''); setHasMemberId(false); }}
                aria-label="Changer d'identité — ce n'est pas vous"
                className="font-ui text-xs text-brand-gray/55 tracking-[0.1em] underline underline-offset-4 py-2"
                style={{ minHeight: '44px' }}
              >
                Ce n&apos;est pas vous ?
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-light leading-snug tracking-[0.02em]">
                Un QR.<br />
                <span className="text-brand-gray/50">Une rencontre.</span>
              </h1>
              <p className="font-ui text-sm lg:text-base font-light text-brand-gray/50 leading-relaxed">
                Un t-shirt, un QR code au dos.<br />
                On vous remarque dans la vraie vie — et on vous écrit, une seule fois.
              </p>
              {/* Instance MOBILE/tablette : reste exactement en flux, entre la copie et
                  la triade. Sur lg, c'est l'instance de la colonne de gauche qui prend le relais. */}
              <ProductHero className="w-full max-w-[240px] mx-auto lg:hidden" />
              <div className="flex items-center justify-center gap-4 lg:justify-start">
                <span className="font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase">Anonyme</span>
                <span className="text-brand-gray/15">·</span>
                <span className="font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase">Éphémère</span>
                <span className="text-brand-gray/15">·</span>
                <span className="font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase">Sans compte</span>
              </div>
            </div>
          )}
        </div>

        {/* CTA principal — visible par défaut, entrée CSS (stagger-3) comme ses
            voisins. Jamais gaté par le JS : c'est l'élément de conversion clé. */}
        <div className="w-full flex flex-col gap-3 animate-stagger-3">
          {scannerName && hasMemberId ? (
            <Link href="/unlock"
              className="animate-shimmer w-full py-4 px-6 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 block text-center"
              style={{ minHeight: '44px' }}
            >
              Voir ce profil
            </Link>
          ) : (
            <Link href="/shop"
              className="animate-shimmer w-full py-4 px-6 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 block text-center"
              style={{ minHeight: '44px' }}
            >
              Découvrir le t-shirt
            </Link>
          )}
        </div>

        <p className="font-ui text-xs text-brand-gray/50 tracking-[0.25em] uppercase animate-stagger-4">
          The IRL Social Club
        </p>

        </div>{/* /colonne droite */}
      </div>
      </div>

      {/* Liens discrets en bas — en flux (mt-auto via flex-1 du héros) plutôt
          qu'en absolute : footer ancré au bas sans vide asymétrique sur desktop. */}
      <div className="z-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 w-full pt-10 animate-stagger-4">
        <Link href="/manifeste"
          className="font-ui text-xxs md:text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors py-3"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          Manifeste
        </Link>
        <span className="text-brand-gray/15">·</span>
        <Link href="/faq"
          className="font-ui text-xxs md:text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors py-3"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          FAQ
        </Link>
        <span className="text-brand-gray/15">·</span>
        <Link href="/shop"
          className="font-ui text-xxs md:text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors py-3"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          Boutique
        </Link>
        <span className="text-brand-gray/15">·</span>
        <Link href="/auth/login"
          className="font-ui text-xxs md:text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors py-3"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}
        >
          Membres
        </Link>
      </div>
    </main>
  );
}

export default function LandingClient() {
  return (
    <Suspense fallback={null}>
      <LandingContent />
    </Suspense>
  );
}
