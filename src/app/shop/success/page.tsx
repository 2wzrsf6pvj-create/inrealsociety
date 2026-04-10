'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function SuccessContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const sessionId    = searchParams.get('session_id');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [code, setCode]     = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) { setStatus('error'); return; }

    // Récupère le code depuis la BDD via l'API
    const fetchCode = async () => {
      try {
        const res  = await fetch(`/api/order-code?session=${sessionId}`);
        const data = await res.json();
        if (data.code) {
          setCode(data.code);
          // Sauvegarde le code dans localStorage pour pré-remplir /register
          localStorage.setItem('pending_activation_code', data.code);
        }
      } catch {
        // Silencieux — le code arrivera par email
      } finally {
        setStatus('ok');
      }
    };

    // Attend 2s que le webhook traite, puis fetch
    setTimeout(fetchCode, 2000);
  }, [sessionId]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center gap-6 animate-pulse">
        <div className="w-14 h-14 rounded-full border border-brand-gray/20" />
        <p className="font-ui text-[0.55rem] text-brand-gray/30 tracking-[0.2em] uppercase">Confirmation en cours...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="font-display text-[1.4rem] font-light">Une erreur est survenue.</p>
        <Link href="/shop" className="font-ui text-[0.55rem] text-brand-gray/30 underline underline-offset-4">← Retour à la boutique</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 text-center animate-stagger-1">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-20 h-20 rounded-full border border-brand-white/10 animate-ring-pulse" />
        <div className="w-14 h-14 rounded-full border border-brand-white/30 flex items-center justify-center">
          <span style={{ fontSize: '20px' }}>✦</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[2rem] font-light tracking-[0.04em]">Commande confirmée.</h1>
        <p className="font-ui text-[0.58rem] font-light text-brand-gray/50 leading-relaxed">
          Votre t-shirt est en préparation.<br />
          {code
            ? 'Votre code d\'activation est prêt — créez votre profil maintenant.'
            : 'Votre code d\'activation vous sera envoyé par email dans quelques minutes.'
          }
        </p>
      </div>

      {/* Affiche le code si disponible */}
      {code && (
        <div className="w-full border border-brand-white/15 p-5 flex flex-col items-center gap-2">
          <p className="font-ui text-[0.45rem] text-brand-gray/30 tracking-[0.2em] uppercase">Votre code d'activation</p>
          <p className="font-mono text-[1.4rem] font-bold tracking-[0.3em] text-brand-white">{code}</p>
        </div>
      )}

      <div className="w-full h-px bg-brand-gray/10" />

      <div className="w-full flex flex-col gap-3">
        {/* Redirige vers /register avec le code pré-rempli */}
        <button
          onClick={() => router.push(code ? `/register?code=${code}` : '/register')}
          className="animate-shimmer w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.6rem] tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 text-center block"
          style={{ minHeight: '44px' }}
        >
          Créer mon profil {code ? '→' : '(vérifiez votre email)'}
        </button>
        <Link href="/shop"
          className="w-full py-3 border border-brand-gray/15 text-center font-ui text-[0.52rem] font-light tracking-[0.15em] uppercase text-brand-gray/35 hover:border-brand-gray/30 transition-colors"
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
      <div className="z-10 w-full max-w-xs">
        <Suspense fallback={null}><SuccessContent /></Suspense>
      </div>
    </main>
  );
}