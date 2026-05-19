import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand-black': '#000000',
        'brand-white': '#FFFFFF',
        'brand-gray':  '#FFFFFF',
        'brand-dark':  '#0a0a0a',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        ui:      ['var(--font-ui)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xxs':  ['0.65rem',  { lineHeight: '1rem' }],     // 10.4px — fine print, legal
        'xs':   ['0.75rem',  { lineHeight: '1.1rem' }],   // 12px — labels, meta
        'sm':   ['0.875rem', { lineHeight: '1.35rem' }],  // 14px — body small
        'base': ['1rem',     { lineHeight: '1.5rem' }],   // 16px — body
        'lg':   ['1.125rem', { lineHeight: '1.6rem' }],   // 18px — body large
        'xl':   ['1.25rem',  { lineHeight: '1.75rem' }],  // 20px — sub-headings
        '2xl':  ['1.5rem',   { lineHeight: '2rem' }],     // 24px — headings
        '3xl':  ['1.875rem', { lineHeight: '2.25rem' }],  // 30px — hero
        '4xl':  ['2.25rem',  { lineHeight: '2.5rem' }],   // 36px — hero large
        '5xl':  ['3rem',     { lineHeight: '3.25rem' }],  // 48px — display
      },
      // Les animations custom du projet sont définies dans src/app/globals.css
      // (staggerUp, ringPulse, shimmer, lineDraw, float, slideInRight, typingDot,
      // successPop). On garde uniquement les Tailwind built-ins (animate-pulse,
      // animate-spin, etc.) sans extension custom ici.
    },
  },
  plugins: [],
};

export default config;