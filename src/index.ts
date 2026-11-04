export interface Env {
  DB: D1Database;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  OWNER_EMAIL: string;
}
const statuses = ['inbox', 'refine', 'ready', 'progress', 'done'] as const;
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
    const jwk = cache.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signature = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(parts[0] + '.' + parts[1]));
  } catch { return false; }
}

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Idea Vault</title><style>
body{font:16px system-ui;max-width:800px;margin:3rem auto;padding:0 1rem;background:#f5f6f9;color:#18202e}
form,article{background:white;border:1px solid #d8dce5;border-radius:12px;padding:1rem;margin:1rem 0}
input,textarea,select,button{font:inherit;padding:.65rem;border:1px solid #c8ccd5;border-radius:7px}
input,textarea{width:100%;box-sizing:border-box;margin:.4rem 0}
button{background:#24324b;color:white;cursor:pointer}
article p{white-space:pre-wrap;overflow-wrap:anywhere}#error{color:#b91c1c}
</style></head><body><h1>Idea Vault</h1><p>Your private idea inbox</p>
<form id="create"><input id="title" maxlength="200" required placeholder="Idea title"><textarea id="description" maxlength="10000" placeholder="Details"></textarea><button>Add idea</button></form>
<div id="error" role="alert"></div><main id="ideas"></main>
<script>
const statuses=['inbox','refine','ready','progress','done'];
const root=document.getElementById('ideas'),error=document.getElementById('error');
async function api(path,opts={}){const res=await fetch(path,{...opts,headers:{'content-type':'application/json',...opts.headers}});const body=await res.json();if(!res.ok)throw Error(body.error||'Request failed');return body}
async function load(){try{error.textContent='';const ideas=await api('/api/ideas');root.replaceChildren();for(const idea of ideas){const card=document.createElement('article'),heading=document.createElement('h3');heading.textContent=idea.title;card.append(heading);if(idea.description){const p=document.createElement('p');p.textContent=idea.description;card.append(p)}const select=document.createElement('select');for(const s of statuses){const option=document.createElement('option');option.value=s;option.textContent=s;option.selected=s===idea.status;select.append(option)}select.onchange=async()=>{try{await api('/api/ideas/'+encodeURIComponent(idea.id),{method:'PATCH',body:JSON.stringify({status:select.value})});await load()}catch(e){error.textContent=e.message}};card.append(select);root.append(card)}}catch(e){error.textContent=e.message}}
document.getElementById('create').onsubmit=async e=>{e.preventDefault();try{await api('/api/ideas',{method:'POST',body:JSON.stringify({title:document.getElementById('title').value,description:document.getElementById('description').value})});e.target.reset();await load()}catch(e){error.textContent=e.message}};load();
</script></body></html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!await authenticated(request, env)) return respond({ error: 'Unauthorized' }, 401);
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/') return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'" } });
    if (request.method === 'GET' && path === '/api/ideas') {
      const result = await env.DB.prepare('SELECT * FROM ideas ORDER BY updated_at DESC LIMIT 500').all();
      return respond(result.results);
    }
    if (request.method === 'POST' && path === '/api/ideas') {
      const body = await request.json().catch(() => null) as { title?: unknown; description?: unknown } | null;
      if (!body || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200 || (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 10000))) return respond({ error: 'Invalid input' }, 400);
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO ideas (id,title,description) VALUES (?,?,?)').bind(id,body.title.trim(),body.description ?? '').run();
      return respond({ id }, 201);
    }
    const match = /^\/api\/ideas\/([a-f0-9-]{36})$/.exec(path);
    if (match && request.method === 'PATCH') {
      const body = await request.json().catch(() => null) as { status?: unknown } | null;
      if (!body || !statuses.includes(body.status as Status)) return respond({ error: 'Invalid status' }, 400);
      const result = await env.DB.prepare("UPDATE ideas SET status=?, updated_at=datetime('now') WHERE id=?").bind(body.status,match[1]).run();
      return result.meta.changes ? respond({ ok: true }) : respond({ error: 'Not found' },404);
    }
    return respond({ error: 'Not found' }, 404);
  }
} satisfies ExportedHandler<Env>;
