// Cookie de session Supabase (sb-<projet>-auth-token, éventuellement découpé en
// .0, .1… par @supabase/ssr). Sans lui, le visiteur n'est pas connecté — le
// passant qui scanne, le plus souvent. Le cookie PKCE (…-auth-token-code-verifier)
// ne compte pas : il ne porte pas de session.
export function hasSupabaseSessionCookie(cookies: string): boolean {
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(cookies);
}
