'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type TshirtColor = 'dark' | 'light';
type TshirtSize  = 'S' | 'M' | 'L' | 'XL' | 'XXL';

const SIZES: TshirtSize[] = ['S', 'M', 'L', 'XL', 'XXL'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      <button onClick={() => setOpen(true)} className="font-ui text-xxs text-brand-gray/25 underline underline-offset-2 hover:text-brand-gray/50 transition-colors">
        Guide des tailles
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6" onClick={() => setOpen(false)}>
          <div className="bg-[#0a0a0a] border border-brand-gray/15 rounded-[2px] p-6 w-full max-w-xs flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-ui text-xs text-brand-gray/40 tracking-[0.2em] uppercase">Guide des tailles</p>
              <button onClick={() => setOpen(false)} className="font-ui text-xs text-brand-gray/30 hover:text-brand-white transition-colors">✕</button>
            </div>
            <p className="font-ui text-xxs text-brand-gray/25">Comfort Colors 1717 — coupe oversize. En cas de doute, prenez votre taille habituelle.</p>
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-gray/10">
                  <th className="font-ui text-xxs text-brand-gray/30 tracking-[0.15em] uppercase text-left py-2">Taille</th>
                  <th className="font-ui text-xxs text-brand-gray/30 tracking-[0.15em] uppercase text-center py-2">Poitrine</th>
                  <th className="font-ui text-xxs text-brand-gray/30 tracking-[0.15em] uppercase text-center py-2">Longueur</th>
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
        body: JSON.stringify({ email: email.trim(), tshirtColor, tshirtSize, referrerId: referrerId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
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
        <Link href="/" className="font-display text-xl font-light tracking-[0.1em]">X</Link>
        <span className="font-ui text-xs text-brand-gray/30 tracking-[0.3em] uppercase">In Real Society</span>
        <Link href="/register" className="font-ui text-xs text-brand-gray/20 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/50 transition-colors" style={{ minHeight: '44px', display: 'flex', alignItems: 'center' }}>
          Membres
        </Link>
      </nav>

      <div className="relative z-10 max-w-lg mx-auto px-6">

        {/* Hero */}
        <section className="py-16 md:py-20 flex flex-col items-center text-center gap-8 animate-stagger-1">
          <div className="flex flex-col gap-2">
            <p className="font-ui text-xs text-brand-gray/30 tracking-[0.35em] uppercase">The IRL Social Club</p>
            <h1 className="font-display text-4xl md:text-5xl font-light leading-[1.1] tracking-[0.03em]">
              Portez une<br />intention.
            </h1>
          </div>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/50 leading-relaxed max-w-xs">
            Ce vêtement dit oui avant que vous parliez.<br />
            Il donne le contrôle à celle qui ose scanner.
          </p>
          <div className="flex items-center gap-4">
            <span className="font-ui text-xs text-brand-gray/20 tracking-[0.2em] uppercase">Anonyme</span>
            <span className="text-brand-gray/15">·</span>
            <span className="font-ui text-xs text-brand-gray/20 tracking-[0.2em] uppercase">Éphémère</span>
            <span className="text-brand-gray/15">·</span>
            <span className="font-ui text-xs text-brand-gray/20 tracking-[0.2em] uppercase">Sécurisé</span>
          </div>
        </section>

        {/* Produit */}
        <section className="py-12 border-t border-brand-gray/10 animate-stagger-2">
          <div className="flex flex-col gap-8">

            {/* Visuel produit — adapté à la couleur */}
            <div className={`w-full aspect-square border rounded-[2px] flex flex-col items-center justify-center gap-4 transition-colors ${
              tshirtColor === 'dark'
                ? 'bg-[#0a0a0a] border-brand-gray/10'
                : 'bg-[#f0ede8] border-brand-gray/20'
            }`}>
              <div className="relative flex items-center justify-center">
                <div className={`absolute w-32 h-32 rounded-full border ${tshirtColor === 'dark' ? 'border-brand-white/5' : 'border-brand-black/5'}`} />
                <div className={`w-24 h-24 rounded-full border flex items-center justify-center ${
                  tshirtColor === 'dark' ? 'border-brand-white/20' : 'border-brand-black/20'
                }`}>
                  <span className={`font-display text-5xl font-light ${
                    tshirtColor === 'dark' ? 'text-[#C5A059]/60' : 'text-[#0A192F]/60'
                  }`}>X</span>
                </div>
              </div>
              <p className={`font-ui text-xs tracking-[0.2em] uppercase ${
                tshirtColor === 'dark' ? 'text-brand-gray/20' : 'text-brand-black/30'
              }`}>
                T-shirt · Comfort Colors 1717 · {colorLabel}
              </p>
            </div>

            {/* Sélecteur couleur */}
            <div className="flex flex-col gap-2">
              <p className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase">Couleur</p>
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
                <p className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase">Taille</p>
                <SizeGuide />
              </div>
              <div className="flex gap-2">
                {SIZES.map(size => (
                  <button
                    key={size}
                    onClick={() => setTshirtSize(size)}
                    className={`flex-1 py-2.5 rounded-[2px] border transition-all font-ui text-sm tracking-[0.1em] ${
                      tshirtSize === size
                        ? 'border-brand-white/60 bg-brand-white/5 text-brand-white'
                        : 'border-brand-gray/15 text-brand-gray/40 hover:border-brand-gray/30'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Infos produit */}
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <h2 className="font-display text-2xl md:text-3xl font-light tracking-[0.04em]">
                    T-shirt In Real Society
                  </h2>
                  <p className="font-ui text-xs md:text-sm text-brand-gray/40">
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

              <form onSubmit={handleBuy} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase">Votre email</label>
                  <p className="font-ui text-xxs md:text-xs text-brand-gray/20 leading-relaxed">
                    Votre code d&apos;activation vous sera envoyé ici après paiement.
                  </p>
                  <input
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(''); }}
                    className="w-full bg-transparent border-b border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base py-3 outline-none transition-colors placeholder:text-brand-gray/20"
                    style={{ minHeight: '44px' }}
                  />
                  {error && <p className="font-ui text-sm text-red-900">{error}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="animate-shimmer w-full py-4 mt-2 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.3em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ minHeight: '44px' }}
                >
                  {loading ? 'Redirection...' : `Commander en ${colorLabel} — 49€`}
                </button>

                <p className="font-ui text-xxs md:text-xs text-brand-gray/20 text-center leading-relaxed">
                  Paiement sécurisé par Stripe · Livraison 5-7 jours ouvrés
                </p>
                <p className="font-ui text-xxs text-brand-gray/15 text-center leading-relaxed">
                  En commandant, vous acceptez les{' '}
                  <Link href="/cgv" className="underline underline-offset-2 hover:text-brand-gray/40 transition-colors">
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
                  <span className="font-ui text-xs text-brand-gray/20 tracking-[0.1em] mt-1 flex-shrink-0">{item.step}</span>
                  <div className="flex flex-col gap-1">
                    <p className="font-ui text-sm md:text-base font-medium text-brand-white/80">{item.title}</p>
                    <p className="font-ui text-sm text-brand-gray/40 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="py-12 border-t border-brand-gray/10 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="font-ui text-xs text-brand-gray/20 tracking-[0.2em] uppercase">In Real Society</span>
            <Link href="/" className="font-ui text-xs text-brand-gray/20 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-gray/40 transition-colors">
              L&apos;application
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/cgv" className="font-ui text-xxs text-brand-gray/15 hover:text-brand-gray/40 transition-colors">
              CGV
            </Link>
            <Link href="/manifeste" className="font-ui text-xxs text-brand-gray/15 hover:text-brand-gray/40 transition-colors">
              Manifeste
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
