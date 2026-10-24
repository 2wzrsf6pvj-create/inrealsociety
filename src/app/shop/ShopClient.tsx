'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { captureEvent } from '@/lib/posthog-client';
import { rememberCheckoutEmail } from '@/lib/checkout-email';
import { TSHIRT_PRICE_EUR } from '@/lib/constants';
import type { BakedTagline } from '@/lib/taglines.generated';
import TaglinePicker from '@/app/components/ui/TaglinePicker';
import { BrandMark } from '@/app/components/ui/BrandMark';
import ModalDialog, { closeDialog } from '@/app/components/ui/ModalDialog';
import { isReferralToken } from '@/lib/referral-code';
import { scanOrigin } from '@/lib/scan-origin';

type TshirtColor = 'dark' | 'light';
type TshirtSize  = 'S' | 'M' | 'L' | 'XL' | 'XXL';

const SIZES: TshirtSize[] = ['S', 'M', 'L', 'XL', 'XXL'];

// ─── Galerie produit ──────────────────────────────────────────────────────────
// Placeholder abstrait (logo ( • )) — fallback tant qu'aucune vraie image n'est
// présente dans /public/shop/.
function AbstractTee({ color }: { color: TshirtColor }) {
  const isDark = color === 'dark';
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
      <div className="relative flex items-center justify-center">
        <div className={`absolute w-32 h-32 rounded-full border ${isDark ? 'border-brand-white/5' : 'border-brand-black/5'}`} />
        <div className={`w-24 h-24 rounded-full border flex items-center justify-center ${isDark ? 'border-brand-white/20' : 'border-brand-black/20'}`}>
          {/* Monochrome comme le vrai print : blanc sur tee noir, noir sur tee blanc
              (l'or reste la couleur de marque à l'écran, pas sur le vêtement). */}
          <span className={`font-display text-5xl font-light ${isDark ? 'text-brand-white/60' : 'text-brand-black/50'}`}><BrandMark /></span>
        </div>
      </div>
      <p className={`font-ui text-xs tracking-[0.2em] uppercase ${isDark ? 'text-brand-gray/50' : 'text-brand-black/30'}`}>
        T-shirt · Stanley/Stella Creator 2.0 · {isDark ? 'Noir' : 'Blanc'}
      </p>
    </div>
  );
}

// Tracé de l'accroche choisie, chargé à la demande (une petite réponse par
// accroche, mise en cache) au lieu d'embarquer toutes les accroches dans la page.
const taglineCache = new Map<string, Pick<BakedTagline, 'path' | 'bbox'>>();

function useBakedTagline(taglineId: string | null): Pick<BakedTagline, 'path' | 'bbox'> | null {
  const [baked, setBaked] = useState(() => (taglineId ? taglineCache.get(taglineId) ?? null : null));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- accroche retirée, ou déjà en cache
    if (!taglineId) { setBaked(null); return; }
    const cached = taglineCache.get(taglineId);
    if (cached) { setBaked(cached); return; }
    setBaked(null);
    let cancelled = false;
    fetch(`/api/shop/tagline/${encodeURIComponent(taglineId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.path || !data?.bbox) return;
        taglineCache.set(taglineId, data);
        if (!cancelled) setBaked(data);
      })
      .catch(() => { /* l'aperçu reste sans accroche ; la commande n'en dépend pas */ });
    return () => { cancelled = true; };
  }, [taglineId]);
  return baked;
}

// Galerie produit : photos Printful réelles (public/shop/tee-{noir|blanc}-{dos|face}.png),
// toggle Avant / Arrière. Sur le DOS, l'accroche choisie est incrustée EN DIRECT sous le QR
// (le QR est déjà sur la photo). Repli sur le placeholder abstrait si une photo manque (ex.
// le NOIR, pas encore shooté). Position du QR relevée sur la photo : centré, bas ~49,5 %.
function ProductGallery({ color, taglineId }: { color: TshirtColor; taglineId: string | null }) {
  const [view, setView]       = useState<'back' | 'front'>('back');
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  const isDark   = color === 'dark';
  const colorKey = isDark ? 'noir' : 'blanc';
  // Les DEUX faces sont chargées (flip 3D) : dos + face.
  const backSrc   = `/shop/tee-${colorKey}-dos.png`;
  const frontSrc  = `/shop/tee-${colorKey}-face.png`;
  const hasPhotos = !missing[backSrc] && !missing[frontSrc];

  const baked = useBakedTagline(taglineId);

  // Position du QR relevée sur CHAQUE photo (le dos noir est un poil plus haut/à droite)
  // → l'accroche se pose pile sous le QR, quelle que soit la couleur.
  const tagPos = isDark ? { top: '49.5%', left: '51%' } : { top: '50.5%', left: '50%' };

  // Échelle de l'accroche = EXACTEMENT celle du print (composeBackPrintSVG) : bornée par la
  // hauteur de capitale (0.14·W) puis par la largeur (0.92·W), W = largeur du QR (~31 % de la
  // photo). Résultat : toutes les accroches ont la MÊME taille de lettres (pas étirées à une
  // largeur fixe). Sinon une phrase courte sortait en grosses lettres, une longue en petites.
  const QR_W = 0.309;                                  // largeur QR / largeur photo (relevé)
  const tagAspect = baked ? (baked.bbox.x2 - baked.bbox.x1) / (baked.bbox.y2 - baked.bbox.y1) : 1;
  const tagWidthPct = QR_W * Math.min(1.0, 0.085 * tagAspect) * 100;   // cap-height constante

  const faceBg = isDark ? 'bg-[#0a0a0a] border-brand-gray/10' : 'bg-[#f0ede8] border-brand-gray/20';

  return (
    <div className="flex flex-col gap-3">
      {hasPhotos ? (
        // FLIP 3D : le tee pivote sur l'axe vertical pour révéler l'autre face.
        <div className="relative w-full aspect-square [perspective:1400px]">
          <div
            className="relative w-full h-full [transform-style:preserve-3d] transition-transform duration-[650ms] ease-in-out motion-reduce:transition-none"
            style={{ transform: view === 'front' ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
          >
            {/* Face ARRIÈRE (dos + QR + accroche) */}
            <div className={`absolute inset-0 [backface-visibility:hidden] rounded-[2px] overflow-hidden border ${faceBg}`}>
              <Image
                src={backSrc}
                alt={`T-shirt In Real Society ${isDark ? 'Noir' : 'Blanc'} — dos avec QR code`}
                fill sizes="(max-width: 768px) 100vw, 420px" className="object-contain"
                onError={() => setMissing(m => ({ ...m, [backSrc]: true }))}
                // Image LCP de la boutique : préchargée dans le <head> et prioritaire.
                // `priority`, déprécié par Next 16, n'y pose plus fetchpriority="high".
                preload fetchPriority="high"
              />
              {baked && (
                <div
                  className="absolute [backface-visibility:hidden] [&_svg]:block [&_svg]:w-full [&_svg]:h-auto"
                  style={{
                    top: tagPos.top,
                    // Centrage SANS transform (le transform promeut un calque qui échappe au
                    // masquage de la face arrière → l'accroche « traînait » pendant le flip).
                    left: `calc(${tagPos.left} - ${(tagWidthPct / 2).toFixed(2)}%)`,
                    width: `${tagWidthPct.toFixed(1)}%`,
                  }}
                >
                  <svg viewBox={`${baked.bbox.x1} ${baked.bbox.y1} ${(baked.bbox.x2 - baked.bbox.x1).toFixed(2)} ${(baked.bbox.y2 - baked.bbox.y1).toFixed(2)}`}>
                    <path d={baked.path} fill={isDark ? '#f2f2f2' : '#1a1a1a'} />
                  </svg>
                </div>
              )}
            </div>
            {/* Face AVANT (logo poitrine) — pré-tournée de 180° */}
            <div className={`absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-[2px] overflow-hidden border ${faceBg}`}>
              <Image
                src={frontSrc}
                alt={`T-shirt In Real Society ${isDark ? 'Noir' : 'Blanc'} — face avec le logo`}
                fill sizes="(max-width: 768px) 100vw, 420px" className="object-contain"
                onError={() => setMissing(m => ({ ...m, [frontSrc]: true }))}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className={`relative w-full aspect-square border rounded-[2px] overflow-hidden ${faceBg}`}>
          <AbstractTee color={color} />
        </div>
      )}

      {/* Toggle Avant / Arrière — seulement si les photos de cette couleur existent. */}
      {hasPhotos && (
        <div className="flex gap-2">
          {([['back', 'Arrière'], ['front', 'Avant']] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`flex-1 py-2 rounded-[2px] border font-ui text-xxs tracking-[0.15em] uppercase transition-all ${
                view === v ? 'border-brand-white/60 bg-brand-white/5 text-brand-white' : 'border-brand-gray/15 text-brand-gray/55 hover:border-brand-gray/30'
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewsletterCapture({ source }: { source: string }) {
  const [email, setEmail]     = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone]       = useState(false);
  const [failed, setFailed]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setFailed(false);
    try {
      // Ne confirmer QUE si la requête aboutit — sinon on affichait « réussi »
      // sur un échec réseau et l'inscription était perdue en silence.
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-display text-lg font-light italic text-brand-gray/60">
          On vous préviendra.
        </p>
        <p className="font-ui text-xs text-brand-gray/55">
          Pas de spam, juste les vrais moments du projet.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm mx-auto">
      <div className="text-center flex flex-col gap-1">
        <p className="font-ui text-xs text-brand-gray/55 tracking-[0.25em] uppercase">Pas encore le moment&nbsp;?</p>
        <p className="font-display text-xl md:text-2xl font-light text-brand-gray/70">
          Recevez les nouvelles du lancement et des prochaines collections.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          aria-label="Votre email"
          autoComplete="email"
          placeholder="votre@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="flex-1 bg-transparent border-b border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-sm py-3 outline-none transition-colors placeholder:text-brand-gray/50"
          style={{ minHeight: '44px' }}
        />
        <button type="submit" disabled={sending || !email.trim()}
          className="px-5 py-3 border border-brand-gray/25 hover:border-brand-white/60 font-ui text-xs tracking-[0.15em] uppercase text-brand-gray/60 hover:text-brand-white rounded-[2px] transition-colors disabled:opacity-40"
          style={{ minHeight: '44px' }}>
          {sending ? '…' : 'OK'}
        </button>
      </div>
      {failed && (
        <p className="font-ui text-xs text-red-400 text-center" role="alert">
          L’inscription a échoué. Vérifiez votre connexion et réessayez.
        </p>
      )}
      <p className="font-ui text-xxs text-brand-gray/50 text-center">
        Désabonnable à tout moment via le lien dans chaque email.
      </p>
    </form>
  );
}

function SizeGuide() {
  const [open, setOpen] = useState(false);
  // Mesures officielles Stanley/Stella Creator 2.0 (STTU169) : 1/2 poitrine (à 2 cm sous
  // l'emmanchure) × longueur (épaule → bas). Cf. size chart S/S. À recouper avec Printful.
  const sizes = [
    { size: 'S',   chest: '49', length: '69' },
    { size: 'M',   chest: '52', length: '72' },
    { size: 'L',   chest: '55', length: '74' },
    { size: 'XL',  chest: '58', length: '76' },
    { size: 'XXL', chest: '61', length: '78' },
  ];

  return (
    <>
      <button onClick={() => setOpen(true)} className="font-ui text-xxs text-brand-gray/55 underline underline-offset-2 hover:text-brand-white/80 transition-colors">
        Guide des tailles
      </button>
      {open && (
        <ModalDialog labelledBy="size-guide-title" onClose={() => setOpen(false)}>
          <div className="h-full flex items-center justify-center bg-black/70 backdrop-blur-sm px-6" onClick={closeDialog}>
            <div className="bg-[#0a0a0a] border border-brand-gray/15 rounded-[2px] p-6 w-full max-w-xs flex flex-col gap-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 id="size-guide-title" className="font-ui text-xs text-brand-gray/50 tracking-[0.2em] uppercase">Guide des tailles</h2>
                <button onClick={closeDialog} aria-label="Fermer le guide des tailles" className="font-ui text-xs text-brand-gray/55 hover:text-brand-white transition-colors">✕</button>
              </div>
              <p className="font-ui text-xxs text-brand-gray/55">Stanley/Stella Creator 2.0 — coton bio, coupe droite. En cas de doute, prenez votre taille habituelle.</p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-brand-gray/10">
                    <th className="font-ui text-xxs text-brand-gray/55 tracking-[0.15em] uppercase text-left py-2">Taille</th>
                    <th className="font-ui text-xxs text-brand-gray/55 tracking-[0.15em] uppercase text-center py-2">Poitrine</th>
                    <th className="font-ui text-xxs text-brand-gray/55 tracking-[0.15em] uppercase text-center py-2">Longueur</th>
                  </tr>
                </thead>
                <tbody>
                  {sizes.map(s => (
                    <tr key={s.size} className="border-b border-brand-gray/5">
                      <td className="font-ui text-sm text-brand-white/70 py-2">{s.size}</td>
                      <td className="font-ui text-sm text-brand-gray/50 text-center py-2">{s.chest} cm</td>
                      <td className="font-ui text-sm text-brand-gray/50 text-center py-2">{s.length} cm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ModalDialog>
      )}
    </>
  );
}

export default function ShopClient() {
  const searchParams = useSearchParams();
  const [email, setEmail]             = useState('');
  // Défaut = BLANC : c'est la seule couleur avec une vraie maquette (public/shop/tee-hero.png)
  // → le visiteur voit le produit réel dès l'arrivée (le noir n'a encore que le placeholder).
  const [tshirtColor, setTshirtColor] = useState<TshirtColor>('light');
  const [tshirtSize, setTshirtSize]   = useState<TshirtSize>('M');
  const [taglineId, setTaglineId]     = useState<string | null>(null);
  const [acceptedCgv, setAcceptedCgv] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  // Lien de parrainage : code dédié, ou ancien lien à identifiant de profil.
  const [referral, setReferral]       = useState<string | null>(null);
  // Porteur dont le profil, vu après un scan, a mené ici (30 jours, cet appareil).
  const [fromMemberId, setFromMemberId] = useState<string | null>(null);
  // Barre d'achat mobile : visible tant que le formulaire de commande n'est PAS à
  // l'écran. `true` au départ (rendu serveur) → pas de barre avant l'hydratation.
  const formRef = useRef<HTMLFormElement>(null);
  const [formInView, setFormInView] = useState(true);

  useEffect(() => {
    const el = formRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setFormInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // CTA de la barre : amène au formulaire (email + CGV restent obligatoires avant
  // Stripe) et place le curseur dans le champ email.
  const goToForm = () => {
    captureEvent('shop_sticky_cta_clicked', { tshirt_color: tshirtColor, tshirt_size: tshirtSize, has_tagline: !!taglineId });
    const input = document.getElementById('buy-email') as HTMLInputElement | null;
    if (!input) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    input.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    input.focus({ preventScroll: true });
  };

  useEffect(() => {
    // Capte le parrain depuis ?ref= ou depuis localStorage (page /join)
    const ref = searchParams.get('ref') || localStorage.getItem('referral_code');
    if (isReferralToken(ref)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- parrain lu dans l'URL ou localStorage
      setReferral(ref);
    }
    setFromMemberId(scanOrigin(searchParams.get('from')));
  }, [searchParams]);

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Votre email est requis.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Email invalide.'); return; }
    // Acceptation EXPLICITE des CGV avant paiement (droit conso FR : pas d'acceptation
    // implicite par simple clic « Commander »). Miroir du z.literal(true) à l'activation.
    if (!acceptedCgv) { setError('Veuillez accepter les Conditions Générales de Vente pour continuer.'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(), tshirtColor, tshirtSize, taglineId,
          referral: referral || undefined, fromMemberId: fromMemberId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error);
      captureEvent('checkout_started', {
        tshirt_color: tshirtColor,
        tshirt_size:  tshirtSize,
        has_tagline:  !!taglineId,
        has_referrer: !!referral,
        from_scan:    !!fromMemberId,
      });
      // Pré-remplira l'email du compte à l'activation (même onglet après Stripe).
      // En minuscules, comme l'enregistre l'API (clé de rapprochement commande ↔ membre).
      rememberCheckoutEmail(email.trim().toLowerCase());
      window.location.href = data.url;
    } catch {
      setError('Une erreur est survenue. Réessayez.');
      setLoading(false);
    }
  };

  const colorLabel = tshirtColor === 'dark' ? 'Noir' : 'Blanc';

  return (
    <main className="relative bg-brand-black text-brand-white min-h-screen overflow-hidden pb-24 lg:pb-0">

      <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />

      <nav className="relative z-10 flex items-center justify-between px-6 py-6 border-b border-brand-gray/10">
        <Link href="/" className="font-display text-xl font-light tracking-[0.1em]"><BrandMark label="In Real Society — accueil" /></Link>
        <span className="font-ui text-xs text-brand-gray/55 tracking-[0.3em] uppercase">In Real Society</span>
        {/* Emplacement réservé au bouton global « Connexion » (AuthIndicator, en
            haut à droite) — un lien ici passait dessous et se chevauchait. */}
        <span aria-hidden="true" className="w-32" />
      </nav>

      {/* Bandeau parrainage — affiché quand le visiteur arrive avec ?ref= */}
      {referral && (
        <div className="relative z-10 bg-[#0a0a08] border-b border-[#C5A059]/20 px-6 py-3">
          <p className="font-ui text-xs md:text-sm text-[#C5A059]/80 text-center tracking-wide">
            <span aria-hidden="true">✦ </span>Vous arrivez par un parrainage — votre remise sera appliquée au paiement.
          </p>
        </div>
      )}

      {/* Largeur gérée PAR SECTION : seule la section produit s'élargit en desktop
          (2 colonnes). Les autres restent en colonne étroite centrée → mobile inchangé. */}
      <div className="relative z-10 px-6">

        {/* Hero */}
        <section className="max-w-lg mx-auto py-16 md:py-20 flex flex-col items-center text-center gap-8 animate-stagger-1">
          <div className="flex flex-col gap-2">
            <p className="font-ui text-xs text-brand-gray/55 tracking-[0.35em] uppercase">The IRL Social Club</p>
            <h1 className="font-display text-4xl md:text-5xl font-light leading-[1.1] tracking-[0.03em]">
              Portez une<br />intention.
            </h1>
          </div>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/50 leading-relaxed max-w-xs">
            Vous affichez votre ouverture, sans un mot.<br />
            Le contrôle reste à qui ose scanner.
          </p>
          {/* Sur une ligne dès 360 px ; plus étroit, « Sans swipe » passe entier
              à la ligne, jamais coupé en deux. */}
          <div className="flex flex-wrap items-center justify-center gap-x-2.5 sm:gap-x-4 gap-y-1">
            <span className="font-ui text-xs text-brand-gray/50 tracking-[0.1em] sm:tracking-[0.2em] uppercase whitespace-nowrap">Anonyme</span>
            <span aria-hidden="true" className="text-brand-gray/15">·</span>
            <span className="font-ui text-xs text-brand-gray/50 tracking-[0.1em] sm:tracking-[0.2em] uppercase whitespace-nowrap">Éphémère</span>
            <span aria-hidden="true" className="text-brand-gray/15">·</span>
            {/* Pas « Sans compte » : vrai pour qui scanne, faux pour l'acheteur (il crée un compte à l'activation). */}
            <span className="font-ui text-xs text-brand-gray/50 tracking-[0.1em] sm:tracking-[0.2em] uppercase whitespace-nowrap">Sans swipe</span>
          </div>
        </section>

        {/* Produit — 2 colonnes en desktop (lg:), empilé en mobile */}
        <section className="max-w-lg lg:max-w-5xl mx-auto py-12 border-t border-brand-gray/10 animate-stagger-2">
          <div className="flex flex-col gap-8 lg:flex-row lg:gap-14 lg:items-start">

            {/* Colonne visuel — sticky en desktop : reste visible pendant qu'on scrolle
                le panneau d'achat. Sur mobile (lg: inertes), rien ne change. */}
            <div className="lg:w-1/2 lg:sticky lg:top-24">
              {/* Visuel produit — galerie (mockups réels dans /public/shop si présents,
                  sinon fallback placeholder). Dos+QR montré en premier. */}
              <ProductGallery color={tshirtColor} taglineId={taglineId} />
            </div>

            {/* Colonne achat — nom/prix, sélecteurs, accroche, infos, formulaire */}
            <div className="flex flex-col gap-8 lg:w-1/2">

            {/* Nom + prix EN TÊTE : sur mobile, juste sous la photo. Avant, le prix
                n'apparaissait qu'après ~2 écrans, derrière le choix de l'accroche. */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-2xl md:text-3xl font-light tracking-[0.04em]">
                  T-shirt In Real Society
                </h2>
                <p className="font-ui text-xs md:text-sm text-brand-gray/50">
                  Stanley/Stella Creator 2.0 · {colorLabel} · QR code imprimé dans le dos
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="font-display text-3xl font-light">{TSHIRT_PRICE_EUR}&nbsp;€</span>
                <span className="font-ui text-xxs text-brand-gray/55 whitespace-nowrap">livraison comprise</span>
              </div>
            </div>

            {/* Sélecteur couleur */}
            <div className="flex flex-col gap-2">
              <p id="lbl-couleur" className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Couleur</p>
              <div className="flex gap-3" role="group" aria-labelledby="lbl-couleur">
                {([
                  { value: 'dark'  as const, label: 'Noir',  bg: '#0a0a0a' },
                  { value: 'light' as const, label: 'Blanc', bg: '#f5f5f5' },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTshirtColor(opt.value)}
                    aria-pressed={tshirtColor === opt.value}
                    aria-label={`Couleur ${opt.label}`}
                    className={`flex-1 py-3 rounded-[2px] border transition-all flex items-center justify-center gap-2 ${
                      tshirtColor === opt.value
                        ? 'border-brand-white/60 bg-brand-white/5'
                        : 'border-brand-gray/15 hover:border-brand-gray/30'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full border border-brand-gray/30" style={{ background: opt.bg }} />
                    <span className="font-ui text-sm tracking-[0.15em] uppercase">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sélecteur taille + guide */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p id="lbl-taille" className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Taille</p>
                <SizeGuide />
              </div>
              <p className="font-ui text-xxs text-brand-gray/55 -mt-1">
                Coupe <span className="text-brand-gray/50">droite</span> · M sélectionné par défaut · prenez votre taille habituelle
              </p>
              <div className="flex gap-2" role="group" aria-labelledby="lbl-taille">
                {SIZES.map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setTshirtSize(size)}
                    aria-pressed={tshirtSize === size}
                    aria-label={`Taille ${size}`}
                    style={{ minHeight: '44px' }}
                    className={`flex-1 py-2.5 rounded-[2px] border transition-all font-ui text-sm tracking-[0.1em] ${
                      tshirtSize === size
                        ? 'border-brand-white/60 bg-brand-white/5 text-brand-white'
                        : 'border-brand-gray/15 text-brand-gray/50 hover:border-brand-gray/30'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Accroche imprimée sous le QR — le hameçon qui donne envie de scanner.
                L'aperçu est désormais dans la galerie (vue Arrière), plus de carte séparée. */}
            <TaglinePicker value={taglineId} onChange={setTaglineId} />

            {/* Infos produit (nom + prix : en tête de colonne) */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 py-4 border-t border-b border-brand-gray/10">
                {[
                  'T-shirt coton bio Stanley/Stella Creator 2.0',
                  'Logo ( • ) imprimé sur la poitrine',
                  'QR unique + accroche imprimés dans le dos',
                  'Code d’activation unique par email',
                  'Accès à la plateforme In Real Society',
                  'Profil configurable en 2 minutes',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <span aria-hidden="true" className="font-ui text-sm text-[#C5A059]/60">✦</span>
                    <span className="font-ui text-sm text-brand-gray/50">{item}</span>
                  </div>
                ))}
              </div>

              {/* Livraison & délais — affichés AVANT le CTA pour ne pas surprendre au checkout.
                  Chronologie honnête : production à la demande PUIS expédition. */}
              <div className="flex flex-col gap-1.5 py-3 px-4 bg-[#0a0a0a] border border-brand-gray/10 rounded-[2px]">
                <div className="flex items-center justify-between">
                  <span className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase">Production</span>
                  <span className="font-ui text-xs text-brand-gray/60">2-5 j. (à la demande)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase">Expédition</span>
                  <span className="font-ui text-xs text-brand-gray/60">5-10 j. ouvrés</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase">Frais de port</span>
                  <span className="font-ui text-xs text-brand-gray/60">Compris</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase">Zones</span>
                  <span className="font-ui text-xs text-brand-gray/60">FR · BE · LU · DE</span>
                </div>
              </div>

              <form ref={formRef} onSubmit={handleBuy} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="buy-email" className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Votre email</label>
                  <p id="buy-email-hint" className="font-ui text-xxs md:text-xs text-brand-gray/50 leading-relaxed">
                    Votre code d’activation vous sera envoyé ici après paiement.
                  </p>
                  <input
                    id="buy-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    aria-describedby="buy-email-hint"
                    aria-invalid={!!error}
                    placeholder="votre@email.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base py-3 outline-none transition-colors placeholder:text-brand-gray/50"
                    style={{ minHeight: '44px' }}
                  />
                  {error && <p className="font-ui text-sm text-red-400" role="alert">{error}</p>}
                </div>

                {/* Acceptation EXPLICITE des CGV avant paiement (obligatoire en B2C FR). */}
                <label htmlFor="cgv-accept" className="flex items-start gap-3 cursor-pointer py-1">
                  <input
                    id="cgv-accept"
                    type="checkbox"
                    checked={acceptedCgv}
                    onChange={e => { setAcceptedCgv(e.target.checked); setError(''); }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-white cursor-pointer"
                  />
                  <span className="font-ui text-xxs md:text-xs text-brand-gray/55 leading-relaxed">
                    J’ai lu et j’accepte les{' '}
                    <Link href="/cgv" className="underline underline-offset-2 hover:text-brand-white/80 transition-colors">
                      Conditions Générales de Vente
                    </Link>.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="animate-shimmer w-full py-4 mt-1 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.15em] min-[390px]:tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ minHeight: '44px' }}
                >
                  {/* Espace insécable : plus étroit que 360 px, « — 49 € » passe ensemble à la ligne. */}
                  {loading ? 'Redirection…' : `Commander en ${colorLabel} —\u00a0${TSHIRT_PRICE_EUR}\u00a0€`}
                </button>

                <p className="font-ui text-xxs md:text-xs text-brand-gray/50 text-center leading-relaxed">
                  Paiement sécurisé par Stripe · Adresse de livraison à l’étape suivante
                </p>
                <Link href="/faq" className="font-ui text-xxs text-brand-gray/50 text-center underline underline-offset-4 hover:text-brand-white/80 transition-colors">
                  Comment ça marche&nbsp;?
                </Link>
              </form>
            </div>
            </div>{/* fin colonne achat */}
          </div>
        </section>

        {/* Comment ça marche */}
        <section className="max-w-lg mx-auto py-12 border-t border-brand-gray/10 animate-stagger-3">
          <div className="flex flex-col gap-8">
            <h2 className="font-display text-2xl md:text-3xl font-light tracking-[0.04em] text-center">
              Comment ça marche&nbsp;?
            </h2>
            <div className="flex flex-col gap-6">
              {[
                { step: '01', title: 'Commandez', desc: 'Recevez votre t-shirt et votre code d’activation unique par email.' },
                { step: '02', title: 'Activez', desc: 'Créez votre profil en 2 minutes. Choisissez votre pitch, ajoutez une photo.' },
                { step: '03', title: 'Portez', desc: 'Le QR code dans le dos est prêt. Vous n’avez plus rien à faire.' },
                { step: '04', title: 'Recevez', desc: 'Quelqu’un ose scanner. Vous recevez un message. Vous décidez de la suite.' },
              ].map((item) => (
                <div key={item.step} className="flex gap-5">
                  <span className="font-ui text-xs text-brand-gray/50 tracking-[0.1em] mt-1 flex-shrink-0">{item.step}</span>
                  <div className="flex flex-col gap-1">
                    <p className="font-ui text-sm md:text-base font-medium text-brand-white/80">{item.title}</p>
                    <p className="font-ui text-sm text-brand-gray/50 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pas de section témoignages tant qu'il n'y a pas de vrais porteurs : des avis
            inventés présentés comme réels = pratique commerciale trompeuse (Code de la
            consommation). À réintroduire avec des retours réels et consentis. */}

        {/* Capture newsletter pour les visiteurs pas prêts à acheter */}
        <section className="max-w-lg mx-auto py-12 border-t border-brand-gray/10 animate-stagger-4">
          <NewsletterCapture source="shop_inline" />
        </section>

        <footer className="max-w-lg mx-auto py-12 border-t border-brand-gray/10 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="font-ui text-xs text-brand-gray/50 tracking-[0.2em] uppercase">In Real Society</span>
            <Link href="/" className="font-ui text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors">
              L’application
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/cgv" className="font-ui text-xxs text-brand-gray/50 hover:text-brand-white/80 transition-colors">
              CGV
            </Link>
            <Link href="/manifeste" className="font-ui text-xxs text-brand-gray/50 hover:text-brand-white/80 transition-colors">
              Manifeste
            </Link>
          </div>
        </footer>
      </div>

      {/* Barre d'achat fixe — mobile/tablette uniquement, masquée quand le formulaire
          est à l'écran. Sous le bandeau cookies (z-[100]) tant qu'il est affiché.
          Plus serrée sous 400 px : « Blanc · XXL · livraison comprise » et le
          bouton tiennent à 360 px. */}
      {!formInView && (
        <div
          data-sticky-bottom
          role="region"
          aria-label="Commander"
          className="fixed inset-x-0 bottom-0 z-40 lg:hidden border-t border-brand-gray/15 bg-brand-black/95 backdrop-blur-sm px-4 min-[400px]:px-6 pt-3 animate-fade-in"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="font-display text-2xl font-light leading-none">{TSHIRT_PRICE_EUR}&nbsp;€</span>
              <span className="font-ui text-xxs text-brand-gray/55 mt-1 whitespace-nowrap">
                {colorLabel} · {tshirtSize} · livraison comprise
              </span>
            </div>
            <button
              type="button"
              onClick={goToForm}
              className="px-4 min-[400px]:px-6 py-3 bg-brand-white text-brand-black font-ui font-bold text-xs tracking-[0.15em] min-[400px]:tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200"
              style={{ minHeight: '44px' }}
            >
              Commander
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
