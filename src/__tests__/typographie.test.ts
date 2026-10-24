// Typographie française du texte affiché (choix de Clément) : espace insécable
// avant « ? ! : ; » et dans les guillemets « », entre un nombre et « € » ou
// « % », apostrophe ’, points de suspension …, guillemets français. Sans elle,
// un « ? » ou un « : » partait seul en début de ligne sur téléphone (CGV,
// confidentialité, mentions légales). Corriger : node scripts/typo-fr.mjs.

import { describe, it, expect } from 'vitest';
import { fixText, typoEdits } from '../../scripts/typo-fr.mjs';

describe('texte affiché', () => {
  it('toute l’app suit la typographie française (sinon : node scripts/typo-fr.mjs)', () => {
    const left = typoEdits().flatMap(({ file, edits }) => edits.map((e) => `${file}:${e.line} ${e.raw.trim()}`));
    expect(left).toEqual([]);
  });
});

describe('règles', () => {
  it.each([
    ['Pas encore le moment ?', 'jsx', 'Pas encore le moment&nbsp;?'],
    ['Total : 5 €', 'js', 'Total\\u00a0: 5\\u00a0€'],
    ['« Signaler ce profil »', 'jsx', '«&nbsp;Signaler ce profil&nbsp;»'],
    ['Code d&apos;activation', 'jsx', 'Code d’activation'],
    ["Code d\\'activation", 'js', 'Code d’activation'],
    ['Création du compte...', 'js', 'Création du compte…'],
    ['(ci-après &quot;CGV&quot;)', 'jsx', '(ci-après «&nbsp;CGV&nbsp;»)'],
  ] as const)('%s → %s', (raw, kind, fixed) => {
    expect(fixText(raw, kind)).toBe(fixed);
  });

  it('après une expression : « {prix} € », pas un filtre « %${q}% »', () => {
    expect(fixText('€', 'jsx', { afterExpr: true })).toBe('&nbsp;€');
    expect(fixText(' : ', 'jsx', { afterExpr: true })).toBe('&nbsp;: ');
  });

  it('une deuxième passe ne change rien', () => {
    for (const fixed of ['Total\\u00a0: 5\\u00a0€', '\\u00a0€ le t-shirt', '«&nbsp;déjà&nbsp;»', '49&nbsp;€']) {
      expect(fixText(fixed, fixed.includes('&') ? 'jsx' : 'js', { afterExpr: fixed.startsWith('\\') })).toBe(fixed);
    }
  });
});
