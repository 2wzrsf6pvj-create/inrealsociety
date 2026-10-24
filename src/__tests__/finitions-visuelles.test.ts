// Finitions visuelles (choix de Clément, après une revue du visuel) :
// - bandeau des cookies : « Refuser » au même niveau qu'« Accepter » (CNIL) ;
// - chiffres alignés en Cormorant : son « 1 » à l'ancienne se lisait « I »
//   (« I conversation » dans « Mon espace ») ;
// - les boutons du haut (« Connexion », « plein soleil ») restent en haut de la
//   page au lieu de passer sur le contenu qui défile ; pas de « Connexion » sur
//   le profil d'un porteur, que lit le passant.
// À l'écran, sur 360 px de large : e2e/public-pages.spec.ts (« Petits écrans »).

import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import ConsentBanner from '@/app/components/ConsentBanner';
import { isHiddenPath } from '@/app/components/ui/AuthIndicator';
import config from '../../tailwind.config';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

describe('bandeau des cookies', () => {
  it('« Refuser » et « Accepter » ont exactement le même style', () => {
    const html = renderToStaticMarkup(createElement(ConsentBanner));
    const buttons = [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>(Refuser|Accepter)<\/button>/g)];
    expect(buttons.map((b) => b[2])).toEqual(['Refuser', 'Accepter']);
    expect(buttons[0][1]).toBe(buttons[1][1]);
  });
});

describe('chiffres en Cormorant', () => {
  it('alignés : le « 1 » ne se lit plus « I »', () => {
    expect(config.theme?.extend?.fontFamily).toMatchObject({
      display: [['var(--font-display)', 'Georgia', 'serif'], { fontFeatureSettings: '"lnum"' }],
    });
  });
});

describe('boutons du haut', () => {
  it('pas de « Connexion » sur les pages du passant, profil du porteur compris', () => {
    for (const p of ['/profil/123', '/message', '/unlock']) expect(isHiddenPath(p)).toBe(true);
    for (const p of ['/', '/shop', '/faq', '/conversation/abc']) expect(isHiddenPath(p)).toBe(false);
  });

  it('« Connexion » et « plein soleil » restent en haut de la page, sans la suivre', () => {
    for (const file of ['app/components/ui/AuthIndicator.tsx', 'app/components/ui/SunToggle.tsx']) {
      const source = read(file);
      expect(source).not.toMatch(/className="fixed top-4/);
      expect(source).toMatch(/className="absolute top-4/);
    }
  });
});
