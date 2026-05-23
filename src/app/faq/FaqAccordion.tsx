'use client';

import { useState } from 'react';
import SectionDivider from '@/app/components/ui/SectionDivider';

export interface FaqGroup {
  label: string;
  items: { q: string; a: string }[];
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-brand-gray/10">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 py-4 text-left group"
        style={{ minHeight: '44px' }}
      >
        <span className="font-ui text-sm md:text-base text-brand-white/85 group-hover:text-brand-white transition-colors leading-snug">
          {q}
        </span>
        <span className={`font-ui text-lg text-brand-gray/50 group-hover:text-brand-white/80 transition-all duration-300 flex-shrink-0 leading-none mt-0.5 ${open ? 'rotate-45' : ''}`}>
          +
        </span>
      </button>
      {/* grid 0fr→1fr : hauteur animée en douceur, réponse toujours dans le DOM (SEO) */}
      <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <p className="font-ui text-sm font-light text-brand-gray/55 leading-relaxed pb-4 pr-6">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function FaqAccordion({ groups }: { groups: FaqGroup[] }) {
  return (
    <div className="w-full flex flex-col gap-8">
      {groups.map(group => (
        <div key={group.label} className="flex flex-col gap-1">
          <SectionDivider label={group.label} />
          <div className="flex flex-col">
            {group.items.map(item => <FaqItem key={item.q} q={item.q} a={item.a} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
