// src/lib/full-page.ts — Arriver sur une page « installable » par un chargement
// complet. Sur iPhone, Safari ne lit le manifeste qu'une fois par chargement de
// page (WebKit, DocumentLoader::loadApplicationManifest) : après une navigation
// interne de Next, l'app ajoutée à l'écran d'accueil garderait le manifeste de la
// page précédente et s'ouvrirait sur l'accueil du site. Pour un lien, la même
// règle s'écrit <a href> plutôt que <Link>.

/** Conversation du passant, « Mon espace » après la connexion. */
export function openFullPage(path: string): void {
  window.location.assign(path);
}
