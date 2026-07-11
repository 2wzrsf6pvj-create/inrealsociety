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
  | 'jeu'
  | 'mystere'
  | 'amitie';

export interface Tagline {
  id:       string;          // slug stable, stocké sur orders.tagline_id
  registre: TaglineRegistre;
  text:     string;          // texte imprimé (tel quel)
}

/** Libellés des registres pour l'UI. */
export const REGISTRE_LABELS: Record<TaglineRegistre, string> = {
  'drague':         'Drague / rencontre',
  'message-unique': 'Un seul message',
  'jeu':            'Jeu / léger',
  'mystere':        'Mystère / stylé',
  'amitie':         'Amitié / networking',
};

/**
 * La bibliothèque. `id` est un slug STABLE : ne jamais le réutiliser pour un autre
 * texte (il est figé sur les commandes passées). Corriger un texte = OK (typo) ;
 * changer le SENS = créer un nouvel id.
 */
export const TAGLINES: readonly Tagline[] = [
  // ─── Drague / rencontre — le cœur de l'usage ──────────────────────────────
  { id: 'ecris-sans-connaitre', registre: 'drague', text: 'Écris-moi sans me connaître' },
  { id: 'tu-noseras-pas',       registre: 'drague', text: "Tu n'oseras pas" },
  { id: 'un-message-une-chance',registre: 'drague', text: 'Un message. Une chance.' },
  { id: 'dis-le-tu-verras',     registre: 'drague', text: 'Dis-le, tu verras' },
  { id: 'tas-le-cran',          registre: 'drague', text: "T'as le cran ?" },
  { id: 'ose-cest-anonyme',     registre: 'drague', text: "Ose, c'est anonyme" },
  { id: 'je-ne-saurai-pas',     registre: 'drague', text: 'Je ne saurai pas qui tu es' },
  { id: 'parle-moi-en-scred',   registre: 'drague', text: 'Parle-moi en scred' },

  // ─── Un seul message — met en avant la signature du produit ────────────────
  { id: 'fais-le-compter',      registre: 'message-unique', text: 'Un seul message. Fais-le compter.' },
  { id: 'droit-a-un-message',   registre: 'message-unique', text: "T'as droit à un message" },
  { id: 'un-scan-un-message',   registre: 'message-unique', text: '1 scan = 1 message' },
  { id: 'une-phrase-pas-plus',  registre: 'message-unique', text: 'Une phrase, pas plus' },
  { id: 'choisis-tes-mots',     registre: 'message-unique', text: 'Choisis bien tes mots' },

  // ─── Jeu / léger — déstigmatise, partageable ───────────────────────────────
  { id: 'scanne-on-verra',      registre: 'jeu', text: 'Scanne, on verra' },
  { id: 'surprends-moi',        registre: 'jeu', text: 'Surprends-moi' },
  { id: 'un-truc-a-me-dire',    registre: 'jeu', text: "T'as un truc à me dire ?" },
  { id: 'vas-y-tente',          registre: 'jeu', text: 'Vas-y, tente' },
  { id: 'quest-ce-que-tattends',registre: 'jeu', text: "Qu'est-ce que t'attends ?" },

  // ─── Mystère / stylé — minimaliste ─────────────────────────────────────────
  { id: 'derriere-ce-code',     registre: 'mystere', text: 'Derrière ce code…' },
  { id: 'tu-meurs-de-curiosite',registre: 'mystere', text: 'Tu meurs de curiosité' },
  { id: 'scanne-si-tu-loses',   registre: 'mystere', text: "Scanne si tu l'oses" },
  { id: 'pas-quun-qr',          registre: 'mystere', text: "Ceci n'est pas qu'un QR" },

  // ─── Amitié / networking — au-delà de la drague (festivals, campus) ─────────
  { id: 'on-se-connait-pas',    registre: 'amitie', text: 'On se connaît pas encore' },
  { id: 'fais-le-premier-pas',  registre: 'amitie', text: 'Fais le premier pas' },
  { id: 'nouveau-dans-le-coin', registre: 'amitie', text: 'Nouveau dans le coin ?' },
  { id: 'connecte-sans-appli',  registre: 'amitie', text: 'Connecte, sans appli' },
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

/** Accroches groupées par registre, dans l'ordre d'affichage. */
export function taglinesByRegistre(): Array<{ registre: TaglineRegistre; label: string; items: Tagline[] }> {
  const order: TaglineRegistre[] = ['drague', 'message-unique', 'jeu', 'mystere', 'amitie'];
  return order.map((registre) => ({
    registre,
    label: REGISTRE_LABELS[registre],
    items: TAGLINES.filter((t) => t.registre === registre),
  }));
}
