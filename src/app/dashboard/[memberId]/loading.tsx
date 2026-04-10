export default function DashboardLoading() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black px-6 py-12 overflow-hidden">
      <div className="z-10 flex flex-col items-center w-full max-w-xs gap-8">

        {/* Header skeleton */}
        <div className="flex flex-col items-center gap-2 w-full">
          <div className="w-48 h-5 bg-brand-gray/10 rounded-full animate-pulse" />
          <div className="w-32 h-2 bg-brand-gray/10 rounded-full animate-pulse" />
        </div>

        {/* Stats skeleton */}
        <div className="flex items-center gap-6 justify-center w-full">
          {[1, 2, 3].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 bg-brand-gray/10 rounded-full animate-pulse" />
              <div className="w-10 h-1.5 bg-brand-gray/10 rounded-full animate-pulse" />
            </div>
          ))}
        </div>

        <div className="w-full h-px bg-brand-gray/10" />

        {/* Card skeleton */}
        <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-gray/10 animate-pulse flex-shrink-0" />
            <div className="flex flex-col gap-1 flex-1">
              <div className="w-24 h-2 bg-brand-gray/10 rounded-full animate-pulse" />
              <div className="w-16 h-1.5 bg-brand-gray/10 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="w-full h-2 bg-brand-gray/10 rounded-full animate-pulse" />
          <div className="w-4/5 h-2 bg-brand-gray/10 rounded-full animate-pulse" />
        </div>

        {/* Boutons skeleton */}
        <div className="w-full flex flex-col gap-3">
          <div className="w-full h-12 bg-brand-gray/10 rounded-[1px] animate-pulse" />
          <div className="w-full h-10 bg-brand-gray/10 rounded-[1px] animate-pulse" />
        </div>

      </div>
    </main>
  );
}