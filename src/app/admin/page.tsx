// /admin — modération au quotidien (choix de Clément) : signalements et photos
// à traiter, appareils bannis, profils suspendus, dernières décisions.
// Réservé à ADMIN_EMAILS (adresse confirmée) ; pour tout autre compte, 404.
// Le proxy renvoie déjà vers la connexion un visiteur non connecté.

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/admin';
import { loadModerationQueue, QUEUE_WINDOW_DAYS, type QueueMember } from '@/lib/moderation-queue';
import AdminAction from './AdminAction';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Modération', robots: { index: false, follow: false } };

const WHEN = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
const when = (iso: string) => WHEN.format(new Date(iso));

const DECISION_LABELS: Record<string, string> = {
  'member.suspended':          'Profil suspendu',
  'member.unsuspended':        'Suspension levée',
  'member.photo_removed':      'Photo retirée',
  'device.banned':             'Appareil banni',
  'device.unbanned':           'Bannissement levé',
  'device.auto_banned':        'Appareil banni automatiquement',
  'message.hidden':            'Message masqué',
  'moderation.report_handled': 'Signalement clos',
};

const MOTIF_TO_MEMBER = { field: 'motif', label: 'Motif, envoyé au porteur avec la décision' } as const;
const MOTIF_KEPT      = { field: 'motif', label: 'Motif, gardé dans le journal' } as const;
const CLOSE           = { field: 'decision', label: 'Décision (par exemple : « rien de contraire aux règles »)' } as const;

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase">
        {title} <span className="text-brand-gray/50 font-normal">({count})</span>
      </h2>
      {count === 0
        ? <p className="font-ui text-sm text-brand-gray/50">Rien à traiter.</p>
        : <div className="flex flex-col gap-3">{children}</div>}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="border border-brand-gray/15 rounded-[2px] p-4 flex flex-col gap-3">{children}</div>;
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="font-ui text-sm text-brand-gray/80 leading-relaxed break-words">
      <span className="text-brand-gray/50">{label} : </span>{children}
    </p>
  );
}

function MemberLink({ member }: { member: QueueMember | null }) {
  if (!member) return <>profil supprimé</>;
  return (
    <>
      <Link href={`/profil/${member.id}`} className="underline underline-offset-4">{member.name ?? 'sans prénom'}</Link>
      {member.suspended && <span className="text-red-300/80"> · suspendu</span>}
    </>
  );
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdmin(user)) notFound();

  const q = await loadModerationQueue();

  return (
    <main className="min-h-screen bg-brand-black text-brand-white px-4 py-16">
      <div className="max-w-2xl mx-auto flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-light">Modération</h1>
          <p className="font-ui text-sm text-brand-gray/60 leading-relaxed">
            Signalements des {QUEUE_WINDOW_DAYS} derniers jours. Marche à suivre : docs/MODERATION.md.
            Menace pour la vie ou la sécurité d&apos;une personne : 17 ou 112, sans attendre.
          </p>
          <a href="/admin" className="font-ui text-xs tracking-[0.15em] uppercase underline underline-offset-4 self-start py-2">
            Actualiser
          </a>
        </header>

        <Section title="Profils et conversations signalés" count={q.profileReports.length}>
          {q.profileReports.map((r) => (
            <Card key={r.key}>
              <Line label={r.messageId ? 'Conversation signalée' : 'Profil signalé'}>
                <MemberLink member={r.member} /> · {when(r.createdAt)}
              </Line>
              {r.messageId && (
                <Line label="Conversation">
                  <Link href={`/conversation/${r.messageId}`} className="underline underline-offset-4">lire</Link>
                </Line>
              )}
              <Line label="Motif">« {r.reason} »</Line>
              <Line label="Auteur">{r.contact ?? 'contact non fourni'}</Line>
              {r.member && (
                <div className="flex flex-wrap gap-2">
                  {!r.member.suspended && (
                    <AdminAction label="Suspendre le profil" danger notifyReporter
                      payload={{ action: 'suspend_member', memberId: r.member.id, reportKey: r.key }} ask={MOTIF_TO_MEMBER} />
                  )}
                  {r.member.photoUrl && (
                    <AdminAction label="Retirer la photo" notifyReporter
                      payload={{ action: 'remove_photo', memberId: r.member.id, reportKey: r.key }} ask={MOTIF_TO_MEMBER} />
                  )}
                  <AdminAction label="Clore" notifyReporter
                    payload={{ action: 'mark_handled', reportKey: r.key }} ask={CLOSE} />
                </div>
              )}
            </Card>
          ))}
        </Section>

        <Section title="Messages signalés par un porteur" count={q.messageReports.length}>
          {q.messageReports.map((r) => (
            <Card key={r.key}>
              <Line label="Signalé par">
                <MemberLink member={r.member} /> · {when(r.createdAt)}
              </Line>
              <Line label="Message (masqué pour le porteur)">« {r.content ?? 'supprimé'} »</Line>
              <Line label="Appareil">
                {r.senderToken
                  ? <>{r.senderToken.slice(0, 8)}… · signalé par {r.reporters} porteur{r.reporters > 1 ? 's' : ''}{r.banned ? ' · banni' : ''}</>
                  : 'inconnu (message ancien)'}
              </Line>
              <div className="flex flex-wrap gap-2">
                {r.senderToken && !r.banned && (
                  <AdminAction label="Bannir l’appareil" danger
                    payload={{ action: 'ban_device', senderToken: r.senderToken, reportKey: r.key }} ask={MOTIF_KEPT} />
                )}
                <AdminAction label="Clore" payload={{ action: 'mark_handled', reportKey: r.key }} ask={CLOSE} />
              </div>
            </Card>
          ))}
        </Section>

        <Section title="Photos à vérifier" count={q.photos.length}>
          {q.photos.map((p) => (
            <Card key={p.key}>
              <div className="flex items-center gap-4">
                {p.member.photoUrl && (
                  <Image src={p.member.photoUrl} alt={`Photo de ${p.member.name ?? 'ce porteur'}`} width={96} height={96}
                    className="w-24 h-24 object-cover border border-brand-gray/20" />
                )}
                <Line label="Porteur"><MemberLink member={p.member} /> · {when(p.createdAt)}</Line>
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminAction label="Photo correcte"
                  payload={{ action: 'mark_handled', reportKey: p.key, decision: 'photo vérifiée' }} />
                <AdminAction label="Retirer la photo" danger
                  payload={{ action: 'remove_photo', memberId: p.member.id, reportKey: p.key }} ask={MOTIF_TO_MEMBER} />
              </div>
            </Card>
          ))}
        </Section>

        <Section title="Profils suspendus" count={q.suspended.length}>
          {q.suspended.map((m) => (
            <Card key={m.id}>
              <Line label="Porteur">
                <Link href={`/profil/${m.id}`} className="underline underline-offset-4">{m.name ?? 'sans prénom'}</Link>
                {' '}· depuis le {when(m.suspendedAt)}
              </Line>
              <div className="flex flex-wrap gap-2">
                <AdminAction label="Lever la suspension" payload={{ action: 'unsuspend_member', memberId: m.id }} />
              </div>
            </Card>
          ))}
        </Section>

        <Section title="Appareils bannis" count={q.banned.length}>
          {q.banned.map((b) => (
            <Card key={b.senderToken}>
              <Line label="Appareil">{b.senderToken.slice(0, 8)}… · {when(b.createdAt)}</Line>
              <Line label="Raison">{b.reason ?? '—'}</Line>
              <div className="flex flex-wrap gap-2">
                <AdminAction label="Lever le bannissement" payload={{ action: 'unban_device', senderToken: b.senderToken }} />
              </div>
            </Card>
          ))}
        </Section>

        <Section title="Dernières décisions" count={q.decisions.length}>
          <ul className="flex flex-col gap-2">
            {q.decisions.map((d, i) => (
              <li key={i} className="font-ui text-xs text-brand-gray/70 leading-relaxed break-words">
                {when(d.createdAt)} · {DECISION_LABELS[d.action] ?? d.action}
                {typeof d.metadata.motif === 'string' && <> · « {d.metadata.motif} »</>}
                {typeof d.metadata.decision === 'string' && <> · {d.metadata.decision}</>}
                {typeof d.metadata.by === 'string' && <span className="text-brand-gray/45"> · {d.metadata.by}</span>}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </main>
  );
}
