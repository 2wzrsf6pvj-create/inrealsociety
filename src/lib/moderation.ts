// Modération de contenu — OpenAI Moderation API (gratuit) avec fallback regex.
//
// Si OPENAI_API_KEY est défini, on délègue à omni-moderation-latest qui couvre
// 13 catégories (harassment, hate, sexual, self-harm, violence, illicit, etc.)
// en plusieurs langues. Timeout 3s — au pire on retombe sur le regex.
//
// Sans clé, on garde le comportement historique (regex sur liste de mots).

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
