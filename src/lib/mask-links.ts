// src/lib/mask-links.ts
// Liens écrits par un passant ou un porteur, recopiés dans un email : masqués
// (choix de Clément). Un lien de spammeur, ou d'un domaine sur liste noire,
// partirait sinon sous notre nom et pèserait sur la réputation de tous nos
// emails. Le message complet, lien compris, reste lisible dans la conversation.

export const LINK_PLACEHOLDER = '[lien]';

/** Extensions reconnues sans http ni www : les plus courantes, et celles que
 *  les spammeurs affectionnent. Liste fermée, pour ne pas prendre « Salut.Tu »
 *  (point sans espace) pour un lien. */
const BARE_TLDS = [
  'com', 'net', 'org', 'fr', 'eu', 'be', 'ch', 'de', 'uk', 'es', 'it', 'nl', 'ca', 'us',
  'io', 'co', 'me', 'ly', 'gl', 'gg', 'tv', 'app', 'dev', 'link', 'site', 'online',
  'shop', 'store', 'live', 'info', 'biz', 'xyz', 'top', 'club', 'click', 'vip', 'win',
  'icu', 'pw', 'cc', 'tk', 'ru', 'cn',
];

// Constructeur plutôt que littéral : la cible TS (es5) refuse le lookbehind
// dans un littéral (cf. validators.ts).
const LINK_RE = new RegExp(
  // adresse complète : http(s)://… ou www.…
  String.raw`\b(?:https?:\/\/|www\.)\S+` +
  // domaine nu (instagram.com/x, bit.ly/x), jamais la partie droite d'un email
  String.raw`|(?<![@\w.-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${BARE_TLDS.join('|')})\b(?:\/\S*)?`,
  'gi',
);

export function maskLinks(text: string): string {
  return text.replace(LINK_RE, LINK_PLACEHOLDER);
}
