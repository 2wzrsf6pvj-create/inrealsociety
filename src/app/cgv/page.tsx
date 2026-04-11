import Link from 'next/link';

export const metadata = {
  title: 'Conditions Générales de Vente — In Real Society',
  description: 'Conditions Générales de Vente de la marque In Real Society.',
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
              <span className="font-display text-sm font-light">X</span>
            </div>
            <span className="font-ui text-sm tracking-[0.25em] uppercase text-brand-gray/50">In Real Society</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-light tracking-[0.04em]">
            Conditions Générales de Vente
          </h1>
          <p className="font-ui text-sm text-brand-gray/40 tracking-wide">
            Version en vigueur — Dernière mise à jour : avril 2025
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
            un achat sur le site inrealsociety.com (ci-après &quot;l&apos;Acheteur&quot;).
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Toute commande implique l&apos;acceptation pleine et entière des présentes CGV. Le Vendeur se
            réserve le droit de modifier les CGV à tout moment ; les CGV applicables sont celles en vigueur
            à la date de la commande.
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
            via la technique DTFlex (Direct to Film), sur le modèle Comfort Colors 1717.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Chaque vêtement comporte un QR code unique, crypté et lié au profil personnel de l&apos;Acheteur,
            généré spécifiquement pour sa commande. Ce QR code constitue un élément de personnalisation
            au sens de l&apos;article L221-28 du Code de la consommation.
          </p>
        </section>

        {/* Article 3 — Prix */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 3 — Prix et paiement
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Les prix sont indiqués en euros TTC. Le Vendeur se réserve le droit de modifier ses prix
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
                <span className="text-brand-gray/30 font-ui text-sm md:text-base flex-shrink-0">—</span>
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
            Les commandes sont produites et expédiées via Printful sous 2 à 7 jours ouvrés après
            validation du paiement. Le délai de livraison estimé est de 5 à 10 jours ouvrés selon
            la destination. Ces délais sont indicatifs et ne constituent pas un engagement contractuel.
          </p>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Le Vendeur ne peut être tenu responsable des retards imputables au transporteur ou à
            des événements de force majeure.
          </p>
        </section>

        {/* Article 8 — Données personnelles */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 8 — Données personnelles
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Les données collectées (nom, adresse, email) sont utilisées exclusivement pour le traitement
            de la commande et la livraison. Elles sont transmises à Printful et Stripe dans ce seul
            but. L&apos;Acheteur dispose d&apos;un droit d&apos;accès, de rectification et de suppression de ses
            données conformément au RGPD, en contactant le Vendeur à hello@inrealsociety.com.
          </p>
        </section>

        {/* Article 9 — Droit applicable */}
        <section className="flex flex-col gap-3">
          <h2 className="font-ui text-sm font-bold tracking-[0.2em] uppercase text-brand-white">
            Article 9 — Droit applicable et litiges
          </h2>
          <p className="font-ui text-sm md:text-base font-light text-brand-gray/70 leading-relaxed">
            Les présentes CGV sont soumises au droit français. En cas de litige, une solution amiable
            sera recherchée en priorité. À défaut, les tribunaux français seront seuls compétents.
            L&apos;Acheteur peut également recourir à la plateforme européenne de règlement des litiges
            en ligne : <span className="text-brand-white/70">ec.europa.eu/consumers/odr</span>.
          </p>
        </section>

        {/* Retour */}
        <div className="border-t border-brand-gray/10 pt-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-ui text-sm text-brand-gray/40 tracking-[0.15em] uppercase underline underline-offset-4 hover:text-brand-white transition-colors"
          >
            ← Retour à l&apos;accueil
          </Link>
          <span className="font-ui text-xs text-brand-gray/20 tracking-wide">
            In Real Society © {new Date().getFullYear()}
          </span>
        </div>

      </div>
    </main>
  );
}
