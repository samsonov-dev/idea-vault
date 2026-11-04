import { describe, expect, it, vi } from 'vitest';
import { handleMcp, tools } from './mcp';

const request = (method: string, params?: unknown, id: string | number | undefined = 1) =>
  new Request('https://idea.samsonov-dev.com/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params }),
  });
const db = { prepare: vi.fn() } as unknown as D1Database;
describe('MCP Streamable HTTP endpoint', () => {
  it('negotiates protocol and advertises tools', async () => {
    const init = await handleMcp(request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }), db);
    expect(init.status).toBe(200);
    expect((await init.json() as { result: { protocolVersion: string } }).result.protocolVersion).toBe('2025-06-18');
    const list = await handleMcp(request('tools/list'), db);
    expect((await list.json() as { result: { tools: unknown[] } }).result.tools).toHaveLength(5);
    expect(tools.map(t => t.name)).toContain('create_idea');
  });
  it('acknowledges notifications without a response body', async () => {
    const response = await handleMcp(request('notifications/initialized', {}, null), db);
    expect(response.status).toBe(202);
  });
  it('rejects malformed JSON-RPC and unknown methods', async () => {
    const bad = await handleMcp(new Request('https://idea.samsonov-dev.com/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }), db);
    expect(bad.status).toBe(400);
    const unknown = await handleMcp(request('unknown'), db);
    expect((await unknown.json() as { error: { code: number } }).error.code).toBe(-32601);
  });
  it('rejects invalid mutation arguments', async () => {
    const res = await handleMcp(request('tools/call', { name: 'create_idea', arguments: { title: '' } }), db);
    expect((await res.json() as { result: { isError: boolean } }).result.isError).toBe(true);
    expect((await handleMcp(request('tools/call', { name: 'delete_idea', arguments: { id: 'bad' } }), db)).status).toBe(200);
    expect((db.prepare as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
