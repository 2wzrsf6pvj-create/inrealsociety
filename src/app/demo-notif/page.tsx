import type { Metadata } from 'next';
import { PhoneNotif } from '@/app/components/ui/PhoneNotif';

// PAGE DÉMO (à screenshoter). Aperçu isolé du composant PhoneNotif (le « moment de
// réception ») sur fond sombre. Le même composant est utilisé dans le hero de l'accueil.
// noindex. À supprimer quand le screen est pris.
export const metadata: Metadata = { title: 'Aperçu — notification', robots: { index: false, follow: false } };

export default function DemoNotifPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black px-6 py-16 overflow-hidden">
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />

      <PhoneNotif className="relative z-10 w-[300px]" />

      <p className="relative z-10 mt-8 font-ui text-xs text-brand-gray/55 tracking-[0.15em] uppercase text-center">
        Quelqu&apos;un t&apos;a scanné·e
      </p>
    </main>
  );
}
