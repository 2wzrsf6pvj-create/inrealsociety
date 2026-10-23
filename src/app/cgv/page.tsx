import Link from 'next/link';
import { BrandMark } from '@/app/components/ui/BrandMark';
import { CONTACT_EMAIL, PREMIUM_PERKS, PREMIUM_PRICE_LABEL, PREMIUM_WITHDRAWAL_DAYS, SHIPPING_COUNTRIES_LABEL, VAT_EXEMPT, VAT_EXEMPT_NOTICE } from '@/lib/constants';

export const metadata = {
  // Le gabarit du layout ajoute « — In Real Society ».
  title: 'Conditions Générales de Vente',
  description: 'Conditions Générales de Vente de la marque In Real Society.',
  alternates: { canonical: '/cgv' },
};

export default function CGVPage() {
  return (
    <main className="relative min-h-screen bg-brand-black text-brand-white px-6 py-16 overflow-hidden">

      <div className="absolute top-[-15%] left-[-15%] w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }} />

      <div className="relative z-10 max-w-2xl mx-auto flex flex-col gap-10">

        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-brand-gray/10 pb-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-brand-white/40 flex items-center justify-center">
              <span className="font-display text-sm font-light"><BrandMark /></span>
            </div>
            <span className="font-ui text-sm tracking-[0.25em] uppercase text-brand-gray/50">In Real Society</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-light tracking-[0.04em]">
            Conditions Générales de Vente
          </h1>
          <p className="font-ui text-sm text-brand-gray/50 tracking-wide">
            Version en vigueur — Dernière mise à jour : octobre 2026
          </p>
        </div>

        {/* Article 1 */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 1 — Objet et champ d&apos;application
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Les présentes Conditions Générales de Vente (ci-après &quot;CGV&quot;) régissent l&apos;ensemble des ventes
            conclues entre In Real Society (ci-après &quot;le Vendeur&quot;) et toute personne physique effectuant
            un achat sur le site inrealsociety.com (ci-après &quot;l&apos;Acheteur&quot;), y compris
            l&apos;abonnement premium proposé aux porteurs (article 8).
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Toute commande implique l&apos;acceptation pleine et entière des présentes CGV. Le Vendeur se
            réserve le droit de modifier les CGV à tout moment ; les CGV applicables sont celles en vigueur
            à la date de la commande.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            <strong className="text-brand-white/80">Âge minimum.</strong> Le service de profil et de messagerie
            associé au t-shirt est réservé aux personnes âgées de 18 ans ou plus. En activant son profil, le
            porteur déclare être majeur ; toute personne qui envoie un message à un porteur déclare également
            avoir 18 ans ou plus. Le Vendeur peut suspendre un profil ou bloquer un appareil lorsqu&apos;il
            apparaît que cette condition n&apos;est pas remplie.
          </p>
        </section>

        {/* Article 2 */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 2 — Produits
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            In Real Society commercialise des vêtements (t-shirts, sweats) fabriqués à la demande et
            personnalisés. Chaque article est imprimé individuellement après validation du paiement,
            via la technique DTFlex (Direct to Film), sur le modèle Stanley/Stella Creator 2.0 (coton bio).
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Chaque vêtement comporte un QR code unique, crypté, généré spécifiquement pour la commande de
            l&apos;Acheteur. Ce QR code se lie au profil personnel de l&apos;Acheteur lorsque ce dernier active
            son profil ; tant que l&apos;Acheteur n&apos;a pas créé son profil, le QR code renvoie vers une page
            indiquant que le profil n&apos;est pas encore activé. Qu&apos;il soit activé ou non, ce QR code,
            unique et généré pour la commande, constitue un élément de personnalisation au sens de
            l&apos;article L221-28 du Code de la consommation.
          </p>
        </section>

        {/* Article 3 — Prix */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 3 — Prix et paiement
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            {VAT_EXEMPT ? `Les prix sont indiqués en euros. ${VAT_EXEMPT_NOTICE}.` : 'Les prix sont indiqués en euros TTC.'}
            {' '}Le Vendeur se réserve le droit de modifier ses prix
            à tout moment, étant entendu que le prix applicable est celui en vigueur au moment de la
            commande.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Le paiement s&apos;effectue en ligne, de manière sécurisée, via Stripe. Les données bancaires
            de l&apos;Acheteur ne sont jamais stockées par le Vendeur.
          </p>
        </section>

        {/* Article 4 — Commande */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 4 — Processus de commande
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            La commande est ferme et définitive dès validation du paiement. L&apos;Acheteur reçoit une
            confirmation par email. La production est lancée immédiatement après validation, ce qui
            rend toute annulation impossible une fois le paiement effectué.
          </p>
        </section>

        {/* Article 5 — CLAUSE PRINCIPALE : droit de rétractation */}
        <section className="flex flex-col gap-4 border border-brand-white/10 rounded-[2px] p-6 bg-[#080808]">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 5 — Droit de rétractation et politique de retour
          </h2>

          <div className="flex items-start gap-3">
            <div className="w-px self-stretch bg-brand-white/20 flex-shrink-0 mt-1" />
            <p className="font-ui text-sm md:text-base font-light text-brand-white/90 leading-relaxed">
              Conformément à l&apos;article L221-28 du Code de la consommation, le droit de rétractation
              ne peut être exercé pour les contrats de fourniture de biens confectionnés selon les
              spécifications du consommateur ou nettement personnalisés.
            </p>
          </div>

          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Chaque vêtement &quot;In Real Society&quot; étant imprimé sur commande avec un QR code crypté et
            unique lié au profil personnel de l&apos;Acheteur, <span className="text-brand-white/90 font-normal">aucune commande ne pourra être annulée,
            retournée ou remboursée pour cause de changement d&apos;avis ou d&apos;erreur de taille de la
            part de l&apos;Acheteur.</span>
          </p>

          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            En acceptant les présentes CGV, l&apos;Acheteur reconnaît expressément avoir été informé de
            cette exception au droit de rétractation préalablement à la passation de sa commande,
            conformément aux articles L221-5 et L221-28 du Code de la consommation.
          </p>

          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Cette exception concerne les vêtements. L&apos;abonnement premium, lui, ouvre droit à
            rétractation dans les conditions de l&apos;article 8.
          </p>
        </section>

        {/* Article 6 — Exceptions */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 6 — Exceptions : défaut et non-conformité
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Seuls les cas suivants ouvrent droit à un remboursement ou remplacement, conformément
            aux articles L217-4 et suivants du Code de la consommation :
          </p>
          <ul className="flex flex-col gap-2 pl-4">
            {[
              'Produit reçu endommagé ou défectueux',
              'Produit non conforme à la commande (erreur d\'impression, mauvaise couleur)',
              'Colis perdu ou non livré dans un délai de 30 jours ouvrés',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-brand-gray/55 font-ui text-sm md:text-base flex-shrink-0">—</span>
                <span className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Dans ces cas, l&apos;Acheteur dispose de 14 jours à compter de la réception pour contacter
            le Vendeur à l&apos;adresse <span className="text-brand-white/70">hello@inrealsociety.com</span> avec
            photos à l&apos;appui.
          </p>
        </section>

        {/* Article 7 — Livraison */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 7 — Livraison
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Les commandes sont livrées en {SHIPPING_COUNTRIES_LABEL}. Chaque article étant
            fabriqué à la demande via Printful, le délai se décompose en deux
            temps : <span className="text-brand-white/80">production sous 2 à 5 jours ouvrés</span> après
            validation du paiement, puis <span className="text-brand-white/80">expédition de 5 à 10 jours
            ouvrés</span> selon la destination. Comptez donc
            généralement 1 à 3 semaines au total. Ces délais sont indicatifs et ne constituent pas
            un engagement contractuel.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Le Vendeur ne peut être tenu responsable des retards imputables au transporteur ou à
            des événements de force majeure.
          </p>
        </section>

        {/* Article 8 — Abonnement premium. Rétractation : remboursement intégral
            sous 14 jours, sans demande d'exécution immédiate (choix de Clément) ;
            infos précontractuelles L221-5, formulaire type (annexe à R221-1). */}
        <section id="premium" className="flex flex-col gap-3 scroll-mt-8">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 8 — Abonnement premium
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Le porteur peut souscrire, depuis son tableau de bord, un abonnement premium à{' '}
            <span className="text-brand-white/80">{PREMIUM_PRICE_LABEL}{VAT_EXEMPT ? '' : ' TTC'} par mois</span>. Il donne accès à :
          </p>
          <ul className="flex flex-col gap-2 pl-4">
            {PREMIUM_PERKS.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-brand-gray/55 font-ui text-sm md:text-base flex-shrink-0">—</span>
                <span className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            <strong className="text-brand-white/80">Durée et paiement.</strong> L&apos;abonnement est mensuel et
            sans engagement. Il est payé d&apos;avance par carte, via Stripe, et se renouvelle automatiquement
            chaque mois, à la date anniversaire de la souscription, jusqu&apos;à sa résiliation. Le porteur
            accepte les présentes CGV avant de payer ; un email confirme ensuite la souscription et reprend
            ces conditions.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            <strong className="text-brand-white/80">Résiliation.</strong> Le porteur peut résilier à tout moment,
            en ligne, depuis son tableau de bord (Réglages, «&nbsp;Gérer ou résilier mon abonnement&nbsp;»). La résiliation
            prend effet à la fin du mois déjà payé : le premium reste actif jusque-là et aucun autre prélèvement
            n&apos;a lieu. Un email confirme la résiliation et sa date d&apos;effet. La suppression du compte
            résilie l&apos;abonnement immédiatement.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            <strong className="text-brand-white/80">Droit de rétractation.</strong> Le porteur dispose de{' '}
            {PREMIUM_WITHDRAWAL_DAYS} jours à compter de la souscription pour se rétracter, sans avoir à se
            justifier. Le premium démarre dès la souscription ; en cas de rétractation dans ce délai, le
            paiement est <span className="text-brand-white/80">remboursé en totalité</span>, par le moyen de
            paiement utilisé, au plus tard 14 jours après la réception de la demande, et l&apos;abonnement
            prend fin. Pour se rétracter, il suffit d&apos;écrire à {CONTACT_EMAIL}, par exemple avec le
            formulaire ci-dessous.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            <strong className="text-brand-white/80">Échec de paiement.</strong> Si un renouvellement échoue,
            Stripe présente de nouveau le paiement pendant quelques jours et le premium reste actif. Sans
            paiement à l&apos;issue de ces tentatives, le profil repasse en formule gratuite ; ses scans et ses
            conversations sont conservés.
          </p>
          <div className="border border-brand-white/10 rounded-[2px] p-4 bg-[#080808] flex flex-col gap-2">
            <p className="font-ui text-xs font-bold tracking-[0.15em] uppercase text-brand-white/70">
              Formulaire de rétractation
            </p>
            <p className="font-ui text-xs md:text-sm font-light text-brand-gray/70 leading-relaxed">
              (Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous
              rétracter du contrat.)
              <br />À l&apos;attention de In Real Society, {CONTACT_EMAIL} (adresse postale : voir les{' '}
              <Link href="/mentions-legales" className="underline underline-offset-4 hover:text-brand-white transition-colors">
                mentions légales
              </Link>) :
              <br />Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de
              services ci-dessous : abonnement premium In Real Society.
              <br />Souscrit le :
              <br />Nom du consommateur :
              <br />Adresse du consommateur :
              <br />Signature du consommateur (uniquement en cas de notification du présent formulaire sur
              papier) :
              <br />Date :
            </p>
          </div>
        </section>

        {/* Article 9 — Modération (règlement européen sur les services numériques, art. 14) */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 9 — Modération et signalements
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Les messages, prénoms et contacts laissés par les personnes qui écrivent aux porteurs sont
            analysés automatiquement avant transmission (outil de modération d&apos;OpenAI et règles
            internes). Un contenu jugé abusif (menaces, harcèlement, insultes, contenus sexuels ou
            haineux) n&apos;est pas transmis.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Un porteur peut signaler un message reçu : le message est aussitôt masqué et l&apos;équipe est
            prévenue. L&apos;appareil à l&apos;origine de messages signalés par trois porteurs différents ne peut
            plus écrire sur la plateforme. Un porteur peut aussi bloquer la personne qui lui écrit.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Toute personne, même sans compte, peut signaler un profil depuis la page de ce profil
            (« Signaler ce profil ») ou en écrivant à hello@inrealsociety.com. L&apos;équipe examine chaque
            signalement et peut suspendre un profil ou bloquer un appareil contraire aux présentes
            conditions ou à la loi. Une décision de modération peut être contestée à la même adresse.
          </p>
        </section>

        {/* Article 10 — Données personnelles */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 10 — Données personnelles
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Les données nécessaires à la commande (nom, adresse, email) sont transmises à Printful et
            Stripe pour la fabrication, la livraison et le paiement. L&apos;ensemble des traitements (profil,
            scans, messages) et les droits de chacun sont décrits dans la{' '}
            <Link href="/confidentialite" className="underline underline-offset-4 hover:text-brand-white">
              politique de confidentialité
            </Link>. Pour exercer ces droits : hello@inrealsociety.com.
          </p>
        </section>

        {/* Article 11 — Droit applicable */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 11 — Droit applicable et litiges
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Les présentes CGV sont soumises au droit français. En cas de litige, une solution amiable
            sera recherchée en priorité. À défaut, les tribunaux français seront seuls compétents.
            L&apos;Acheteur peut également recourir à la plateforme européenne de règlement des litiges
            en ligne : <span className="text-brand-white/70">ec.europa.eu/consumers/odr</span>.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Conformément aux articles L611-1 à L616-3 du Code de la consommation, l&apos;Acheteur peut
            également faire appel au médiateur de la consommation indiqué dans nos{' '}
            <Link href="/mentions-legales" className="underline underline-offset-4 hover:text-brand-white transition-colors">
              mentions légales
            </Link>.
          </p>
        </section>

        {/* Retour */}
        <div className="border-t border-brand-gray/10 pt-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-ui text-sm text-brand-gray/50 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white transition-colors"
          >
            ← Retour à l&apos;accueil
          </Link>
          <span className="font-ui text-xs text-brand-gray/50 tracking-wide">
            In Real Society © {new Date().getFullYear()}
          </span>
        </div>

      </div>
    </main>
  );
}
