export default function ConversationLoading() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-brand-black px-6 py-12 overflow-hidden">
      <div className="z-10 flex flex-col w-full max-w-xs md:max-w-sm gap-6">

        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-gray/10 animate-pulse flex-shrink-0" />
          <div className="flex flex-col gap-1">
            <div className="w-28 h-2.5 bg-brand-gray/10 rounded-full animate-pulse" />
            <div className="w-16 h-1.5 bg-brand-gray/10 rounded-full animate-pulse" />
          </div>
        </div>

        <div className="w-full h-px bg-brand-gray/10" />

        {/* Message skeleton */}
        <div className="flex flex-col gap-1">
          <div className="w-24 h-1.5 bg-brand-gray/10 rounded-full animate-pulse" />
          <div className="max-w-[85%] p-4 bg-brand-gray/5 border border-brand-gray/10 rounded-[2px]">
            <div className="flex flex-col gap-2">
              <div className="w-full h-3 bg-brand-gray/10 rounded-full animate-pulse" />
              <div className="w-4/5 h-3 bg-brand-gray/10 rounded-full animate-pulse" />
              <div className="w-2/5 h-3 bg-brand-gray/10 rounded-full animate-pulse" />
            </div>
          </div>
        </div>

        {/* Reply skeleton */}
        <div className="flex flex-col gap-2">
          <div className="w-20 h-1.5 bg-brand-gray/10 rounded-full animate-pulse" />
          <div className="w-full h-24 bg-brand-gray/5 border border-brand-gray/10 rounded-[2px] animate-pulse" />
          <div className="w-full h-11 bg-brand-gray/10 rounded-[1px] animate-pulse" />
        </div>

      </div>
    </main>
  );
}
