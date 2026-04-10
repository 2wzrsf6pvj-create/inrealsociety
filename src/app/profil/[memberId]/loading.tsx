export default function ProfilLoading() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black px-6 overflow-hidden">
      <div className="z-10 flex flex-col items-center w-full max-w-xs gap-6">

        {/* Tag skeleton */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-brand-gray/10" />
          <div className="w-20 h-2 bg-brand-gray/10 rounded-full" />
          <div className="flex-1 h-px bg-brand-gray/10" />
        </div>

        {/* Avatar skeleton */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-24 h-24 rounded-full bg-brand-gray/10 animate-pulse" />
          <div className="w-24 h-2 bg-brand-gray/10 rounded-full animate-pulse" />
        </div>

        {/* Corps skeleton */}
        <div className="flex flex-col items-center gap-2 w-full">
          <div className="w-40 h-4 bg-brand-gray/10 rounded-full animate-pulse" />
          <div className="w-full h-2 bg-brand-gray/10 rounded-full animate-pulse" />
          <div className="w-4/5 h-2 bg-brand-gray/10 rounded-full animate-pulse" />
          <div className="w-3/5 h-2 bg-brand-gray/10 rounded-full animate-pulse" />
        </div>

        <div className="w-full h-px bg-brand-gray/10" />

        {/* Bouton skeleton */}
        <div className="w-full h-12 bg-brand-gray/10 rounded-[1px] animate-pulse" />
      </div>
    </main>
  );
}