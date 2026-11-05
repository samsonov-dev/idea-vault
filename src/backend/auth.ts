import type { Env } from './types';
const decode = (value: string) => JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')));
let cache: { url: string; keys: JsonWebKey[]; expires: number } | undefined;

export async function authenticated(request: Request, env: Env): Promise<'owner' | 'service' | null> {
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

