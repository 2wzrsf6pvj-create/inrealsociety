/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Les erreurs ESLint n'empêchent pas le build de production
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;