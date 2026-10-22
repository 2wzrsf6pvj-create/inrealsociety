// Format de prénom d'un passant (scan, message), vérifié côté serveur.

import { describe, it, expect } from 'vitest';
import { isValidFirstName } from '@/lib/validators';

describe('isValidFirstName', () => {
  it.each(['Léa', 'Zoë', 'Jean-Baptiste', 'Anne Marie', "D'Artagnan", 'D’Artagnan', 'Иван', '李'])(
    'accepte « %s »', (name) => {
      expect(isValidFirstName(name)).toBe(true);
    },
  );

  it.each([
    ['', 'vide'],
    ['Léa2', 'chiffre'],
    ['0612345678', 'téléphone'],
    ['https://x.fr', 'lien'],
    ['-Léa', 'commence par un tiret'],
    ['Je sais où tu habites, sale type', 'phrase avec ponctuation'],
    ['A'.repeat(31), 'plus de 30 caractères'],
    ['Léa 👁', 'emoji'],
  ])('refuse « %s » (%s)', (name) => {
    expect(isValidFirstName(name)).toBe(false);
  });
});
