'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface Shipment { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; shipDate: string | null; }
interface OrderStatus {
  found: boolean;
  order?: { status: string; color: string; size: string; amount: number; createdAt: string; fulfilledAt: string | null };
  tracking?: { printfulStatus: string; shipments: Shipment[] } | null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
const COLOR_LABEL: Record<string, string> = { dark: 'Noir', light: 'Blanc' };

function Step({ label, done, current, sub, children }: {
  label: string; done: boolean; current?: boolean; sub?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 transition-colors ${done ? 'bg-brand-white' : current ? 'bg-brand-white/40 animate-unread' : 'border border-brand-gray/30'}`} />
        <span className="flex-1 w-px bg-brand-gray/15 my-1" />
      </div>
      <div className="flex flex-col gap-1 pb-6">
        <p className={`font-ui text-sm tracking-[0.05em] ${done ? 'text-brand-white/90' : 'text-brand-gray/50'}`}>{label}</p>
        {sub && <p className="font-ui text-xs text-brand-gray/50 leading-relaxed">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

function CommandeContent() {
  const searchParams = useSearchParams();
  const [code, setCode]       = useState(searchParams.get('code') ?? '');
  const [data, setData]       = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const lookup = useCallback(async (c: string) => {
    const clean = c.trim();
    if (!clean) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await fetch(`/api/order/status?code=${encodeURIComponent(clean)}`);
      if (res.status === 404) { setData({ found: false }); return; }
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError('Une erreur est survenue. Réessayez.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-lookup si un code est passé en query (depuis /shop/success ou l'email).
  useEffect(() => {
    const c = searchParams.get('code');
    if (c) lookup(c);
  }, [searchParams, lookup]);

  const o = data?.order;
  const refunded = o?.status === 'refunded';
  const paid     = !!o && (o.status === 'paid' || !!o.fulfilledAt);
  const inProd   = !!o?.fulfilledAt;
  const shipment = data?.tracking?.shipments.find(s => s.trackingNumber || s.shipDate) ?? data?.tracking?.shipments[0] ?? null;
  const shipped  = !!shipment && (!!shipment.trackingNumber || !!shipment.shipDate);

  return (
    <div className="z-10 flex flex-col w-full max-w-xs md:max-w-sm gap-8">
      <div className="text-center flex flex-col gap-2 animate-stagger-1">
        <p className="font-ui text-xs text-brand-gray/50 tracking-[0.3em] uppercase">Suivi de commande</p>
        <h1 className="font-display text-3xl md:text-4xl font-light tracking-[0.04em]">Ma commande</h1>
      </div>

      {/* Recherche par code */}
      <form onSubmit={(e) => { e.preventDefault(); lookup(code); }} className="flex flex-col gap-2 animate-stagger-2">
        <label className="font-ui text-xs text-brand-gray/50 tracking-[0.2em] uppercase">Votre code d&apos;activation</label>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ex. K7M2PQ9R"
            maxLength={64}
            className="flex-1 bg-transparent border-b border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-mono text-base py-3 outline-none transition-colors placeholder:text-brand-gray/30 tracking-[0.15em]"
            style={{ minHeight: '44px' }}
          />
          <button type="submit" disabled={loading || !code.trim()}
            className="px-5 bg-brand-white text-brand-black font-ui font-bold text-xs tracking-[0.2em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-30"
            style={{ minHeight: '44px' }}>
            {loading ? '...' : 'Suivre'}
          </button>
        </div>
        <p className="font-ui text-xxs text-brand-gray/50 leading-relaxed">
          Le code figure sur la page de confirmation et dans votre email de commande.
        </p>
        {error && <p className="animate-fade-in font-ui text-sm text-red-400">{error}</p>}
      </form>

      {/* Résultat */}
      {data && !data.found && (
        <div className="animate-fade-in flex flex-col items-center gap-3 text-center py-4">
          <div className="w-px h-8 bg-gradient-to-b from-transparent via-brand-white/15 to-transparent" />
          <p className="font-display text-xl font-light italic text-brand-gray/50">Aucune commande pour ce code.</p>
          <p className="font-ui text-xs text-brand-gray/50 leading-relaxed">Vérifiez le code, ou contactez <span className="text-brand-white/70">hello@inrealsociety.com</span>.</p>
        </div>
      )}

      {o && refunded && (
        <div className="animate-fade-in w-full bg-[#0a0a0a] border border-red-500/20 rounded-[2px] p-4 text-center">
          <p className="font-ui text-sm text-red-400/80">Cette commande a été remboursée.</p>
        </div>
      )}

      {o && !refunded && (
        <div className="animate-fade-in flex flex-col gap-6">
          {/* Récap article */}
          <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <p className="font-ui text-sm text-brand-white/85">T-shirt In Real Society</p>
              <p className="font-ui text-xs text-brand-gray/50">{COLOR_LABEL[o.color] ?? o.color} · Taille {o.size}</p>
            </div>
            <p className="font-ui text-sm text-brand-gray/55 tabular-nums">{(o.amount / 100).toFixed(2)} €</p>
          </div>

          {/* Timeline */}
          <div className="flex flex-col">
            <Step label="Commande passée" done sub={fmtDate(o.createdAt)} />
            <Step label="Paiement confirmé" done={paid} current={!paid} sub={paid ? undefined : 'En attente du paiement.'} />
            <Step label="En production" done={inProd} current={paid && !inProd}
              sub={inProd ? 'Votre t-shirt est en impression.' : 'Lancée dès le paiement confirmé.'} />
            <Step
              label="Expédié" done={shipped} current={inProd && !shipped}
              sub={shipped
                ? [shipment?.carrier, shipment?.shipDate ? `le ${fmtDate(shipment.shipDate)}` : null].filter(Boolean).join(' · ') || undefined
                : 'Vous recevrez le suivi ici dès l’expédition.'}
            >
              {shipped && shipment?.trackingUrl && (
                <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-1 inline-flex font-ui text-xs text-brand-white/70 underline underline-offset-4 hover:text-brand-white transition-colors">
                  Suivre le colis →
                </a>
              )}
              {shipped && !shipment?.trackingUrl && shipment?.trackingNumber && (
                <p className="mt-1 font-mono text-xs text-brand-gray/55">N° {shipment.trackingNumber}</p>
              )}
            </Step>
          </div>

          {/* Prochaine étape */}
          <div className="w-full bg-[#0a0a08] border border-[#C5A059]/20 rounded-[2px] p-4 flex flex-col gap-2">
            <p className="font-ui text-xs text-[#C5A059]/80 tracking-[0.15em] uppercase">À réception</p>
            <p className="font-ui text-xs text-brand-gray/55 leading-relaxed">
              Créez votre profil avec votre code d&apos;activation, puis portez le t-shirt.
            </p>
            <Link href="/register" className="font-ui text-xs text-brand-white/70 underline underline-offset-4 hover:text-brand-white transition-colors">
              Créer mon profil →
            </Link>
          </div>
        </div>
      )}

      <Link href="/" className="font-ui text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors text-center py-2" style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        ← retour à l&apos;accueil
      </Link>
    </div>
  );
}

export default function CommandePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />
      <Suspense fallback={null}><CommandeContent /></Suspense>
    </main>
  );
}
