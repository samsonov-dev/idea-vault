import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import worker from '../index';
import { authenticated } from './auth';
import type { Env } from './types';

vi.mock('./auth', () => ({ authenticated: vi.fn() }));
const auth = vi.mocked(authenticated);
const run = vi.fn(async () => ({ meta: { changes: 1 } }));
const all = vi.fn(async () => ({ results: [{ id: 'existing', tags: '[]' }] }));
const bind = vi.fn(() => ({ run, all }));
const prepare = vi.fn(() => ({ bind }));
const assets = vi.fn(async () => new Response('frontend'));
const env = { DB: { prepare }, ASSETS: { fetch: assets } } as unknown as Env;
const context = {} as ExecutionContext;
const id = '00000000-0000-4000-8000-000000000000';
const request = (path: string, method = 'GET', body?: string) =>
  worker.fetch(new Request('https://example.com' + path, {
    method, ...(body === undefined ? {} : { body, headers: { 'content-type': 'application/json' } }),
  }), env, context);

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue('owner');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it('rejects unauthenticated requests before accessing assets or D1', async () => {
  auth.mockResolvedValue(null);
  for (const path of ['/', '/api/ideas', '/mcp']) expect((await request(path)).status).toBe(401);
  expect(prepare).not.toHaveBeenCalled();
  expect(assets).not.toHaveBeenCalled();
});

it('restricts service identities to the exact MCP endpoint', async () => {
  auth.mockResolvedValue('service');
  for (const path of ['/', '/api/ideas', '/mcp/']) expect((await request(path)).status).toBe(403);
  const response = await request('/mcp', 'POST', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
  expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
  expect(prepare).not.toHaveBeenCalled();
});

it('preserves REST validation, CRUD responses and parameter binding', async () => {
  expect(await (await request('/api/ideas')).json()).toEqual([{ id: 'existing', tags: '[]' }]);
  expect((await request('/api/ideas', 'POST', '{')).status).toBe(400);
  expect((await request('/api/ideas', 'POST', '{"title":""}')).status).toBe(400);
  const created = await request('/api/ideas', 'POST', '{"title":" Hello ","tags":["tag"]}');
  expect(created.status).toBe(201);
  expect(await created.json()).toEqual({ id: expect.any(String) });
  expect(bind).toHaveBeenCalledWith(expect.any(String), 'Hello', '', 'inbox', 'medium', '["tag"]');
  expect((await request('/api/ideas/' + id, 'PATCH', '{"unexpected":1}')).status).toBe(400);
  expect(await (await request('/api/ideas/' + id, 'PATCH', '{"title":"New"}')).json()).toEqual({ ok: true });
  expect(await (await request('/api/ideas/' + id, 'DELETE')).json()).toEqual({ ok: true });
  run.mockResolvedValueOnce({ meta: { changes: 0 } });
  expect((await request('/api/ideas/' + id, 'DELETE')).status).toBe(404);
  expect((await request('/api/ideas/bad', 'DELETE')).status).toBe(404);
  expect((await request('/api/ideas', 'PUT')).status).toBe(404);
});

it('preserves protected assets and HEAD responses', async () => {
  const response = await request('/');
  expect(await response.text()).toBe('frontend');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  expect((await request('/', 'HEAD')).status).toBe(200);
  expect((await request('/', 'POST')).status).toBe(405);
});

it('sanitizes failures and keeps auth and handler spans on one request ID', async () => {
  prepare.mockImplementationOnce(() => { throw new Error('private SQL'); });
  const response = await request('/api/ideas');
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'Internal error' });
  expect(response.headers.get('server-timing')).toContain('auth;dur=');
  expect(response.headers.get('server-timing')).toContain('handler;dur=');
  const logs = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls];
  expect(JSON.stringify(logs)).not.toContain('private SQL');
  expect(logs.every(([line]) => JSON.parse(line).requestId === response.headers.get('x-request-id'))).toBe(true);
});
