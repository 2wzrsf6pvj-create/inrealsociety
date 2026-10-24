// e2e/db/supabase-gateway.mjs — Se fait passer pour Supabase (et Upstash) devant
// la base de test, pour les E2E avec base (cf. e2e/db/README.md) :
//   /rest/v1/*       → PostgREST : la vraie base, migrations du dépôt ;
//   /auth/v1/user    → l'utilisateur porté par le jeton de session, signé avec
//                      le secret de la base de test (session simulée) ;
//   /auth/v1/signup  → inscription gardée ici, en attente de confirmation ; les
//                      tests la lisent sur /auth-test/signup?email=<adresse>
//                      (identifiant, jeton du lien, données du compte) ;
//   /auth/v1/verify  → le jeton du lien de confirmation (token_hash) ouvre une
//                      session, comme le fait Supabase ;
//   /auth/v1/logout  → déconnexion acceptée ;
//   /upstash         → limites de débit qui laissent toujours passer : elles ont
//                      leurs propres tests, et ici toutes les requêtes viennent
//                      de la même adresse ;
//   /resend/emails   → emails gardés ici, jamais envoyés ; les tests les lisent
//                      sur /resend/sent?to=<adresse>.
// Sans dépendance. Variables : GATEWAY_PORT, POSTGREST_URL, JWT_SECRET.

import http from 'node:http';
import crypto from 'node:crypto';

const PORT      = Number(process.env.GATEWAY_PORT ?? 54321);
const POSTGREST = process.env.POSTGREST_URL ?? 'http://localhost:3001';
const SECRET    = process.env.JWT_SECRET ?? 'integration-test-secret-integration-test-secret';

/** Emails « envoyés » par l'app, du premier au dernier. */
const emails = [];
/** Inscriptions en attente de confirmation, par adresse. */
const signups = new Map();

/** Revendications d'un jeton HS256 valide et non expiré, sinon null. */
function verify(token) {
  const [head, payload, signature] = token.split('.');
  if (!signature) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(`${head}.${payload}`).digest('base64url');
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return claims.exp && claims.exp * 1000 < Date.now() ? null : claims;
}

/** Jeton de session HS256, comme ceux de Supabase (user_metadata compris). */
function sign(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}

/** Utilisateur au format de Supabase Auth. */
function authUser({ id, email, metadata = {}, confirmed = true }) {
  return {
    id, aud: 'authenticated', role: 'authenticated', email,
    ...(confirmed ? { email_confirmed_at: '2026-01-01T00:00:00Z', confirmed_at: '2026-01-01T00:00:00Z' } : {}),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: metadata, identities: [],
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', is_anonymous: false,
  };
}

/** Upstash : les scripts de limite répondent « autorisé » (fenêtre glissante :
 *  [restant, limite] ; fenêtre fixe : [utilisé, limite]) ; le reste, neutre. */
function redisResult([command]) {
  switch (String(command).toLowerCase()) {
    case 'evalsha':
    case 'eval': return [0, 1];
    case 'set':  return 'OK';
    case 'get':  return null;
    default:     return 1;
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://gateway');
  // L'app appelle aussi Supabase depuis le navigateur (déconnexion…).
  const cors = {
    'access-control-allow-origin':   req.headers.origin ?? '*',
    'access-control-allow-methods':  'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'access-control-allow-headers':  req.headers['access-control-request-headers'] ?? '*',
    'access-control-expose-headers': 'content-range, x-supabase-api-version',
  };
  const json = (status, body) => {
    res.writeHead(status, { ...cors, 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    if (url.pathname === '/health') return json(200, { ok: true });

    if (url.pathname.startsWith('/rest/v1/')) {
      const headers = { ...req.headers };
      for (const h of ['host', 'connection', 'content-length', 'accept-encoding', 'origin']) delete headers[h];
      const upstream = await fetch(`${POSTGREST}${url.pathname.slice('/rest/v1'.length)}${url.search}`, {
        method: req.method, headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      });
      const out = { ...cors };
      upstream.headers.forEach((value, key) => {
        if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(key)) out[key] = value;
      });
      res.writeHead(upstream.status, out);
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    }

    if (url.pathname === '/auth/v1/user') {
      const claims = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));
      if (!claims?.sub) return json(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
      return json(200, authUser({ id: claims.sub, email: claims.email, metadata: claims.user_metadata ?? {} }));
    }
    // Inscription : confirmation de l'adresse exigée, donc pas de session.
    if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
      const { email, data } = JSON.parse(body.toString());
      const signup = { id: crypto.randomUUID(), email, metadata: data ?? {}, tokenHash: crypto.randomBytes(20).toString('hex') };
      signups.set(email, signup);
      return json(200, authUser({ ...signup, confirmed: false }));
    }
    // Lien de confirmation (token_hash) : ouvre une session, d'où qu'il soit ouvert.
    if (url.pathname === '/auth/v1/verify' && req.method === 'POST') {
      const { token_hash: tokenHash } = JSON.parse(body.toString());
      const signup = [...signups.values()].find((s) => s.tokenHash === tokenHash);
      if (!signup) return json(403, { code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' });
      const now = Math.floor(Date.now() / 1000);
      const user = authUser(signup);
      return json(200, {
        access_token: sign({ sub: signup.id, email: signup.email, role: 'authenticated', aud: 'authenticated', exp: now + 3600, user_metadata: signup.metadata }),
        token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'e2e', user,
      });
    }
    if (url.pathname === '/auth-test/signup') {
      const signup = signups.get(url.searchParams.get('email'));
      return signup ? json(200, signup) : json(404, {});
    }
    if (url.pathname === '/auth/v1/logout') {
      res.writeHead(204, cors);
      return res.end();
    }

    if (url.pathname === '/resend/emails' || url.pathname === '/resend/emails/batch') {
      const sent = [JSON.parse(body.toString())].flat();
      emails.push(...sent);
      const ids = sent.map((_, i) => ({ id: `e2e-${emails.length - sent.length + i + 1}` }));
      return json(200, url.pathname.endsWith('/batch') ? { data: ids } : ids[0]);
    }
    if (url.pathname === '/resend/sent') {
      const to = url.searchParams.get('to');
      return json(200, emails
        .filter((email) => !to || [email.to].flat().includes(to))
        .map(({ to: recipients, subject }) => ({ to: recipients, subject })));
    }

    if (url.pathname.startsWith('/upstash')) {
      const commands = JSON.parse(body.toString() || 'null');
      if (/\/(pipeline|multi-exec)$/.test(url.pathname)) {
        return json(200, commands.map((command) => ({ result: redisResult(command) })));
      }
      return json(200, { result: redisResult(commands) });
    }

    return json(404, { message: `passerelle E2E : ${url.pathname} non simulé` });
  } catch (err) {
    return json(502, { message: String(err) });
  }
}).listen(PORT, () => console.log(`Passerelle Supabase des E2E sur le port ${PORT}`));
