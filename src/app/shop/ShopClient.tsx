'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { captureEvent } from '@/lib/posthog-client';
import { SHOP_IMAGES_READY } from '@/lib/constants';
import TaglinePicker from '@/app/components/ui/TaglinePicker';

type TshirtColor = 'dark' | 'light';
type TshirtSize  = 'S' | 'M' | 'L' | 'XL' | 'XXL';

const SIZES: TshirtSize[] = ['S', 'M', 'L', 'XL', 'XXL'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Galerie produit ──────────────────────────────────────────────────────────
// Placeholder abstrait (logo )( ) — fallback tant qu'aucune vraie image n'est
// présente dans /public/shop/.
function AbstractTee({ color }: { color: TshirtColor }) {
  const isDark = color === 'dark';
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
      <div className="relative flex items-center justify-center">
        <div className={`absolute w-32 h-32 rounded-full border ${isDark ? 'border-brand-white/5' : 'border-brand-black/5'}`} />
        <div className={`w-24 h-24 rounded-full border flex items-center justify-center ${isDark ? 'border-brand-white/20' : 'border-brand-black/20'}`}>
          <span className={`font-display text-5xl font-light ${isDark ? 'text-[#C5A059]/60' : 'text-[#0A192F]/60'}`}>)(</span>
        </div>
      </div>
      <p className={`font-ui text-xs tracking-[0.2em] uppercase ${isDark ? 'text-brand-gray/50' : 'text-brand-black/30'}`}>
        T-shirt · Comfort Colors 1717 · {isDark ? 'Noir' : 'Blanc'}
      </p>
    </div>
  );
}

// Galerie : affiche /public/shop/tee-{noir|blanc}-{dos|face}.webp (mockups Printful).
// Le DOS (QR) est montré en premier — c'est l'argument de vente. onError = filet
// si un fichier manque malgré le flag. Cf. public/shop/README.txt.
function ProductGallery({ color }: { color: TshirtColor }) {
  const [view, setView]       = useState<'back' | 'front'>('back');
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  const isDark   = color === 'dark';
  const colorKey = isDark ? 'noir' : 'blanc';
  const src      = `/shop/tee-${colorKey}-${view}.webp`;
  const fallback = !SHOP_IMAGES_READY || !!missing[src];

  return (
    <div className="flex flex-col gap-3">
      <div className={`relative w-full aspect-square border rounded-[2px] overflow-hidden transition-colors ${isDark ? 'bg-[#0a0a0a] border-brand-gray/10' : 'bg-[#f0ede8] border-brand-gray/20'}`}>
        {fallback ? (
          <AbstractTee color={color} />
        ) : (
          <Image
            src={src}
            alt={`T-shirt In Real Society ${isDark ? 'Noir' : 'Blanc'} — ${view === 'back' ? 'dos avec QR code' : 'face'}`}
            fill
            sizes="(max-width: 768px) 100vw, 420px"
            className="object-cover"
            onError={() => setMissing(m => ({ ...m, [src]: true }))}
            priority
          />
        )}
        {SHOP_IMAGES_READY && view === 'back' && !fallback && (
          <span className="absolute bottom-2 left-2 px-2 py-1 rounded-[2px] bg-black/50 backdrop-blur-sm font-ui text-xxs tracking-[0.15em] uppercase text-brand-white/80">
            QR au dos
          </span>
        )}
      </div>
      {/* Toggle face/dos UNIQUEMENT quand les images existent (sinon il ne change rien). */}
      {SHOP_IMAGES_READY && (
        <div className="flex gap-2">
          {([['back', 'Dos (QR)'], ['front', 'Face']] as const).map(([v, label]) => (
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source }),
      });
    } catch { /* silencieux */ }
    setSending(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-display text-lg font-light italic text-brand-gray/60">
          Vous serez prévenu·e.
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
        <p className="font-ui text-xs text-brand-gray/55 tracking-[0.25em] uppercase">Pas encore prêt·e ?</p>
        <p className="font-display text-xl md:text-2xl font-light text-brand-gray/70">
          Restez informé·e du lancement et des prochaines collections.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="email"
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
          {sending ? '...' : 'OK'}
        </button>
      </div>
      <p className="font-ui text-xxs text-brand-gray/50 text-center">
        Désabonnable à tout moment via le lien dans chaque email.
      </p>
    </form>
  );
}

function SizeGuide() {
  const [open, setOpen] = useState(false);
  const sizes = [
    { size: 'S',   chest: '46', length: '71' },
    { size: 'M',   chest: '51', length: '74' },
    { size: 'L',   chest: '56', length: '76' },
    { size: 'XL',  chest: '61', length: '79' },
    { size: 'XXL', chest: '66', length: '81' },
  ];

  return (
    <>
      <button onClick={() => setOpen(true)} className="font-ui text-xxs text-brand-gray/55 underline underline-offset-2 hover:text-brand-white/80 transition-colors">
        Guide des tailles
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6" onClick={() => setOpen(false)}>
          <div className="bg-[#0a0a0a] border border-brand-gray/15 rounded-[2px] p-6 w-full max-w-xs flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-ui text-xs text-brand-gray/50 tracking-[0.2em] uppercase">Guide des tailles</p>
              <button onClick={() => setOpen(false)} aria-label="Fermer le guide des tailles" className="font-ui text-xs text-brand-gray/55 hover:text-brand-white transition-colors">✕</button>
            </div>
            <p className="font-ui text-xxs text-brand-gray/55">Comfort Colors 1717 — coupe oversize. En cas de doute, prenez votre taille habituelle.</p>
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
      )}
    </>
  );
}

export default function ShopClient() {
  const searchParams = useSearchParams();
  const [email, setEmail]             = useState('');
  const [tshirtColor, setTshirtColor] = useState<TshirtColor>('dark');
  const [tshirtSize, setTshirtSize]   = useState<TshirtSize>('M');
  const [taglineId, setTaglineId]     = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [referrerId, setReferrerId]   = useState<string | null>(null);

  useEffect(() => {
    // Capte le parrain depuis ?ref= ou depuis localStorage (page /join)
    const ref = searchParams.get('ref') || localStorage.getItem('referral_code');
    if (ref && UUID_RE.test(ref)) {
      setReferrerId(ref);
    }
  }, [searchParams]);

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Votre email est requis.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Email invalide.'); return; }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), tshirtColor, tshirtSize, taglineId, referrerId: referrerId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      captureEvent('checkout_started', { tshirt_color: tshirtColor, has_referrer: !!referrerId });
      window.location.href = data.url;
    } catch {
      setError('Une erreur est survenue. Réessayez.');
      setLoading(false);
    }
  };

  const colorLabel = tshirtColor === 'dark' ? 'Noir' : 'Blanc';

  return (
    <main className="relative bg-brand-black text-brand-white min-h-screen overflow-hidden">

      <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />

      <nav className="relative z-10 flex items-center justify-between px-6 py-6 border-b border-brand-gray/10">
        <Link href="/" className="font-display text-xl font-light tracking-[0.1em]">)(</Link>
        <span className="font-ui text-xs text-brand-gray/55 tracking-[0.3em] uppercase">In Real Society</span>
        <Link href="/register" className="font-ui text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors" style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
          Membres
        </Link>
      </nav>

      {/* Bandeau parrainage — affiché quand le visiteur arrive avec ?ref= */}
      {referrerId && (
        <div className="relative z-10 bg-[#0a0a08] border-b border-[#C5A059]/20 px-6 py-3">
          <p className="font-ui text-xs md:text-sm text-[#C5A059]/80 text-center tracking-wide">
            ✦ Vous arrivez par un parrainage — votre remise sera appliquée au paiement.
          </p>
        </div>
      )}

      <div className="relative z-10 max-w-lg mx-auto px-6">

        {/* Hero */}
        <section className="py-16 md:py-20 flex flex-col items-center text-center gap-8 animate-stagger-1">
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
          <div className="flex items-center gap-4">
            <span className="font-ui text-xs text-brand-gray/50 tracking-[0.2em] uppercase">Anonyme</span>
            <span className="text-brand-gray/15">·</span>
            <span className="font-ui text-xs text-brand-gray/50 tracking-[0.2em] uppercase">Éphémère</span>
            <span className="text-brand-gray/15">·</span>
            <span className="font-ui text-xs text-brand-gray/50 tracking-[0.2em] uppercase">Sécurisé</span>
          </div>
        </section>

        {/* Produit */}
        <section className="py-12 border-t border-brand-gray/10 animate-stagger-2">
          <div className="flex flex-col gap-8">

            {/* Visuel produit — galerie (mockups réels dans /public/shop si présents,
                sinon fallback placeholder). Dos+QR montré en premier. */}
            <ProductGallery color={tshirtColor} />

            {/* Sélecteur couleur */}
            <div className="flex flex-col gap-2">
              <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Couleur</p>
              <div className="flex gap-3">
                {([
                  { value: 'dark'  as const, label: 'Noir',  bg: '#0a0a0a' },
                  { value: 'light' as const, label: 'Blanc', bg: '#f5f5f5' },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTshirtColor(opt.value)}
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
                <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Taille</p>
                <SizeGuide />
              </div>
              <p className="font-ui text-xxs text-brand-gray/55 -mt-1">
                Coupe <span className="text-brand-gray/50">oversize</span> · M sélectionné par défaut · prenez votre taille habituelle
              </p>
              <div className="flex gap-2">
                {SIZES.map(size => (
                  <button
                    key={size}
                    onClick={() => setTshirtSize(size)}
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

            {/* Accroche imprimée sous le QR — le hameçon qui donne envie de scanner */}
            <TaglinePicker value={taglineId} onChange={setTaglineId} tshirtColor={tshirtColor} />

            {/* Infos produit */}
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <h2 className="font-display text-2xl md:text-3xl font-light tracking-[0.04em]">
                    T-shirt In Real Society
                  </h2>
                  <p className="font-ui text-xs md:text-sm text-brand-gray/50">
                    Comfort Colors 1717 · {colorLabel} · QR code imprimé dans le dos
                  </p>
                </div>
                <span className="font-display text-3xl font-light">49€</span>
              </div>

              <div className="flex flex-col gap-2 py-4 border-t border-b border-brand-gray/10">
                {[
                  'T-shirt coton lourd Comfort Colors 1717',
                  'Patch brodé doré à l\'avant',
                  'QR code premium imprimé en DTFlex dans le dos',
                  'Code d\'activation unique par email',
                  'Accès à la plateforme In Real Society',
                  'Profil configurable en 2 minutes',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <span className="font-ui text-sm text-[#C5A059]/60">✦</span>
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
                  <span className="font-ui text-xs text-brand-gray/60">5-10 j. · 2-4 j. en express</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase">Frais</span>
                  <span className="font-ui text-xs text-brand-gray/60">5€ standard · 12€ express</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase">Zones</span>
                  <span className="font-ui text-xs text-brand-gray/60">UE · UK · USA · Canada</span>
                </div>
              </div>

              <form onSubmit={handleBuy} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Votre email</label>
                  <p className="font-ui text-xxs md:text-xs text-brand-gray/50 leading-relaxed">
                    Votre code d&apos;activation vous sera envoyé ici après paiement.
                  </p>
                  <input
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base py-3 outline-none transition-colors placeholder:text-brand-gray/50"
                    style={{ minHeight: '44px' }}
                  />
                  {error && <p className="font-ui text-sm text-red-400">{error}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="animate-shimmer w-full py-4 mt-2 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ minHeight: '44px' }}
                >
                  {loading ? 'Redirection...' : `Commander en ${colorLabel} — 49€`}
                </button>

                <p className="font-ui text-xxs md:text-xs text-brand-gray/50 text-center leading-relaxed">
                  Paiement sécurisé par Stripe · Livraison choisie à l&apos;étape suivante
                </p>
                <Link href="/faq" className="font-ui text-xxs text-brand-gray/50 text-center underline underline-offset-4 hover:text-brand-white/80 transition-colors">
                  Comment ça marche ?
                </Link>
                <p className="font-ui text-xxs text-brand-gray/50 text-center leading-relaxed">
                  En commandant, vous acceptez les{' '}
                  <Link href="/cgv" className="underline underline-offset-2 hover:text-brand-white/80 transition-colors">
                    Conditions Générales de Vente
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </section>

        {/* Comment ça marche */}
        <section className="py-12 border-t border-brand-gray/10 animate-stagger-3">
          <div className="flex flex-col gap-8">
            <h2 className="font-display text-2xl md:text-3xl font-light tracking-[0.04em] text-center">
              Comment ça marche ?
            </h2>
            <div className="flex flex-col gap-6">
              {[
                { step: '01', title: 'Commandez', desc: 'Recevez votre t-shirt et votre code d\'activation unique par email.' },
                { step: '02', title: 'Activez', desc: 'Créez votre profil en 2 minutes. Choisissez votre pitch, ajoutez une photo.' },
                { step: '03', title: 'Portez', desc: 'Le QR code dans le dos est prêt. Vous n\'avez plus rien à faire.' },
                { step: '04', title: 'Recevez', desc: 'Quelqu\'un ose scanner. Vous recevez un message. Vous décidez de la suite.' },
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

        {/* Témoignages */}
        <section className="py-12 border-t border-brand-gray/10">
          <div className="flex flex-col gap-8">
            <h2 className="font-display text-2xl md:text-3xl font-light tracking-[0.04em] text-center">
              Ils le portent.
            </h2>
            <div className="flex flex-col gap-6">
              {[
                { quote: "J\u0027ai re\u00e7u mon premier message en terrasse. On a parl\u00e9 deux heures.", name: 'Marc, Paris' },
                { quote: "Le concept est g\u00e9nial. Pas de swipe, pas d\u0027app. Juste un t-shirt et du courage.", name: 'Camille, Lyon' },
                { quote: "Trois scans en une semaine. Deux conversations. Une rencontre.", name: 'Thomas, Bordeaux' },
              ].map((t, i) => (
                <div key={i} className="flex flex-col gap-2 px-2">
                  <p className="font-display text-base md:text-lg font-light italic text-brand-gray/60 leading-relaxed">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <p className="font-ui text-xs text-brand-gray/55 tracking-[0.1em]">— {t.name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Capture newsletter pour les visiteurs pas prêts à acheter */}
        <section className="py-12 border-t border-brand-gray/10 animate-stagger-4">
          <NewsletterCapture source="shop_inline" />
        </section>

        <footer className="py-12 border-t border-brand-gray/10 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="font-ui text-xs text-brand-gray/50 tracking-[0.2em] uppercase">In Real Society</span>
            <Link href="/" className="font-ui text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors">
              L&apos;application
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
    </main>
  );
}
