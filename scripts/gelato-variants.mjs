// scripts/gelato-variants.mjs
// Découverte des `productUid` Gelato pour le t-shirt du projet (équivalent de
// printful-variants.mjs). LECTURE SEULE — n'écrit rien, ne commande rien.
//
//   GELATO_API_KEY=xxx node scripts/gelato-variants.mjs
//
// Optionnel — cibler un catalogue et filtrer :
//   GELATO_CATALOG_UID=apparel GELATO_FILTER=Sparker node scripts/gelato-variants.mjs
//
// But : trouver les 10 productUid (noir/blanc × S..XXL) du blank choisi (reco :
// Stanley/Stella Sparker 2.0, 215 gsm) et sortir les lignes .env prêtes à coller :
//   GELATO_PRODUCT_UID_DARK_S=...   GELATO_PRODUCT_UID_LIGHT_XXL=...
//
// Réf. API produit : https://dashboard.gelato.com/docs/products/  (v3, X-API-KEY)

const KEY = process.env.GELATO_API_KEY;
if (!KEY) {
  console.error('✗ GELATO_API_KEY manquante.  GELATO_API_KEY=xxx node scripts/gelato-variants.mjs');
  process.exit(1);
}

const PRODUCT_API = 'https://product.gelatoapis.com/v3';
const H = { 'X-API-KEY': KEY, 'Content-Type': 'application/json' };

async function get(path) {
  const res = await fetch(`${PRODUCT_API}${path}`, { headers: H });
  if (res.status === 401) { console.error('✗ 401 — clé API invalide.'); process.exit(1); }
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${(await res.text()).slice(0, 150)}`);
  return res.json();
}
async function search(catalogUid, attributes = {}) {
  const res = await fetch(`${PRODUCT_API}/catalogs/${catalogUid}/products:search`, {
    method: 'POST', headers: H, body: JSON.stringify({ attributeFilters: attributes, limit: 100 }),
  });
  if (!res.ok) throw new Error(`search ${catalogUid} → ${res.status} ${(await res.text()).slice(0, 150)}`);
  return res.json();
}

// Repère les attributs « couleur » et « taille » quel que soit leur nom exact (varie
// selon le catalogue). On matche sur des mots-clés.
const pick = (obj, ...keys) => {
  const k = Object.keys(obj || {}).find((x) => keys.some((w) => x.toLowerCase().includes(w)));
  return k ? obj[k] : undefined;
};

(async () => {
  // 1) Catalogues → repérer celui des t-shirts.
  const catalogs = await get('/catalogs');
  const list = Array.isArray(catalogs) ? catalogs : catalogs.data ?? [];
  console.log(`\n${list.length} catalogues :`);
  for (const c of list) console.log(`  ${c.catalogUid}  —  ${c.title ?? ''}`);

  const wanted = process.env.GELATO_CATALOG_UID
    || (list.find((c) => /t-shirt|tshirt|apparel/i.test(`${c.catalogUid} ${c.title}`))?.catalogUid);
  if (!wanted) { console.error('\n✗ Aucun catalogue apparel/t-shirt trouvé. Passe GELATO_CATALOG_UID=…'); process.exit(1); }
  console.log(`\n→ Catalogue ciblé : ${wanted}\n`);

  // 2) Attributs du catalogue (pour voir les codes couleur/taille dispo).
  const cat = await get(`/catalogs/${wanted}`);
  const attrs = cat.productAttributes ?? cat.attributes ?? [];
  console.log('Attributs disponibles (utile pour filtrer) :');
  for (const a of attrs) {
    const vals = (a.values ?? []).map((v) => v.productAttributeValueUid ?? v.value ?? v).slice(0, 12);
    console.log(`  ${a.productAttributeUid ?? a.name}: ${vals.join(', ')}${(a.values ?? []).length > 12 ? '…' : ''}`);
  }

  // 3) Recherche des produits (optionnellement filtrés par mot-clé sur le nom).
  const filter = process.env.GELATO_FILTER; // ex. "Sparker"
  const found = await search(wanted);
  const products = found.products ?? found.data ?? [];
  const rows = products
    .map((p) => ({
      uid:   p.productUid,
      color: pick(p.attributes, 'color', 'colour'),
      size:  pick(p.attributes, 'size'),
      name:  `${p.productUid}`,
    }))
    .filter((r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase()));

  console.log(`\n${rows.length} variantes${filter ? ` (filtre « ${filter} »)` : ''} :`);
  for (const r of rows) console.log(`  [${r.color ?? '?'} / ${r.size ?? '?'}]  ${r.uid}`);

  // 4) Tente de mapper noir/blanc × S..XXL → lignes .env prêtes.
  const SIZES = { S: ['s'], M: ['m'], L: ['l'], XL: ['xl'], XXL: ['2xl', 'xxl'] };
  const isBlack = (c) => /black|noir/i.test(c || '');
  const isWhite = (c) => /white|blanc/i.test(c || '');
  console.log('\n─── Lignes .env (vérifie-les — le mapping couleur/taille est heuristique) ───');
  for (const [envSize, aliases] of Object.entries(SIZES)) {
    const bySize = (r) => aliases.some((a) => `${r.size}`.toLowerCase() === a);
    const dark  = rows.find((r) => isBlack(r.color) && bySize(r));
    const light = rows.find((r) => isWhite(r.color) && bySize(r));
    if (dark)  console.log(`GELATO_PRODUCT_UID_DARK_${envSize}=${dark.uid}`);
    if (light) console.log(`GELATO_PRODUCT_UID_LIGHT_${envSize}=${light.uid}`);
  }
  console.log('\n(Si vide : affine avec GELATO_FILTER=<modèle> et recoupe avec les attributs ci-dessus.)');
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
