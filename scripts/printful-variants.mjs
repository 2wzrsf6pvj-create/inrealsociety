#!/usr/bin/env node
/**
 * Liste les variant_id Printful du t-shirt (couleur × taille) et imprime les
 * lignes .env prêtes à coller.
 *
 * POURQUOI : un variant_id Printful encode COULEUR **ET** TAILLE. Sans les 10
 * variables PRINTFUL_VARIANT_ID_{DARK|LIGHT}_{S..XXL}, toutes les commandes
 * partent à la taille du fallback (cf. fulfillment.ts).
 *
 * USAGE :
 *   PRINTFUL_API_TOKEN=xxx node scripts/printful-variants.mjs
 *   PRINTFUL_API_TOKEN=xxx node scripts/printful-variants.mjs "1717"     # filtre produit
 *   PRINTFUL_API_TOKEN=xxx node scripts/printful-variants.mjs --id 145   # id produit direct
 *
 * Lecture seule : n'écrit rien chez Printful.
 */

const API = 'https://api.printful.com';
const TOKEN = process.env.PRINTFUL_API_TOKEN;

if (!TOKEN) {
  console.error('❌ PRINTFUL_API_TOKEN manquant.\n   PRINTFUL_API_TOKEN=xxx node scripts/printful-variants.mjs');
  process.exit(1);
}

// Nos tailles applicatives → libellés Printful (Printful écrit « 2XL », pas « XXL »).
const SIZE_MAP = { S: ['S'], M: ['M'], L: ['L'], XL: ['XL'], XXL: ['2XL', 'XXL'] };
// Nos thèmes → couleurs Printful (le tee « dark » = noir, « light » = blanc).
const COLOR_MAP = {
  DARK:  ['Black', 'Noir'],
  LIGHT: ['White', 'Blanc'],
};

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token Printful refusé (401). Vérifie PRINTFUL_API_TOKEN.');
    const body = await res.text();
    throw new Error(`Printful a répondu ${res.status} sur ${path} — ${body.slice(0, 160)}`);
  }
  return (await res.json()).result;
}

async function main() {
const args = process.argv.slice(2);
const idFlag = args.indexOf('--id');
const search = (idFlag === -1 ? args[0] : null) || '1717';

let productId;
if (idFlag !== -1) {
  productId = Number(args[idFlag + 1]);
} else {
  const products = await api('/products');
  const matches = products.filter(p =>
    `${p.title} ${p.model ?? ''} ${p.brand ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  if (!matches.length) {
    console.error(`❌ Aucun produit ne correspond à « ${search} ».`);
    console.error('   Essaie un autre terme, ou passe l’id : --id <productId>');
    process.exit(1);
  }
  if (matches.length > 1) {
    console.log(`⚠️  ${matches.length} produits correspondent à « ${search} » :`);
    matches.forEach(p => console.log(`   id=${p.id}  ${p.brand ?? ''} ${p.model ?? ''} — ${p.title}`));
    console.log('\n   Relance avec : --id <productId>');
    process.exit(0);
  }
  productId = matches[0].id;
  console.log(`Produit : id=${productId} — ${matches[0].brand ?? ''} ${matches[0].model ?? ''}\n`);
}

const { variants } = await api(`/products/${productId}`);

const norm = s => (s ?? '').trim().toLowerCase();
const lines = [];
const manquants = [];

for (const [colorKey, colorNames] of Object.entries(COLOR_MAP)) {
  for (const [sizeKey, sizeNames] of Object.entries(SIZE_MAP)) {
    const v = variants.find(v =>
      colorNames.some(c => norm(v.color) === norm(c)) &&
      sizeNames.some(s => norm(v.size) === norm(s)));
    if (v) lines.push(`PRINTFUL_VARIANT_ID_${colorKey}_${sizeKey}=${v.id}`);
    else   manquants.push(`${colorKey}_${sizeKey}`);
  }
}

console.log('# ── À coller dans .env.local ET dans Vercel (Production) ──');
lines.forEach(l => console.log(l));
console.log('# fallback legacy : laisser vide une fois les 10 ci-dessus renseignées');
console.log('PRINTFUL_VARIANT_ID_DARK=');
console.log('PRINTFUL_VARIANT_ID_LIGHT=');

if (manquants.length) {
  console.error(`\n⚠️  Introuvables : ${manquants.join(', ')}`);
  console.error('   Couleurs/tailles réellement disponibles pour ce produit :');
  const colors = [...new Set(variants.map(v => v.color))].join(' · ');
  const sizes  = [...new Set(variants.map(v => v.size))].join(' · ');
  console.error(`   couleurs : ${colors}\n   tailles  : ${sizes}`);
  console.error('   → adapte COLOR_MAP / SIZE_MAP en tête du script.');
  process.exit(1);
}
console.log(`\n✅ Les 10 variants sont résolus (produit ${productId}).`);
}

main().catch(err => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
