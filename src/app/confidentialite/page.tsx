import ManageConsentButton from './ManageConsentButton';
import { BrandMark } from '@/app/components/ui/BrandMark';

export const metadata = {
  // Le gabarit du layout ajoute « — In Real Society ».
  title: 'Politique de confidentialité',
  description: 'Politique de confidentialité et traitement des données personnelles d’In Real Society.',
  alternates: { canonical: '/confidentialite' },
};

// ⚠️ À COMPLÉTER avant la mise en prod :
//  - Identité complète du responsable de traitement (nom, forme juridique, SIRET, adresse)
//  - Email DPO/contact
//  - Faire valider par un juriste pour la conformité RGPD finale.

export default function ConfidentialitePage() {
  return (
    <main className="relative min-h-screen bg-brand-black text-brand-white px-6 py-16 overflow-hidden">
      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />

      <div className="relative z-10 max-w-2xl mx-auto flex flex-col gap-10">

        <div className="flex flex-col gap-4 border-b border-brand-gray/10 pb-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-brand-white/40 flex items-center justify-center">
              <span className="font-display text-sm font-light"><BrandMark /></span>
            </div>
            <span className="font-ui text-sm tracking-[0.25em] uppercase text-brand-gray/50">In Real Society</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-light tracking-[0.04em]">
            Politique de confidentialité
          </h1>
          <p className="font-ui text-sm text-brand-gray/50 tracking-wide">
            Conforme au RGPD (Règlement UE 2016/679) — Dernière mise à jour&nbsp;: octobre 2026
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            1 — Responsable du traitement
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            In Real Society — [À COMPLÉTER&nbsp;: forme juridique, SIRET, adresse postale].
            Contact pour toute question relative à vos données&nbsp;: <span className="text-brand-white/70">hello@inrealsociety.com</span>.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            2 — Données collectées
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Selon votre interaction avec le service, nous collectons&nbsp;:
          </p>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li><strong>Compte et profil&nbsp;:</strong> email, mot de passe (chiffré), prénom/pseudo, pitch, lien Instagram (optionnel), photo (optionnelle).</li>
            <li><strong>Achat&nbsp;:</strong> email, adresse de livraison, taille et couleur du t-shirt, identifiants Stripe (paiement, abonnement).</li>
            <li><strong>Origine d’un achat&nbsp;:</strong> si vous commandez après avoir vu le profil d’un porteur (le lien vers la boutique depuis ce profil est gardé 30 jours sur votre appareil), ou par un lien de parrainage, ce porteur est noté sur la commande. Il sert à compter les achats venus d’un scan&nbsp;; le parrain, à appliquer la remise.</li>
            <li><strong>Activité&nbsp;:</strong> scans reçus, ville du scan (si le passant l’autorise), messages envoyés et reçus.</li>
            <li><strong>Passant (sans compte)&nbsp;:</strong> votre message et, si vous les laissez, votre prénom et votre contact (email ou @instagram). Un email laissé ne sert qu’après sa confirmation par le lien que nous vous envoyons. Si vous partagez votre ville, la position de votre appareil, arrondie à environ 1 km, sert uniquement à trouver le nom de la ville&nbsp;: seule la ville est conservée.</li>
            <li><strong>Technique&nbsp;:</strong> adresse IP (rate limiting, logs de sécurité), user-agent, identifiants de session.</li>
            <li><strong>Notifications (si vous les activez)&nbsp;:</strong> l’adresse d’abonnement que votre navigateur attribue à votre appareil, et ses clés de chiffrement.</li>
            <li><strong>Téléphone du porteur&nbsp;:</strong> iPhone ou Android, relevé à l’ouverture de «&nbsp;Mon espace&nbsp;» depuis un téléphone, et la date de la première ouverture depuis l’app installée sur l’écran d’accueil. Ils servent à savoir si les notifications parviennent aux porteurs&nbsp;: sur iPhone, seule l’app installée les reçoit.</li>
            <li><strong>Sécurité (côté scanneur)&nbsp;:</strong> un jeton anonyme déposé sur votre appareil (cookie), sans lien avec votre identité, qui permet à un porteur de vous bloquer en cas d’abus.</li>
            <li><strong>Signalements&nbsp;:</strong> le motif d’un signalement de message, de profil ou de conversation et, si vous le laissez, votre contact (un email reçoit l’accusé de réception puis la décision).</li>
            <li><strong>Avis&nbsp;:</strong> ce que vous écrivez dans «&nbsp;Votre avis&nbsp;» depuis «&nbsp;Mon espace&nbsp;», et la note laissée à la fin d’une conversation.</li>
            <li><strong>Analytique (avec consentement)&nbsp;:</strong> pages vues, événements de conversion (PostHog, Cloud EU).</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            3 — Finalités et bases légales
          </h2>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li><strong>Exécution du contrat (art. 6.1.b RGPD)&nbsp;:</strong> création du compte, gestion des commandes (dont la remise d’un parrainage), envoi du t-shirt, gestion de l’abonnement premium, transmission des messages entre passant et porteur, par notification si vous l’activez.</li>
            <li><strong>Intérêt légitime (art. 6.1.f)&nbsp;:</strong> sécurité du service (rate limiting, audit logs, modération), traitement des signalements, blocage des comportements abusifs (anti-harcèlement), prévention de la fraude, vérification que les notifications parviennent aux porteurs (type de téléphone), suivi de l’utilisation du service par l’équipe pour l’améliorer (pour chaque porteur, le nombre de scans, de messages, de réponses et d’achats venus de son profil, jamais le contenu des messages&nbsp;; vos avis).</li>
            <li><strong>Consentement (art. 6.1.a)&nbsp;:</strong> mesure d’audience (PostHog), cookies non essentiels, ville du scan.</li>
            <li><strong>Obligation légale (art. 6.1.c)&nbsp;:</strong> conservation des factures (10 ans).</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            4 — Destinataires et sous-traitants
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Vos données sont traitées par les sous-traitants suivants, tous soumis à des accords de protection des données&nbsp;:
          </p>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li><strong>Le porteur du t-shirt</strong> reçoit le message du passant et, s’il les laisse, son prénom, son contact et la ville du scan.</li>
            <li><strong>L’équipe In Real Society</strong> reçoit les messages, profils et conversations signalés, pour les examiner, ainsi que chaque nouvelle photo de profil.</li>
            <li><strong>Le service de notifications de votre navigateur</strong> (Apple, Google, Mozilla ou Microsoft) achemine les notifications que vous avez activées&nbsp;; leur contenu est chiffré, il ne peut pas le lire.</li>
            <li><strong>Supabase</strong> (UE) — hébergement base de données et authentification.</li>
            <li><strong>Stripe</strong> (Irlande/USA) — traitement des paiements. Décision d’adéquation UE-USA (Data Privacy Framework).</li>
            <li><strong>Resend</strong> (USA) — envoi des emails transactionnels (DPF).</li>
            <li><strong>PostHog Cloud EU</strong> (Allemagne) — mesure d’audience (uniquement si vous consentez).</li>
            <li><strong>OpenAI</strong> (USA) — modération de contenu des messages et des textes du profil&nbsp;: prénom, présentation, compte Instagram (DPF, données non utilisées pour l’entraînement).</li>
            <li><strong>Printful</strong> (Lettonie) — impression et expédition des t-shirts.</li>
            <li><strong>Upstash Redis</strong> (UE) — rate limiting.</li>
            <li><strong>OpenStreetMap</strong> (Fondation OpenStreetMap, Royaume-Uni) — nom de la ville à partir d’une position arrondie à environ 1 km, seulement si le passant partage sa ville.</li>
            <li><strong>Sentry</strong> (USA, optionnel) — détection des erreurs techniques.</li>
            <li><strong>Vercel</strong> (USA) — hébergement de l’application.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            5 — Durées de conservation
          </h2>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li>Compte et profil&nbsp;: tant que le compte est actif. Suppression sur demande.</li>
            <li>Scans et vues&nbsp;: 24 mois. Conversations&nbsp;: 12 mois après le dernier message, ou jusqu’à la suppression du compte si elle intervient avant.</li>
            <li>Données de commande et facturation&nbsp;: 10 ans (obligation comptable).</li>
            <li>Logs techniques (audit, rate limiting)&nbsp;: 12 mois. Traces d’abus et signalements&nbsp;: 24 mois.</li>
            <li>Preuves de consentement et d’exercice de vos droits (acceptation des CGV, déclaration d’âge, consentement marketing, export ou suppression de compte)&nbsp;: 5 ans.</li>
            <li>Jeton d’un appareil bloqué ou banni pour abus&nbsp;: tant que la mesure est en vigueur.</li>
            <li>Abonnement aux notifications&nbsp;: celui d’un passant, 90 jours après son dernier abonnement&nbsp;; celui d’un porteur, jusqu’à sa déconnexion sur cet appareil, la suppression du compte, ou dès que le service de notifications le dit expiré (notifications désactivées, par exemple).</li>
            <li>Téléphone du porteur (iPhone ou Android, première ouverture de l’app)&nbsp;: tant que le compte existe.</li>
            <li>Porteur noté sur une commande venue de son profil&nbsp;: 24 mois, ou jusqu’à la suppression de son compte. Parrain noté sur une commande&nbsp;: avec la commande, ou jusqu’à la suppression de son compte.</li>
            <li>Analytics (PostHog)&nbsp;: 13 mois (recommandation CNIL).</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            6 — Vos droits
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Conformément au RGPD, vous disposez des droits suivants&nbsp;:
          </p>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li><strong>Accès</strong> aux données vous concernant.</li>
            <li><strong>Rectification</strong> des données inexactes.</li>
            <li><strong>Suppression</strong> («&nbsp;droit à l’oubli&nbsp;»).</li>
            <li><strong>Limitation</strong> du traitement.</li>
            <li><strong>Portabilité</strong> de vos données dans un format structuré.</li>
            <li><strong>Opposition</strong> au traitement basé sur l’intérêt légitime.</li>
            <li><strong>Retrait du consentement</strong> à tout moment (cookies analytics).</li>
          </ul>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Pour exercer ces droits&nbsp;: <span className="text-brand-white/70">hello@inrealsociety.com</span>.
            Vous pouvez aussi adresser une réclamation à la <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener" className="underline underline-offset-4 hover:text-brand-white">CNIL</a>.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            7 — Cookies
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Nous utilisons deux catégories de cookies&nbsp;:
          </p>
          <ul className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed list-disc pl-5 flex flex-col gap-2">
            <li><strong>Essentiels</strong> (toujours actifs)&nbsp;: authentification Supabase, consentement, jeton de sécurité anti-harcèlement (côté scanneur).</li>
            <li><strong>Mesure d’audience</strong> (consentement requis)&nbsp;: PostHog Cloud EU pour comprendre comment le site est utilisé. Vous pouvez accepter ou refuser via le bandeau affiché à votre première visite, et{' '}<ManageConsentButton /> à tout moment.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            8 — Sécurité
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Nous mettons en œuvre des mesures techniques et organisationnelles appropriées&nbsp;:
            chiffrement TLS en transit, RLS (Row-Level Security) sur la base de données,
            rate limiting, modération automatique, audit logs des actions sensibles, séparation
            des secrets et des données utilisateurs.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            9 — Mineurs
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Le service est réservé aux personnes de 18 ans ou plus&nbsp;: le porteur le déclare à l’activation
            de son profil, la personne qui écrit le confirme en envoyant son message. Nous ne collectons pas
            sciemment de données concernant des mineurs. Si vous pensez qu’un mineur utilise le service,
            écrivez à <span className="text-brand-white/70">hello@inrealsociety.com</span> : nous supprimerons
            les données concernées.
          </p>
        </section>

        <div className="flex flex-col gap-2 pt-6 border-t border-brand-gray/10">
          <p className="font-ui text-xs text-brand-gray/55 tracking-wide">
            Cette politique peut être mise à jour. La date en haut de page indique la version en vigueur.
          </p>
        </div>

      </div>
    </main>
  );
}
