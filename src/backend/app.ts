import { Hono } from 'hono';
import { authenticated } from './auth';
import type { AppEnv } from './types';
import { IdeasService } from './ideas-service';
import { validateCreate, validatePatch } from '../idea-validation';
import { handleMcp } from '../mcp';
import { RequestMetrics } from '../observability';

export const app = new Hono<AppEnv>({ strict: true });
// Let the outer telemetry middleware record failures before sanitizing errors.
app.onError(error => { throw error; });
app.use('*', async (c, next) => {
  const metrics = new RequestMetrics((c.executionCtx as ExecutionContext).tracing);
  c.set('metrics', metrics);
  const start = performance.now();
  const path = c.req.path;
  const route = path === '/mcp' ? '/mcp' : path === '/api/ideas' ? '/api/ideas'
    : /^\/api\/ideas\/[^/]+$/.test(path) ? '/api/ideas/:id' : path.startsWith('/api/') ? '/api/unknown' : '/assets';
  try {
    await metrics.measure('handler', async () => { await next(); });
  } catch {
    c.res = c.json({ error: 'Internal error' }, 500);
  }
  c.res = metrics.finish(c.res, c.req.method, route, performance.now() - start);
});
app.use('*', async (c, next) => {
  c.header('cache-control', 'no-store');
  const metrics = c.get('metrics');
  const identity = await metrics.measure('auth', () => authenticated(c.req.raw, c.env));
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);
  if (identity === 'service' && c.req.path !== '/mcp') return c.json({ error: 'Forbidden' }, 403);
  await next();
});

app.all('/mcp', c => handleMcp(c.req.raw, c.env.DB, c.get('metrics')));
app.get('/api/ideas', async c => c.json(await new IdeasService(c.env.DB).list()));
app.post('/api/ideas', async c => {
  const input = validateCreate(await c.req.json().catch(() => null));
  if (!input) return c.json({ error: 'Invalid input' }, 400);
  const { id } = await new IdeasService(c.env.DB).create(input);
  return c.json({ id }, 201);
});
app.patch('/api/ideas/:id', async c => {
  const id = c.req.param('id');
  if (!/^[a-f0-9-]{36}$/.test(id)) return c.json({ error: 'Not found' }, 404);
  const input = validatePatch(await c.req.json().catch(() => null));
  if (!input) return c.json({ error: 'Invalid update' }, 400);
  return await new IdeasService(c.env.DB).update(id, input)
    ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404);
});
app.delete('/api/ideas/:id', async c => {
  const id = c.req.param('id');
  if (!/^[a-f0-9-]{36}$/.test(id)) return c.json({ error: 'Not found' }, 404);
  return await new IdeasService(c.env.DB).delete(id)
    ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404);
});
app.all('*', async c => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
  if (!['GET', 'HEAD'].includes(c.req.method)) return c.json({ error: 'Method not allowed' }, 405);
  const response = await c.env.ASSETS.fetch(c.req.raw);
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
  return new Response(response.body, { status: response.status, headers });
});
