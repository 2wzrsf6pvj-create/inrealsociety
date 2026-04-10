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