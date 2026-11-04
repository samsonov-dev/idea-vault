export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  OWNER_EMAIL: string;
}
const statuses = ['inbox', 'refine', 'ready', 'progress', 'done'] as const;
const priorities = ['low', 'medium', 'high'] as const;
const validTags = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 20 && v.every(t => typeof t === 'string' && t.length > 0 && t.length <= 40);
type Status = typeof statuses[number];
const respond = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const decode = (value: string) => JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')));
let cache: { url: string; keys: JsonWebKey[]; expires: number } | undefined;

async function authenticated(request: Request, env: Env): Promise<boolean> {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD || !env.OWNER_EMAIL) return false;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return false;
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  try {
    const header = decode(parts[0]) as { alg?: string; kid?: string };
    const payload = decode(parts[1]) as { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string };
    const domain = env.CF_ACCESS_TEAM_DOMAIN.replace(/\/$/, '');
    const now = Math.floor(Date.now() / 1000);
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(domain)) return false;
    if (header.alg !== 'RS256' || !header.kid || payload.iss !== domain) return false;
    if (!payload.exp || payload.exp <= now || (payload.nbf && payload.nbf > now)) return false;
    if (!(Array.isArray(payload.aud) ? payload.aud : [payload.aud]).includes(env.CF_ACCESS_AUD)) return false;
    if (payload.email?.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) return false;
    const url = domain + '/cdn-cgi/access/certs';
    if (!cache || cache.url !== url || cache.expires <= now) {
      const res = await fetch(url);
      if (!res.ok) return false;
      const jwks = await res.json() as { keys?: JsonWebKey[] };
      if (!Array.isArray(jwks.keys)) return false;
      cache = { url, keys: jwks.keys, expires: now + 300 };
    }
    const jwk = cache.keys.find(k => ('kid' in k) && k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signature = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(parts[0] + '.' + parts[1]));
  } catch { return false; }
}


export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!await authenticated(request, env)) return respond({ error: 'Unauthorized' }, 401);
    const path = new URL(request.url).pathname;
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
      const body = await request.json().catch(() => null) as { title?: unknown; description?: unknown; priority?: unknown; tags?: unknown; status?: unknown } | null;
      if (!body || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200 || (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 10000)) || (body.priority !== undefined && !priorities.includes(body.priority as typeof priorities[number])) || (body.status !== undefined && !statuses.includes(body.status as Status)) || (body.tags !== undefined && !validTags(body.tags))) return respond({ error: 'Invalid input' }, 400);
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO ideas (id,title,description,status,priority,tags) VALUES (?,?,?,?,?,?)').bind(id,body.title.trim(),body.description ?? '',body.status ?? 'inbox',body.priority ?? 'medium',JSON.stringify(body.tags ?? [])).run();
      return respond({ id }, 201);
    }
    const match = /^\/api\/ideas\/([a-f0-9-]{36})$/.exec(path);
    if (match && request.method === 'PATCH') {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!body || Object.keys(body).length === 0 || Object.keys(body).some(k => !['title','description','status','priority','tags'].includes(k))) return respond({ error: 'Invalid update' }, 400);
      if ((body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200)) ||
          (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 10000)) ||
          (body.status !== undefined && !statuses.includes(body.status as Status)) ||
          (body.priority !== undefined && !priorities.includes(body.priority as typeof priorities[number])) ||
          (body.tags !== undefined && !validTags(body.tags))) return respond({ error: 'Invalid input' }, 400);
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [k,v] of Object.entries(body)) { fields.push(k+'=?'); values.push(k === 'tags' ? JSON.stringify(v) : k === 'title' ? (v as string).trim() : v); }
      const result = await env.DB.prepare("UPDATE ideas SET "+fields.join(',')+", updated_at=datetime('now') WHERE id=?").bind(...values,match[1]).run();
      return result.meta.changes ? respond({ ok: true }) : respond({ error: 'Not found' },404);
    }
    if (match && request.method === 'DELETE') {
      const result = await env.DB.prepare('DELETE FROM ideas WHERE id=?').bind(match[1]).run();
      return result.meta.changes ? respond({ ok: true }) : respond({ error: 'Not found' },404);
    }
    return respond({ error: 'Not found' }, 404);
  }
} satisfies ExportedHandler<Env>;
