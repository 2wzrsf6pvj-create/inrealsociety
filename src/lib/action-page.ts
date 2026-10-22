// src/lib/action-page.ts
// Page HTML autonome pour les liens cliqués depuis un email (désinscriptions) :
// rien à charger, aucune session requise. `title`, `msg` et `extra` sont du
// HTML écrit par le code, jamais une saisie.

import { NextResponse } from 'next/server';

export function actionPage(title: string, msg: string, extra = '', status = 200): NextResponse {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}
.box{max-width:22rem}h1{font-weight:300;font-size:1.6rem;margin:0 0 .5rem}p{color:rgba(255,255,255,.5);font-size:.9rem;line-height:1.6}a{color:rgba(255,255,255,.8)}
button{margin-top:1rem;padding:12px 20px;background:#fff;color:#000;border:0;border-radius:2px;font:inherit;font-weight:700;letter-spacing:.15em;text-transform:uppercase;font-size:.75rem;cursor:pointer}</style>
</head><body><div class="box"><h1>${title}</h1><p>${msg}</p>${extra}<p><a href="/">← In Real Society</a></p></div></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
