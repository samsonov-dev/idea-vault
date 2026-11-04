import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestMetrics } from './observability';
import { handleMcp } from './mcp';
import worker from './index';

afterEach(() => vi.restoreAllMocks());

describe('request telemetry', () => {
  it('preserves responses and correlates timings without reusing request IDs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const metrics = new RequestMetrics();
    await metrics.measure('auth', async () => true);
    const response = metrics.finish(new Response('body', { status: 201, headers: { 'cache-control': 'no-store' } }), 'POST', '/mcp', 12);
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('body');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBe(metrics.requestId);
    expect(response.headers.get('server-timing')).toMatch(/auth;dur=.*worker;dur=12.00/);
    expect(log.mock.calls.every(([value]) => JSON.parse(value).requestId === metrics.requestId)).toBe(true);
    expect(new RequestMetrics().requestId).not.toBe(metrics.requestId);
  });

  it('records D1 failures despite HTTP 200 and excludes arguments and exception text', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secret = 'sensitive query text';
    const db = { prepare: () => { throw new Error(secret); } } as unknown as D1Database;
    const request = new Request('https://example.com/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: secret, method: 'tools/call', params: { name: 'list_ideas', arguments: { query: secret } } }),
    });
    const response = await handleMcp(request, db, new RequestMetrics());
    expect(response.status).toBe(200);
    expect((await response.json() as { error: { code: number } }).error.code).toBe(-32603);
    const errors = error.mock.calls.map(([value]) => JSON.parse(value));
    expect(errors).toContainEqual(expect.objectContaining({ operation: 'tool.list_ideas', outcome: 'error' }));
    expect(errors).toContainEqual(expect.objectContaining({ event: 'mcp.error', code: -32603 }));
    expect(JSON.stringify([...log.mock.calls, ...error.mock.calls])).not.toContain(secret);
  });

  it('instruments rejected authentication and does not log arbitrary paths', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = await worker.fetch(new Request('https://example.com/private-value'), {
      CF_ACCESS_TEAM_DOMAIN: '', CF_ACCESS_AUD: '', OWNER_EMAIL: '',
    } as Parameters<typeof worker.fetch>[1], {} as ExecutionContext);
    expect(response.status).toBe(401);
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-value');
  });
});
