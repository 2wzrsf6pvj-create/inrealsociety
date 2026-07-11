// src/lib/taglines.ts
// Bibliothèque d'accroches imprimées SOUS le QR au dos du t-shirt.
//
// But produit : donner une RAISON de scanner, pas juste l'ordre. Un QR nu est une
// instruction ; une accroche est un hameçon. C'est le meilleur axe de personnalisation
// dont on dispose — sur la surface la plus vue (le dos, à distance), et sûr : le client
// CHOISIT dans cette liste, il n'écrit jamais de texte libre (aucune modération, aucun
// risque juridique sur un objet physique qu'on ne peut pas rappeler).
//
// SOURCE DE VÉRITÉ partagée : l'UI (picker), la validation serveur et le fulfillment
// importent tous cette liste. Les TRACÉS vectoriels de chaque accroche sont pré-cuits
// hors-ligne (scripts/bake-taglines.mts → taglines.generated.ts) : à l'impression, aucune
// dépendance à une police (même leçon que le monogramme).
//
// ⚠️ Contrainte de lisibilité : imprimé grand sur un dos, plus c'est court mieux c'est.
// Les accroches longues sont réduites automatiquement à la composition — mais viser court.

export type TaglineRegistre =
  | 'drague'
  | 'message-unique'
  | 'ephemere'
  | 'jeu'
  | 'mystere'
  | 'amitie';

/**
 * Langue de l'accroche IMPRIMÉE. L'accroche est lue par l'inconnu physiquement à côté
 * du porteur → sa langue doit être celle de là où le tee est porté. L'anglais couvre
 * les voyageurs, les scanneurs étrangers ET le style (l'anglais sur un vêtement, en
 * France, est un choix assumé). L'UI de sélection, elle, reste en français.
 */
export type TaglineLang = 'fr' | 'en';

export interface Tagline {
  id:       string;          // slug stable, stocké sur orders.tagline_id
  lang:     TaglineLang;     // langue du texte imprimé
  registre: TaglineRegistre;
  text:     string;          // texte imprimé (tel quel)
}

/** Libellés des registres pour l'UI (français — c'est le porteur qui choisit). */
export const REGISTRE_LABELS: Record<TaglineRegistre, string> = {
  'drague':         'Drague / rencontre',
  'message-unique': 'Un seul message',
  'ephemere':       'Éphémère',
  'jeu':            'Jeu / léger',
  'mystere':        'Mystère / stylé',
  'amitie':         'Amitié / networking',
};

/** Langues proposées + libellé du toggle. */
export const TAGLINE_LANGS: readonly TaglineLang[] = ['fr', 'en'];
export const TAGLINE_LANG_LABELS: Record<TaglineLang, string> = { fr: 'FR', en: 'EN' };

/**
 * La bibliothèque. `id` est un slug STABLE : ne jamais le réutiliser pour un autre
 * texte (il est figé sur les commandes passées). Corriger un texte = OK (typo) ;
 * changer le SENS = créer un nouvel id.
 */
export const TAGLINES: readonly Tagline[] = [
  // ══════════════════════ FRANÇAIS ══════════════════════════════════════════
  // ─── Drague / rencontre — le cœur, élégant-invitational ───────────────────
  { id: 'un-message-une-chance', lang: 'fr', registre: 'drague', text: 'Un message. Une chance.' },
  { id: 'ecris-sans-connaitre',  lang: 'fr', registre: 'drague', text: 'Écris-moi sans me connaître' },
  { id: 'premier-mot-a-toi',     lang: 'fr', registre: 'drague', text: 'Le premier mot est à toi' },
  { id: 'dis-ce-que-tu-noses',   lang: 'fr', registre: 'drague', text: "Dis-moi ce que tu n'oses pas dire" },

  // ─── Un seul message — la signature du produit ─────────────────────────────
  { id: 'une-phrase-pas-plus',   lang: 'fr', registre: 'message-unique', text: 'Une phrase, pas plus' },
  { id: 'fais-le-compter',       lang: 'fr', registre: 'message-unique', text: 'Un seul message. Fais-le compter.' },

  // ─── Éphémère ──────────────────────────────────────────────────────────────
  { id: 'scanne-ecris-oublie',   lang: 'fr', registre: 'ephemere', text: 'Scanne. Écris. Oublie.' },
  { id: 'rien-ne-reste',         lang: 'fr', registre: 'ephemere', text: 'Rien ne reste. Tout commence.' },
  { id: 'dis-le-ca-sefface',     lang: 'fr', registre: 'ephemere', text: "Dis-le, ça s'efface." },

  // ─── Jeu / léger — provoc' assumée ─────────────────────────────────────────
  { id: 'surprends-moi',         lang: 'fr', registre: 'jeu', text: 'Surprends-moi' },
  { id: 'scanne-on-verra',       lang: 'fr', registre: 'jeu', text: 'Scanne, on verra' },
  { id: 'tas-le-cran',           lang: 'fr', registre: 'jeu', text: "T'as le cran ?" },
  { id: 'ose-cest-anonyme',      lang: 'fr', registre: 'jeu', text: "Ose, c'est anonyme" },

  // ─── Mystère / stylé — minimaliste ─────────────────────────────────────────
  { id: 'pas-quun-qr',           lang: 'fr', registre: 'mystere', text: "Ceci n'est pas qu'un QR" },
  { id: 'derriere-ce-code',      lang: 'fr', registre: 'mystere', text: 'Derrière ce code…' },
  { id: 'tu-me-connais-pas',     lang: 'fr', registre: 'mystere', text: 'Tu ne me connais pas encore' },

  // ─── Amitié / networking ───────────────────────────────────────────────────
  { id: 'on-se-connait-pas',     lang: 'fr', registre: 'amitie', text: 'On se connaît pas encore' },
  { id: 'nouveau-dans-le-coin',  lang: 'fr', registre: 'amitie', text: 'Nouveau dans le coin ?' },
  { id: 'sans-appli-sans-filtre',lang: 'fr', registre: 'amitie', text: 'Sans appli, sans filtre' },

  // ══════════════════════ ENGLISH ═══════════════════════════════════════════
  // Même voix « élégant-mais-culotté ». Adaptations, pas des traductions littérales.
  // ─── Flirt / encounter ─────────────────────────────────────────────────────
  { id: 'en-one-message-one-shot',   lang: 'en', registre: 'drague', text: 'One message. One shot.' },
  { id: 'en-message-a-stranger',     lang: 'en', registre: 'drague', text: "Message me. We've never met." },
  { id: 'en-first-word-is-yours',    lang: 'en', registre: 'drague', text: 'The first word is yours.' },
  { id: 'en-say-what-you-wouldnt',   lang: 'en', registre: 'drague', text: "Say what you wouldn't dare." },

  // ─── One message ───────────────────────────────────────────────────────────
  { id: 'en-one-line-thats-all',     lang: 'en', registre: 'message-unique', text: "One line. That's all." },
  { id: 'en-make-it-count',          lang: 'en', registre: 'message-unique', text: 'One message. Make it count.' },

  // ─── Ephemeral ─────────────────────────────────────────────────────────────
  { id: 'en-scan-write-forget',      lang: 'en', registre: 'ephemere', text: 'Scan. Write. Forget.' },
  { id: 'en-nothing-stays',          lang: 'en', registre: 'ephemere', text: 'Nothing stays. Everything starts.' },
  { id: 'en-say-it-disappears',      lang: 'en', registre: 'ephemere', text: 'Say it. It disappears.' },

  // ─── Playful ───────────────────────────────────────────────────────────────
  { id: 'en-surprise-me',            lang: 'en', registre: 'jeu', text: 'Surprise me.' },
  { id: 'en-scan-lets-see',          lang: 'en', registre: 'jeu', text: "Scan. Let's see." },
  { id: 'en-got-the-nerve',          lang: 'en', registre: 'jeu', text: 'Got the nerve?' },
  { id: 'en-go-on-anonymous',        lang: 'en', registre: 'jeu', text: "Go on — it's anonymous." },

  // ─── Mystery / stylish ─────────────────────────────────────────────────────
  { id: 'en-not-just-a-qr',          lang: 'en', registre: 'mystere', text: 'This is not just a QR.' },
  { id: 'en-behind-this-code',       lang: 'en', registre: 'mystere', text: 'Behind this code…' },
  { id: 'en-you-dont-know-me',       lang: 'en', registre: 'mystere', text: "You don't know me yet." },

  // ─── Friends / networking ──────────────────────────────────────────────────
  { id: 'en-new-around-here',        lang: 'en', registre: 'amitie', text: 'New around here?' },
  { id: 'en-no-app-no-filter',       lang: 'en', registre: 'amitie', text: 'No app. No filter.' },
];

/** Valeur stockée quand le client ne veut AUCUNE accroche (QR seul). */
export const TAGLINE_NONE = null;

const BY_ID = new Map(TAGLINES.map((t) => [t.id, t]));

/** Un id de bibliothèque valide ? (whitelist serveur — jamais de texte arbitraire.) */
export function isValidTaglineId(id: string): boolean {
  return BY_ID.has(id);
}

export function getTagline(id: string | null | undefined): Tagline | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** Accroches d'UNE langue, groupées par registre, dans l'ordre d'affichage.
 *  Les registres sans accroche pour cette langue sont omis. */
export function taglinesByRegistre(lang: TaglineLang): Array<{ registre: TaglineRegistre; label: string; items: Tagline[] }> {
  const order: TaglineRegistre[] = ['drague', 'message-unique', 'ephemere', 'jeu', 'mystere', 'amitie'];
  return order
    .map((registre) => ({
      registre,
      label: REGISTRE_LABELS[registre],
      items: TAGLINES.filter((t) => t.registre === registre && t.lang === lang),
    }))
    .filter((g) => g.items.length > 0);
}
