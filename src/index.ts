import { validateCreate, validatePatch } from './idea-validation';
import { handleMcp } from './mcp';
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  OWNER_EMAIL: string;
  CF_ACCESS_SERVICE_TOKEN_ID?: string;
}
const respond = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const decode = (value: string) => JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')));
let cache: { url: string; keys: JsonWebKey[]; expires: number } | undefined;

async function authenticated(request: Request, env: Env): Promise<'owner' | 'service' | null> {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD || !env.OWNER_EMAIL) return null;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = decode(parts[0]) as { alg?: string; kid?: string };
    const payload = decode(parts[1]) as { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string; sub?: string; common_name?: string };
    const domain = env.CF_ACCESS_TEAM_DOMAIN.replace(/\/$/, '');
    const now = Math.floor(Date.now() / 1000);
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(domain)) return null;
    if (header.alg !== 'RS256' || !header.kid || payload.iss !== domain) return null;
    if (!payload.exp || payload.exp <= now || (payload.nbf && payload.nbf > now)) return null;
    if (!(Array.isArray(payload.aud) ? payload.aud : [payload.aud]).includes(env.CF_ACCESS_AUD)) return null;
    const owner = payload.email?.toLowerCase() === env.OWNER_EMAIL.toLowerCase();
    const service = Boolean(env.CF_ACCESS_SERVICE_TOKEN_ID &&
      (payload.common_name === env.CF_ACCESS_SERVICE_TOKEN_ID || payload.sub === env.CF_ACCESS_SERVICE_TOKEN_ID));
    if (!owner && !service) return null;
    const url = domain + '/cdn-cgi/access/certs';
    if (!cache || cache.url !== url || cache.expires <= now) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const jwks = await res.json() as { keys?: JsonWebKey[] };
      if (!Array.isArray(jwks.keys)) return null;
      cache = { url, keys: jwks.keys, expires: now + 300 };
    }
    const jwk = cache.keys.find(k => ('kid' in k) && k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signature = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(parts[0] + '.' + parts[1]));
    return valid ? (owner ? 'owner' : 'service') : null;
  } catch { return null; }
}


export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const identity = await authenticated(request, env);
    if (!identity) return respond({ error: 'Unauthorized' }, 401);
    const path = new URL(request.url).pathname;
    if (identity === 'service' && path !== '/mcp') return respond({ error: 'Forbidden' }, 403);
    if (path === '/mcp') return handleMcp(request, env.DB);
    if (!path.startsWith('/api/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return respond({ error: 'Method not allowed' }, 405);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'private, no-store');
      headers.set('x-content-type-options', 'nosniff');
      headers.set('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
      return new Response(response.body, { status: response.status, headers });
    }
    if (request.method === 'GET' && path === '/api/ideas') {
      const result = await env.DB.prepare('SELECT * FROM ideas ORDER BY updated_at DESC LIMIT 500').all();
      return respond(result.results);
    }
    if (request.method === 'POST' && path === '/api/ideas') {
      const body = validateCreate(await request.json().catch(() => null));
      if (!body) return respond({ error: 'Invalid input' }, 400);
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO ideas (id,title,description,status,priority,tags) VALUES (?,?,?,?,?,?)')
        .bind(id,body.title,body.description,body.status,body.priority,JSON.stringify(body.tags)).run();
      return respond({ id }, 201);
    }
    const match = /^\/api\/ideas\/([a-f0-9-]{36})$/.exec(path);
    if (match && request.method === 'PATCH') {
      const body = validatePatch(await request.json().catch(() => null));
      if (!body) return respond({ error: 'Invalid update' }, 400);
      const fields = Object.keys(body);
      const values = fields.map(key => key === 'tags' ? JSON.stringify(body[key]) : body[key]);
      const result = await env.DB.prepare("UPDATE ideas SET "+fields.map(key => key+'=?').join(',')+", updated_at=datetime('now') WHERE id=?")
        .bind(...values,match[1]).run();
      return result.meta.changes ? respond({ ok: true }) : respond({ error: 'Not found' },404);
    }
    if (match && request.method === 'DELETE') {
      const result = await env.DB.prepare('DELETE FROM ideas WHERE id=?').bind(match[1]).run();
      return result.meta.changes ? respond({ ok: true }) : respond({ error: 'Not found' },404);
    }
    return respond({ error: 'Not found' }, 404);
  }
} satisfies ExportedHandler<Env>;
