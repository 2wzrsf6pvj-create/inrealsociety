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
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        ui:      ['Montserrat', 'system-ui', 'sans-serif'],
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
      animation: {
        fadeUp: 'fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        fadeIn: 'fadeIn 0.35s ease both',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to:   { opacity: '1', transform: 'translateY(0)'    },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;