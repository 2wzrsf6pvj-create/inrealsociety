// /admin — pilotage au quotidien (choix de Clément) : recherche d'un porteur ou
// d'une commande, chiffres du test terrain, signalements et photos à traiter,
// commandes à surveiller, mesures en cours, dernières décisions.
// Réservé à ADMIN_EMAILS (adresse confirmée) ; pour tout autre compte, 404.
// Le proxy renvoie déjà vers la connexion un visiteur non connecté.

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/admin';
import { loadModerationQueue, QUEUE_WINDOW_DAYS, type QueueMember } from '@/lib/moderation-queue';
import { loadFieldStats, STATS_WINDOW_DAYS, FIRST_SCAN_DAYS, STILL_WORN_AFTER_DAYS, RECENT_SCAN_DAYS, LOOKBACK_DAYS } from '@/lib/field-stats';
import { loadOrderWatch, searchAdmin, NOT_ACTIVATED_AFTER_DAYS, type WatchedOrder, type MemberHit } from '@/lib/order-watch';
import { PUSH_SERVICE_LABELS } from '@/lib/push-service';
import AdminAction from './AdminAction';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administration', robots: { index: false, follow: false } };

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

const COLOR_LABELS: Record<string, string> = { dark: 'Noir', light: 'Blanc' };
const STATUS_LABELS: Record<string, string> = { pending: 'en attente de paiement', paid: 'payée', refunded: 'remboursée' };
const pct = (hit: number, total: number) => (total === 0 ? '—' : `${Math.round((hit / total) * 100)} %`);
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const PHONES_MISSING = 'migration 062 à appliquer';
const PHONE_LABELS = { ios: 'iPhone', android: 'Android' } as const;

const MOTIF_TO_MEMBER = { field: 'motif', label: 'Motif, envoyé au porteur avec la décision' } as const;
const MOTIF_KEPT      = { field: 'motif', label: 'Motif, gardé dans le journal' } as const;
const CLOSE           = { field: 'decision', label: 'Décision (par exemple : « rien de contraire aux règles »)' } as const;

function Section({ title, count, empty = 'Rien à traiter.', children }: {
  title: string; count: number; empty?: string; children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-ui text-sm font-bold tracking-[0.2em] uppercase">
        {title} <span className="text-brand-gray/50 font-normal">({count})</span>
      </h3>
      {count === 0
        ? <p className="font-ui text-sm text-brand-gray/50">{empty}</p>
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

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-brand-gray/15 rounded-[2px] p-4 flex flex-col gap-1">
      <p className="font-ui text-xxs tracking-[0.15em] uppercase text-brand-gray/60">{label}</p>
      <p className="font-display text-3xl font-light">{value}</p>
      <p className="font-ui text-xs text-brand-gray/55 leading-relaxed">{detail}</p>
    </div>
  );
}

/** Commande : état, t-shirt, code ; renvoi du code s'il n'a pas servi. */
function OrderCard({ order }: { order: WatchedOrder }) {
  const canResend = order.status === 'paid' && !!order.code && !order.codeUsed;
  return (
    <Card>
      <Line label="Commande">{order.email} · {when(order.createdAt)} · {STATUS_LABELS[order.status] ?? order.status}</Line>
      <Line label="T-shirt">{COLOR_LABELS[order.color] ?? order.color} · {order.size} · {order.printed ? 'imprimé' : 'pas encore imprimé'}</Line>
      {order.code && <Line label="Code d’activation">{order.code} · {order.codeUsed ? 'utilisé' : 'pas encore utilisé'}</Line>}
      {canResend && (
        <div className="flex flex-wrap gap-2">
          <AdminAction label="Renvoyer le code" payload={{ action: 'resend_code', orderId: order.id }} />
        </div>
      )}
    </Card>
  );
}

function MemberCard({ member }: { member: MemberHit }) {
  return (
    <Card>
      <Line label="Porteur">
        <Link href={`/profil/${member.id}`} className="underline underline-offset-4">{member.name ?? 'sans prénom'}</Link>
        {' '}· activé le {when(member.createdAt)}
      </Line>
      <Line label="Email">{member.email ?? '—'}</Line>
      <Line label="État">
        {member.suspended ? 'suspendu' : member.paused ? 'en pause' : 'actif'}
        {member.plan === 'premium' ? ' · premium' : ''}
        {member.shortCode ? ` · QR ${member.shortCode}` : ''}
      </Line>
      <Line label="Notifications">
        {member.pushServices.length > 0
          ? `activées · ${member.pushServices.map((s) => PUSH_SERVICE_LABELS[s]).join(', ')}`
          : 'non activées'}
      </Line>
      {member.phone && (
        <Line label="Téléphone">
          {member.phone.os ? PHONE_LABELS[member.phone.os] : 'pas encore relevé'}
          {member.phone.appInstalledAt ? ` · app installée, première ouverture le ${when(member.phone.appInstalledAt)}` : ''}
        </Line>
      )}
      <div className="flex flex-wrap gap-2">
        {member.suspended
          ? <AdminAction label="Lever la suspension" payload={{ action: 'unsuspend_member', memberId: member.id }} />
          : <AdminAction label="Suspendre le profil" danger payload={{ action: 'suspend_member', memberId: member.id }} ask={MOTIF_TO_MEMBER} />}
      </div>
    </Card>
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

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdmin(user)) notFound();

  const raw = (await searchParams).q;
  const [q, stats, orders, search] = await Promise.all([
    loadModerationQueue(),
    loadFieldStats(),
    loadOrderWatch(),
    searchAdmin(typeof raw === 'string' ? raw : ''),
  ]);
  const notif = stats.notifications;
  const phones = notif.phones;

  return (
    <main className="min-h-screen bg-brand-black text-brand-white px-4 py-16">
      <div className="max-w-2xl mx-auto flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-light">Administration</h1>
          <p className="font-ui text-sm text-brand-gray/60 leading-relaxed">
            Signalements des {QUEUE_WINDOW_DAYS} derniers jours ; marche à suivre : docs/MODERATION.md.
            Menace pour la vie ou la sécurité d&apos;une personne : 17 ou 112, sans attendre.
          </p>
          <nav aria-label="Sections" className="flex flex-wrap gap-x-5 gap-y-1 font-ui text-xs tracking-[0.15em] uppercase">
            {[['#recherche', 'Recherche'], ['#chiffres', 'Chiffres'], ['#a-traiter', 'À traiter'], ['#commandes', 'Commandes'], ['#mesures', 'Mesures en cours'], ['#historique', 'Historique']].map(([href, label]) => (
              <a key={href} href={href} className="underline underline-offset-4 py-2">{label}</a>
            ))}
            <a href="/admin" className="underline underline-offset-4 py-2 text-brand-gray/60">Actualiser</a>
          </nav>
        </header>

        <section id="recherche" className="flex flex-col gap-3 scroll-mt-8">
          <h2 className="font-display text-2xl font-light">Rechercher</h2>
          <form action="/admin#recherche" method="get" className="flex gap-2">
            <input name="q" type="search" defaultValue={search?.query ?? ''} maxLength={100}
              aria-label="Email, prénom, code du QR ou code d’activation"
              placeholder="Email, prénom, code du QR ou d’activation"
              className="flex-1 min-w-0 bg-transparent border border-brand-gray/20 focus:border-brand-white/50 text-brand-white font-ui font-light text-base px-3 outline-none rounded-[2px]"
              style={{ minHeight: '44px' }} />
            <button type="submit" className="px-4 border border-brand-white/30 font-ui text-xxs tracking-[0.15em] uppercase rounded-[1px]" style={{ minHeight: '44px' }}>
              Chercher
            </button>
          </form>
          {search && (search.members.length + search.orders.length === 0
            ? <p className="font-ui text-sm text-brand-gray/50">Aucun résultat pour « {search.query} ».</p>
            : (
              <div className="flex flex-col gap-3">
                {search.members.map((m) => <MemberCard key={m.id} member={m} />)}
                {search.orders.map((o) => <OrderCard key={o.id} order={o} />)}
              </div>
            ))}
        </section>

        <section id="chiffres" className="flex flex-col gap-3 scroll-mt-8">
          <h2 className="font-display text-2xl font-light">Chiffres du test terrain</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Porteurs activés" value={`${stats.wearers}`}
              detail={`dont ${stats.newWearers} ces ${STATS_WINDOW_DAYS} jours · ${stats.paidOrders} commande${stats.paidOrders > 1 ? 's' : ''} payée${stats.paidOrders > 1 ? 's' : ''}`} />
            <Stat label={`Scannés dans leurs ${FIRST_SCAN_DAYS} premiers jours`} value={pct(stats.firstScan.hit, stats.firstScan.eligible)}
              detail={stats.firstScan.eligible === 0
                ? `aucun porteur activé depuis ${FIRST_SCAN_DAYS} jours ou plus`
                : `${stats.firstScan.hit} sur ${stats.firstScan.eligible} porteurs activés il y a ${FIRST_SCAN_DAYS} à ${LOOKBACK_DAYS} jours`} />
            <Stat label="Encore scannés après un mois" value={pct(stats.stillWorn.hit, stats.stillWorn.eligible)}
              detail={stats.stillWorn.eligible === 0
                ? `aucun porteur activé depuis plus de ${STILL_WORN_AFTER_DAYS} jours`
                : `${stats.stillWorn.hit} sur ${stats.stillWorn.eligible}, scannés ces ${RECENT_SCAN_DAYS} derniers jours`} />
            <Stat label="Scans → messages" value={pct(stats.funnel.messages, stats.funnel.scans)}
              detail={`${stats.funnel.messages} messages pour ${stats.funnel.scans} scans, ces ${STATS_WINDOW_DAYS} jours`} />
            <Stat label="Messages → réponses" value={pct(stats.funnel.replied, stats.funnel.messages)}
              detail={`${stats.funnel.replied} conversations où le porteur a répondu`} />
            <Stat label="Abonnés premium" value={`${stats.premium}`}
              detail={`sur ${stats.wearers} porteur${stats.wearers > 1 ? 's' : ''}`} />
          </div>
          <p className="font-ui text-xs text-brand-gray/55 leading-relaxed">
            Achats venus d&apos;un scan : dans PostHog (événement wearer_cta_clicked). Fixer avant le test les seuils
            pour continuer, ajuster ou arrêter.
          </p>

          <h3 className="font-ui text-sm font-bold tracking-[0.2em] uppercase pt-4">Notifications</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Stat label="Porteurs prévenus" value={pct(notif.wearers.notified, stats.wearers)}
              detail={`${notif.wearers.notified} sur ${plural(stats.wearers, 'porteur')} · ${notif.wearers.apple} par Apple, ${notif.wearers.google} par Google`} />
            <Stat label="iPhone : app installée" value={phones ? pct(phones.iphone.installed, phones.iphone.total) : '—'}
              detail={!phones ? PHONES_MISSING : phones.iphone.total === 0
                ? 'aucun porteur sur iPhone pour l’instant'
                : `${phones.iphone.installed} sur ${plural(phones.iphone.total, 'porteur')} sur iPhone · ${phones.iphone.notified} prévenu${phones.iphone.notified > 1 ? 's' : ''}`} />
            <Stat label="Android : prévenus" value={phones ? pct(phones.android.notified, phones.android.total) : '—'}
              detail={!phones ? PHONES_MISSING : phones.android.total === 0
                ? 'aucun porteur sur Android pour l’instant'
                : `${phones.android.notified} sur ${plural(phones.android.total, 'porteur')} sur Android`} />
            <Stat label="Passants qui suivent la réponse" value={pct(notif.followed, stats.funnel.messages)}
              detail={`${notif.followed} sur ${plural(stats.funnel.messages, 'conversation')}, ces ${STATS_WINDOW_DAYS} jours`} />
          </div>
          <p className="font-ui text-xs text-brand-gray/55 leading-relaxed">
            Prévenu : au moins un appareil abonné aux notifications. Téléphone relevé à chaque ouverture de « Mon espace »
            depuis un téléphone ; app installée : ouverte au moins une fois depuis l&apos;écran d&apos;accueil, seule façon
            d&apos;être prévenu sur iPhone. Service lu dans l&apos;abonnement : Apple (iPhone, Mac), Google (Chrome, Android),
            Mozilla (Firefox).
          </p>
        </section>

        <h2 id="a-traiter" className="font-display text-2xl font-light scroll-mt-8">À traiter</h2>

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

        <h2 id="commandes" className="font-display text-2xl font-light scroll-mt-8">Commandes à surveiller</h2>

        <Section title="Payées, pas encore imprimées" count={orders.unprinted.length}>
          <p className="font-ui text-xs text-brand-gray/55 leading-relaxed">
            L&apos;impression part au paiement ; une tâche quotidienne la retente à 5 h (UTC). Au-delà d&apos;un jour,
            vérifier dans Printful et dans Sentry.
          </p>
          {orders.unprinted.map((o) => <OrderCard key={o.id} order={o} />)}
        </Section>

        <Section title={`Codes non utilisés depuis ${NOT_ACTIVATED_AFTER_DAYS} jours`} count={orders.notActivated.length}>
          <p className="font-ui text-xs text-brand-gray/55 leading-relaxed">
            Les relances automatiques sont déjà parties (2e et 7e jour). Renvoyer le code, ou écrire à l&apos;acheteur.
          </p>
          {orders.notActivated.map((o) => <OrderCard key={o.id} order={o} />)}
        </Section>

        <h2 id="mesures" className="font-display text-2xl font-light scroll-mt-8">Mesures en cours</h2>

        <Section title="Profils suspendus" count={q.suspended.length} empty="Aucun.">
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

        <Section title="Appareils bannis" count={q.banned.length} empty="Aucun.">
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

        <h2 id="historique" className="font-display text-2xl font-light scroll-mt-8">Historique</h2>

        <Section title="Dernières décisions" count={q.decisions.length} empty="Aucune décision.">
          <ul className="flex flex-col gap-2">
            {q.decisions.map((d, i) => (
              <li key={i} className="font-ui text-xs text-brand-gray/70 leading-relaxed break-words">
                {when(d.createdAt)} · {DECISION_LABELS[d.action] ?? d.action}
                {typeof d.metadata.motif === 'string' && <> · « {d.metadata.motif} »</>}
                {typeof d.metadata.decision === 'string' && <> · {d.metadata.decision}</>}
                {typeof d.metadata.by === 'string' && <span className="text-brand-gray/55"> · {d.metadata.by}</span>}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </main>
  );
}
