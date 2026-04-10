// app/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black text-brand-white px-6 overflow-hidden">

      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />

      <div className="z-10 flex flex-col items-center text-center gap-8 w-full max-w-xs">

        {/* Logo */}
        <div className="relative flex items-center justify-center animate-stagger-1">
          <div className="absolute w-24 h-24 rounded-full border border-brand-white/10 animate-ring-pulse" />
          <div className="w-[72px] h-[72px] rounded-full border border-brand-white/20 flex items-center justify-center">
            <span className="font-display text-[2rem] font-light tracking-[0.05em] opacity-40">X</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 animate-stagger-2">
          <p className="font-ui text-[0.5rem] text-brand-gray/40 tracking-[0.3em] uppercase">
            Erreur 404
          </p>
          <h1 className="font-display text-[1.8rem] font-light tracking-[0.06em]">
            Ce profil n'existe pas.
          </h1>
          <p className="font-ui text-[0.65rem] font-light text-brand-gray/50 leading-relaxed">
            Le QR code est invalide ou ce membre<br />a quitté le club.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full animate-stagger-3">
          <div className="flex-1 h-px bg-brand-gray/10 animate-line-draw" />
          <span className="font-ui text-[0.48rem] text-brand-gray/20 tracking-[0.2em] uppercase">In Real Society</span>
          <div className="flex-1 h-px bg-brand-gray/10" />
        </div>

        <Link
          href="/"
          className="animate-shimmer animate-stagger-4 w-full py-4 bg-brand-white text-brand-black font-ui font-bold text-[0.65rem] tracking-[0.25em] uppercase rounded-[1px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-200 block text-center"
        >
          Retour à l'accueil
        </Link>

      </div>
    </main>
  );
}