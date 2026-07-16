'use client';

// Sélecteur d'ACCROCHE imprimée sous le QR, partagé boutique (achat) et activation.
// Le client choisit dans une bibliothèque FERMÉE (jamais de texte libre).
//
// Deux niveaux, VISUELLEMENT DISTINCTS pour qu'on sache ce qui est quoi :
//  - niveau 1 = la CATÉGORIE → onglets soulignés (navigation, pas un choix) ;
//  - niveau 2 = le CHOIX → puces bordées (« QR seul » + les accroches).
// L'aperçu du dos vit à côté (composant TaglinePreview), pas ici — on ne montre que le CHOIX.

import { useState } from 'react';
import {
  taglinesByRegistre, getTagline, TAGLINES,
  TAGLINE_LANGS, TAGLINE_LANG_LABELS,
  type TaglineRegistre, type TaglineLang,
} from '@/lib/taglines';

type TeeColor = 'dark' | 'light';

// Libellés COURTS pour les onglets (les longs débordent sur mobile).
const SHORT: Record<TaglineRegistre, string> = {
  'drague':         'Drague',
  'message-unique': 'Message',
  'ephemere':       'Éphémère',
  'jeu':            'Jeu',
  'mystere':        'Mystère',
  'amitie':         'Amitié',
};

export default function TaglinePicker({ value, onChange, tshirtColor }: {
  value: string | null;
  onChange: (id: string | null) => void;
  tshirtColor?: TeeColor;
}) {
  const current = getTagline(value);
  // Langue de l'accroche IMPRIMÉE. Ouvre sur la langue de la sélection courante (ex.
  // pré-rempli depuis le checkout), sinon français. Le choix (value) persiste quand on
  // change de langue : le toggle ne fait que naviguer, l'aperçu reste la vérité.
  const [lang, setLang] = useState<TaglineLang>(current?.lang ?? 'fr');
  const groups = taglinesByRegistre(lang);

  const [openReg, setOpenReg] = useState<TaglineRegistre>(current?.registre ?? 'drague');
  const openGroup = groups.find((g) => g.registre === openReg) ?? groups[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-ui text-xs text-brand-gray/55 tracking-[0.2em] uppercase">Accroche</p>
          <p className="font-ui text-xxs text-brand-gray/55 mt-0.5">
            Imprimée sous le QR, dans le dos. Elle donne envie de scanner.
          </p>
        </div>
        {/* Langue IMPRIMÉE (l'anglais couvre voyage/étranger + le style streetwear). */}
        <div className="flex gap-1 shrink-0" role="group" aria-label="Langue de l'accroche imprimée">
          {TAGLINE_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`px-2.5 py-1.5 rounded-[2px] border font-ui text-xxs tracking-[0.1em] transition-colors ${
                lang === l
                  ? 'border-brand-white/60 text-brand-white'
                  : 'border-brand-gray/15 text-brand-gray/45 hover:border-brand-gray/30'
              }`}
            >
              {TAGLINE_LANG_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Niveau 1 — CATÉGORIE : onglets soulignés (navigation, pas un choix) */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-brand-gray/10 pb-1">
        {groups.map((g) => (
          <button
            key={g.registre}
            type="button"
            onClick={() => setOpenReg(g.registre)}
            aria-pressed={openReg === g.registre}
            className={`font-ui text-xs tracking-[0.12em] uppercase pb-1.5 -mb-[5px] border-b-2 transition-colors ${
              openReg === g.registre
                ? 'border-brand-white text-brand-white'
                : 'border-transparent text-brand-gray/40 hover:text-brand-gray/70'
            }`}
          >
            {SHORT[g.registre]}
          </button>
        ))}
      </div>

      {/* Niveau 2 — LE CHOIX : « QR seul » puis les accroches du registre ouvert */}
      <div className="flex flex-col gap-1.5">
        <p className="font-ui text-xxs text-brand-gray/40 tracking-[0.15em] uppercase">Choisis ta phrase</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-pressed={value === null}
            style={{ minHeight: '44px' }}
            className={`rounded-[2px] border px-3 py-2 font-ui text-sm transition-all ${
              value === null
                ? 'border-brand-white/70 bg-brand-white/10 text-brand-white'
                : 'border-brand-gray/15 text-brand-gray/45 hover:border-brand-gray/30'
            }`}
          >
            QR seul
          </button>
          {openGroup.items.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-pressed={value === t.id}
              style={{ minHeight: '44px' }}
            className={`rounded-[2px] border px-3 py-2 font-ui text-sm text-left transition-all ${
                value === t.id
                  ? 'border-brand-white/70 bg-brand-white/10 text-brand-white'
                  : 'border-brand-gray/15 text-brand-gray/55 hover:border-brand-gray/30'
              }`}
            >
              {t.text}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

export const TAGLINE_COUNT = TAGLINES.length;
