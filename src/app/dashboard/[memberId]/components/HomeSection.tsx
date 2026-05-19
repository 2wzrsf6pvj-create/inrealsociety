'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Member, Scan } from '@/lib/types';
import { daysActive, formatDate, getInitials, getWaitingPhrase, recentScansCount } from './utils';

// ─── Stats Block ──────────────────────────────────────────────────────────────

function StatsBlock({ member, recentScans }: { member: Member; recentScans: Scan[] }) {
  const days   = daysActive(member.created_at);
  const noScan = member.scan_count === 0;

  if (noScan) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div className="w-px h-6 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
        <p className="font-display text-lg md:text-xl font-light italic text-brand-gray/50 leading-relaxed">
          &ldquo;{getWaitingPhrase(member.id)}&rdquo;
        </p>
        <p className="font-ui text-xs text-brand-gray/25 tracking-[0.15em] uppercase">
          Membre depuis {days} jour{days > 1 ? 's' : ''}
        </p>
        <div className="w-px h-6 bg-gradient-to-b from-transparent via-brand-white/20 to-transparent" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6 w-full justify-center">
      {[
        { value: member.scan_count.toString(),                  label: 'Scans' },
        { value: recentScansCount(recentScans).toString(),      label: '7 jours' },
        { value: days.toString(),                               label: 'Jours' },
      ].map((s, i) => (
        <React.Fragment key={s.label}>
          {i > 0 && <div className="w-px h-8 bg-brand-gray/10" />}
          <div className="flex flex-col items-center gap-1">
            <span className="font-display text-3xl md:text-4xl font-light">{s.value}</span>
            <span className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase">{s.label}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Scan chart (premium only) ────────────────────────────────────────────────

function ScanChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <div className="w-full bg-[#080808] border border-[#C5A059]/15 rounded-[2px] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 w-full">
        <div className="flex-1 h-px bg-brand-gray/10" />
        <span className="font-ui text-xs text-[#C5A059]/50 tracking-[0.18em] uppercase">✦ scans · 7 jours</span>
        <div className="flex-1 h-px bg-brand-gray/10" />
      </div>
      <div className="flex items-end gap-1.5 h-16 w-full">
        {data.map(d => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full relative" style={{ height: '48px' }}>
              <div
                className="absolute bottom-0 w-full bg-[#C5A059]/30 rounded-t-[1px] transition-all duration-500"
                style={{ height: `${Math.max(2, (d.count / max) * 48)}px` }}
              />
            </div>
            <span className="font-ui text-[8px] text-brand-gray/25 tabular-nums">
              {new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'narrow' })}
            </span>
          </div>
        ))}
      </div>
      <p className="font-ui text-xxs text-brand-gray/25 text-center">
        {data.reduce((s, d) => s + d.count, 0)} scans cette semaine
      </p>
    </div>
  );
}

// ─── Home Section (orchestrator du tab Accueil) ──────────────────────────────

export default function HomeSection({ member, recentScans, scansByDay = [] }: {
  member: Member;
  recentScans: Scan[];
  scansByDay?: { date: string; count: number }[];
}) {
  return (
    <>
      <StatsBlock member={member} recentScans={recentScans} />

      {/* Stats premium */}
      {member.plan === 'premium' && scansByDay.length > 0 && (
        <ScanChart data={scansByDay} />
      )}

      <div className="w-full h-px bg-brand-gray/10" />

      {/* Profil card */}
      <div className="w-full bg-[#080808] border border-brand-gray/10 rounded-[2px] p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-brand-gray/10" />
          <span className="font-ui text-xs text-brand-gray/30 tracking-[0.18em] uppercase">votre profil</span>
          <div className="flex-1 h-px bg-brand-gray/10" />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 flex-shrink-0">
            <div className="absolute inset-[-4px] rounded-full border border-brand-white/5" />
            <div className="w-full h-full rounded-full border border-brand-gray/20 bg-[#0a0a0a] flex items-center justify-center overflow-hidden">
              {member.photo_url ? (
                <Image src={member.photo_url} alt={`Photo de ${member.name}`} width={40} height={40} className="w-full h-full object-cover" />
              ) : (
                <span className="font-display text-base font-light text-brand-gray/50">{getInitials(member.name)}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="font-ui text-sm font-medium tracking-[0.2em]">
              {member.name.toUpperCase()}
              {member.plan === 'premium' && <span className="ml-1.5 text-[#C5A059]/70">✦</span>}
            </p>
            <p className="font-ui text-xs text-brand-gray/40">
              {member.is_paused
                ? 'En pause'
                : member.scan_count > 0
                  ? `Actif · ${member.scan_count} scan${member.scan_count > 1 ? 's' : ''}`
                  : 'Profil actif · En attente du premier scan'}
            </p>
          </div>
        </div>
        <p className="font-display text-lg font-light italic text-brand-gray/50 leading-relaxed">
          &ldquo;{member.pitch}&rdquo;
        </p>
      </div>

      {/* Recent scans */}
      {recentScans.length > 0 && (
        <div className="w-full flex flex-col gap-2">
          <p className="font-ui text-xs text-brand-gray/30 tracking-[0.2em] uppercase">Derniers scans</p>
          {recentScans.map(scan => (
            <div key={scan.id} className="flex items-center justify-between py-2 border-b border-brand-gray/10">
              <div className="flex flex-col gap-0.5">
                <span className="font-ui text-sm font-light text-brand-white/70">{scan.scanner_name || 'Anonyme'}</span>
                {scan.location && (
                  <span className="font-ui text-xxs text-brand-gray/25">📍 {scan.location}</span>
                )}
              </div>
              <span className="font-ui text-xs text-brand-gray/40 flex-shrink-0">{formatDate(scan.scanned_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Lien profil */}
      <div className="w-full flex flex-col gap-3">
        <Link href={`/profil/${member.id}`}
          className="w-full py-3 border border-brand-gray/20 text-center font-ui text-sm font-light tracking-[0.2em] uppercase hover:border-brand-gray/50 transition-colors">
          Voir mon profil
        </Link>
      </div>
    </>
  );
}
