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

export interface Tagline {
  id:       string;          // slug stable, stocké sur orders.tagline_id
  registre: TaglineRegistre;
  text:     string;          // texte imprimé (tel quel)
}

/** Libellés des registres pour l'UI. */
export const REGISTRE_LABELS: Record<TaglineRegistre, string> = {
  'drague':         'Drague / rencontre',
  'message-unique': 'Un seul message',
  'ephemere':       'Éphémère',
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
  // ─── Drague / rencontre — le cœur, élégant-invitational ───────────────────
  { id: 'un-message-une-chance',registre: 'drague', text: 'Un message. Une chance.' },
  { id: 'ecris-sans-connaitre', registre: 'drague', text: 'Écris-moi sans me connaître' },
  { id: 'premier-mot-a-toi',    registre: 'drague', text: 'Le premier mot est à toi' },
  { id: 'dis-ce-que-tu-noses',  registre: 'drague', text: "Dis-moi ce que tu n'oses pas dire" },

  // ─── Un seul message — la signature du produit ─────────────────────────────
  { id: 'une-phrase-pas-plus',  registre: 'message-unique', text: 'Une phrase, pas plus' },
  { id: 'fais-le-compter',      registre: 'message-unique', text: 'Un seul message. Fais-le compter.' },

  // ─── Éphémère — la moitié du positionnement qui manquait ───────────────────
  { id: 'scanne-ecris-oublie',  registre: 'ephemere', text: 'Scanne. Écris. Oublie.' },
  { id: 'rien-ne-reste',        registre: 'ephemere', text: 'Rien ne reste. Tout commence.' },
  { id: 'dis-le-ca-sefface',    registre: 'ephemere', text: "Dis-le, ça s'efface." },

  // ─── Jeu / léger — provoc' assumée (les 2 dares gardés vivent ici) ─────────
  { id: 'surprends-moi',        registre: 'jeu', text: 'Surprends-moi' },
  { id: 'scanne-on-verra',      registre: 'jeu', text: 'Scanne, on verra' },
  { id: 'tas-le-cran',          registre: 'jeu', text: "T'as le cran ?" },
  { id: 'ose-cest-anonyme',     registre: 'jeu', text: "Ose, c'est anonyme" },

  // ─── Mystère / stylé — minimaliste ─────────────────────────────────────────
  { id: 'pas-quun-qr',          registre: 'mystere', text: "Ceci n'est pas qu'un QR" },
  { id: 'derriere-ce-code',     registre: 'mystere', text: 'Derrière ce code…' },
  { id: 'tu-me-connais-pas',    registre: 'mystere', text: 'Tu ne me connais pas encore' },

  // ─── Amitié / networking — au-delà de la drague (festivals, campus) ─────────
  { id: 'on-se-connait-pas',    registre: 'amitie', text: 'On se connaît pas encore' },
  { id: 'nouveau-dans-le-coin', registre: 'amitie', text: 'Nouveau dans le coin ?' },
  { id: 'sans-appli-sans-filtre',registre: 'amitie', text: 'Sans appli, sans filtre' },
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
  const order: TaglineRegistre[] = ['drague', 'message-unique', 'ephemere', 'jeu', 'mystere', 'amitie'];
  return order.map((registre) => ({
    registre,
    label: REGISTRE_LABELS[registre],
    items: TAGLINES.filter((t) => t.registre === registre),
  }));
}
