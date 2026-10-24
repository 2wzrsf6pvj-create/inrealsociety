'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { captureEvent } from '@/lib/posthog-client';
import { forgetScanOrigin } from '@/lib/scan-origin';
import { haptic } from '@/lib/haptics';
import type { OrderRecap } from '@/lib/order-recap';

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-ui text-xxs text-brand-gray/50 tracking-[0.15em] uppercase whitespace-nowrap">{label}</dt>
      <dd className="font-ui text-sm text-brand-white/85 text-right">{value}</dd>
    </div>
  );
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const sessionId    = searchParams.get('session') || searchParams.get('session_id');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [code, setCode]     = useState<string | null>(null);
  const [recap, setRecap]   = useState<OrderRecap | null>(null);
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      haptic('light');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papier indisponible (contexte non sécurisé / vieux navigateur) :
      // le code reste sélectionnable (select-all) → copie manuelle possible.
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sans session Stripe dans l'URL, rien à attendre
    if (!sessionId) { setStatus('error'); return; }
    captureEvent('purchase_success_viewed');
    // L'achat est fait → le parrainage est consommé. On purge le ref pour qu'il
    // ne crédite/remise pas des commandes futures sans rapport (single-use).
    localStorage.removeItem('referral_code');
    forgetScanOrigin();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // Le code d'activation est écrit par le webhook Stripe, qui prend souvent
    // plus de 2 s. Un fetch unique manquait alors le code → écran « par email »
    // alors qu'il était sur le point d'arriver. On poll avec backoff jusqu'à
    // ~30 s, puis on bascule sur le message email (filet : le code part aussi
    // par email, et /commande permet de le retrouver).
    const delays = [1500, 2000, 2500, 3000, 4000, 5000, 6000, 6000]; // ~30 s
    let attempt = 0;

    const poll = async () => {
      try {
        const res  = await fetch(`/api/order-code?session=${sessionId}`);
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.recap) setRecap(data.recap);
        if (data.code && typeof data.code === 'string' && data.code.length >= 6) {
          setCode(data.code);
          // NB : on ne persiste PAS le code en localStorage — c'est une capability
          // (bind du tee à un compte) et l'ancienne écriture `pending_activation_code`
          // n'était jamais relue → stockage mort d'un code semi-sensible sur l'appareil.
          captureEvent('activation_code_revealed');
          setStatus('ok');
          return;
        }
      } catch {
        // réseau KO → on retente (ou on bascule email si quota épuisé)
      }
      if (cancelled) return;
      if (attempt >= delays.length) {
        setStatus('ok'); // pas de code après ~30 s → message « envoyé par email »
        return;
      }
      timer = setTimeout(poll, delays[attempt++]);
    };

    timer = setTimeout(poll, delays[attempt++]);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center gap-6 animate-pulse" role="status" aria-live="polite">
        <div className="w-14 h-14 rounded-full border border-brand-gray/20" />
        <p className="font-ui text-sm text-brand-gray/55 tracking-[0.2em] uppercase">Confirmation en cours...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-6 text-center" role="alert">
        <p className="font-display text-2xl font-light">Une erreur est survenue.</p>
        <Link href="/shop" className="font-ui text-sm text-brand-gray/55 underline underline-offset-4">← Retour à la boutique</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 text-center animate-stagger-1" role="status" aria-live="polite">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-20 h-20 rounded-full border border-brand-white/10 animate-ring-pulse" />
        <div className="w-14 h-14 rounded-full border border-brand-white/30 flex items-center justify-center">
          <span style={{ fontSize: '20px' }} aria-hidden="true">✦</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl md:text-4xl font-light tracking-[0.04em]">Commande confirmée.</h1>
        <p className="font-ui text-sm font-light text-brand-gray/50 leading-relaxed">
          Votre t-shirt est en préparation.<br />
          {code
            ? 'Votre code d\'activation est prêt — créez votre profil maintenant.'
            : 'Votre code d\'activation vous sera envoyé par email dans quelques minutes.'
          }
        </p>
      </div>

      {recap && (
        <dl aria-label="Votre commande" className="w-full border border-brand-gray/15 px-5 py-4 flex flex-col gap-2 text-left">
          <RecapRow label="Article" value={recap.article} />
          <RecapRow label="Accroche" value={recap.tagline ? `« ${recap.tagline} »` : 'QR seul'} />
          {recap.total && <RecapRow label="Total payé" value={recap.total} />}
        </dl>
      )}

      {code && (
        <div className="w-full border border-brand-white/15 p-5 flex flex-col items-center gap-3">
          <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Votre code d&apos;activation</p>
          <p className="font-mono text-2xl font-bold tracking-[0.3em] text-brand-white select-all">{code}</p>
          <button
            type="button"
            onClick={copyCode}
            aria-live="polite"
            style={{ minHeight: '36px' }}
            className={`font-ui text-xs tracking-[0.15em] uppercase border px-4 py-1.5 rounded-[2px] transition-colors ${
              copied
                ? 'border-brand-white/60 text-brand-white'
                : 'border-brand-gray/20 text-brand-gray/50 hover:border-brand-gray/40 hover:text-brand-white/80'
            }`}
          >
            {copied ? '✓ Copié !' : 'Copier le code'}
          </button>
        </div>
      )}

      <div className="w-full h-px bg-brand-gray/10" />

      <div className="w-full flex flex-col gap-3">
        <button
          onClick={() => router.push(code ? `/register?code=${code}` : '/register')}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-sm tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 text-center block"
          style={{ minHeight: '44px' }}
        >
          Créer mon profil {code ? '→' : '(vérifiez votre email)'}
        </button>
        <Link href={code ? `/commande?code=${encodeURIComponent(code)}` : '/commande'}
          className="w-full py-3 border border-brand-gray/15 text-center font-ui text-xs font-light tracking-[0.15em] uppercase text-brand-gray/60 hover:border-brand-gray/30 hover:text-brand-white/80 transition-colors"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          Suivre ma commande
        </Link>
        <Link href="/shop"
          className="font-ui text-xs text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white/80 transition-colors text-center py-2"
          style={{ minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          Retour à la boutique
        </Link>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 py-12 overflow-hidden">
      <div className="absolute top-[-15%] right-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
      <div className="z-10 w-full max-w-xs md:max-w-sm">
        <Suspense fallback={null}><SuccessContent /></Suspense>
      </div>
    </main>
  );
}
