// ESLint 9 (configuration « flat ») : remplace `next lint`, retiré de Next 16.
import { defineConfig, globalIgnores } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Règles du React Compiler, arrivées avec eslint-config-next 16. Elles
    // signalent des motifs déconseillés, pas des bugs : 26 cas existants
    // (setState dans un effet surtout, souvent pour lire localStorage après
    // l'hydratation). En avertissement le temps de les reprendre à part, sans
    // mêler ce chantier à la migration.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity':              'warn',
      'react-hooks/refs':                'warn',
      'react-hooks/immutability':        'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
