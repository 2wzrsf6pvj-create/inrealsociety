// Un profil se découvre en scannant un t-shirt : le plan du site n'en liste
// aucun. (La consigne « noindex » des pages profil est dans leur generateMetadata.)

import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';

describe('plan du site', () => {
  it('ne liste aucun profil de porteur', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.some((u) => u.includes('/profil/'))).toBe(false);
  });
});
