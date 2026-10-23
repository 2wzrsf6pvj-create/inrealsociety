// src/lib/web-manifest.ts — Manifestes de l'app installable (écran d'accueil).
//
// L'app installée s'ouvre sur l'adresse de départ du manifeste, pas sur la page
// où on l'a ajoutée (Safari sur iPhone comme Chrome sur Android). Avec le seul
// public/manifest.json, l'app installée depuis « Mon espace » s'ouvrait sur
// l'accueil du site. Deux pages ont donc leur propre manifeste :
//   - « Mon espace » (/dashboard) : le porteur y retrouve ses messages ;
//   - chaque conversation : le passant, à qui la page conseille de l'ajouter à
//     l'écran d'accueil pour être notifié, y retrouve la sienne. La page n'avait
//     jusque-là aucun manifeste lisible (cf. son layout).
// Ils reprennent public/manifest.json et ne changent que le point d'entrée.
// Servis hors proxy (extension .webmanifest) : le navigateur les demande sans
// cookies, un passage par la connexion les rendrait illisibles.
// Deux conditions pour qu'ils soient lus :
//   - le lien est dans le <head>, seul endroit où Chrome et Safari le cherchent
//     (d'où le layout de la conversation) ;
//   - sur iPhone, Safari ne lit le manifeste qu'au chargement de la page : on
//     arrive sur ces pages par un chargement complet (cf. lib/full-page).

import base from '../../public/manifest.json';

/** Réglages de l'app installée sur iPhone : layout racine, et layout de la
 *  conversation dont les métadonnées arrivent trop tard dans le <head>. */
export const APPLE_WEB_APP = { title: 'In Real Society', statusBarStyle: 'black' } as const;

export function webManifest(startUrl: string) {
  return { ...base, id: startUrl, start_url: startUrl };
}

export function manifestResponse(startUrl: string): Response {
  return new Response(JSON.stringify(webManifest(startUrl)), {
    headers: {
      'Content-Type':  'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
