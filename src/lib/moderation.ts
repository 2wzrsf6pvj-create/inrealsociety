// Modération de contenu — OpenAI Moderation API (gratuit) avec fallback regex.
//
// Si OPENAI_API_KEY est défini, on délègue à omni-moderation-latest qui couvre
// 13 catégories (harassment, hate, sexual, self-harm, violence, illicit, etc.)
// en plusieurs langues. Timeout 3s — au pire on retombe sur le regex.
//
// Sans clé, on garde le comportement historique (regex sur liste de mots).

import { CONTACT_EMAIL } from '@/lib/constants';

// Fallback regex — liste haute précision (OpenAI gère le contexte/la nuance).
// Stockés SANS accent : le contenu est dé-accentué (NFD) avant comparaison.
// Volontairement exclus car légitimes dans un contexte de rencontre :
//   retrouver, adresse, suivre, mort, baiser, sexe, cul → délégués à OpenAI.
const BANNED_WORDS = [
  // Insultes FR
  'salope', 'salopard', 'pute', 'putain', 'connard', 'connasse',
  'encule', 'enculer', 'enfoire', 'batard',
  // Slurs FR
  'pede', 'tapette', 'negre', 'bougnoule',
  // Abréviations vulgaires
  'ntm', 'fdp', 'tg',
  // Insultes / slurs EN
  'bitch', 'whore', 'slut', 'cunt', 'fuck', 'fucker', 'faggot', 'nigger',
  // Agression sexuelle
  'viol', 'violer', 'pedophile', 'nique', 'niquer',
  // Violence / menaces
  'tuer', 'tue', 'crever', 'buter', 'egorger', 'menacer', 'kill',
  // Auto-mutilation
  'suicide', 'suicider',
];

// Frontière de mot + pluriel optionnel : bloque « salope(s) », « te suivre »,
// mais plus « technique », « culture », « violet », « râpé », « situer »…
const BANNED_PATTERN = new RegExp(`\\b(?:${BANNED_WORDS.join('|')})s?\\b`);

export interface ModerationResult {
  flagged:    boolean;
  source:     'regex' | 'openai' | 'regex_fallback';
  categories: string[];
}

function regexCheck(content: string): boolean {
  const normalized = content.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return BANNED_PATTERN.test(normalized);
}

export async function moderateContent(content: string): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);

      const res = await fetch('https://api.openai.com/v1/moderations', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ input: content, model: 'omni-moderation-latest' }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data   = await res.json();
        const result = data.results?.[0];
        if (result) {
          const categories = Object.entries(result.categories ?? {})
            .filter(([, v]) => v === true)
            .map(([k]) => k);
          return { flagged: !!result.flagged, source: 'openai', categories };
        }
      } else {
        console.warn('[moderation] OpenAI HTTP', res.status);
      }
    } catch (err) {
      console.warn('[moderation] OpenAI failed, fallback regex:', err);
    }

    return { flagged: regexCheck(content), source: 'regex_fallback', categories: [] };
  }

  return { flagged: regexCheck(content), source: 'regex', categories: [] };
}

// ─── Textes publics du profil ─────────────────────────────────────────────────
// Prénom, présentation et compte Instagram du porteur s'affichent à quiconque
// scanne le t-shirt : même filtre que les messages avant publication (choix de
// Clément). Un texte jugé abusif n'est pas enregistré ; le porteur le modifie.

export type ProfileTextField = 'name' | 'pitch' | 'instagram';

const PROFILE_REFUSAL: Record<ProfileTextField, string> = {
  name:      'Ce prénom n’a pas été enregistré',
  pitch:     'Cette présentation n’a pas été enregistrée',
  instagram: 'Ce compte Instagram n’a pas été enregistré',
};

/** Message au porteur : décision automatique, règle appliquée et recours,
 *  comme le demande le règlement européen sur les services numériques (art. 17). */
export function profileRefusalMessage(field: ProfileTextField): string {
  return `${PROFILE_REFUSAL[field]}\u00a0: notre outil de modération automatique a jugé ce texte contraire à nos règles (CGV, article 9). Modifiez-le\u00a0; en cas d’erreur, écrivez à ${CONTACT_EMAIL}.`;
}

/** Premier champ jugé abusif, dans l'ordre donné, ou null. Les champs absents
 *  ou vides ne sont pas analysés. */
export async function moderateProfileFields(
  fields: Partial<Record<ProfileTextField, string | null | undefined>>,
): Promise<{ field: ProfileTextField; result: ModerationResult } | null> {
  const texts = (Object.entries(fields) as Array<[ProfileTextField, string | null | undefined]>)
    .filter((entry): entry is [ProfileTextField, string] => typeof entry[1] === 'string' && entry[1].trim() !== '');
  const results = await Promise.all(
    texts.map(async ([field, text]) => ({ field, result: await moderateContent(text) })),
  );
  return results.find((r) => r.result.flagged) ?? null;
}
