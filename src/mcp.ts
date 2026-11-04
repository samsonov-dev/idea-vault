import { isRecord, validateCreate, validatePatch } from './idea-validation';

type Database = D1Database;
type RpcId = string | number | null;
type RpcRequest = { jsonrpc: '2.0'; id?: RpcId; method: string; params?: unknown };
const protocol = '2025-06-18';
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false },
});
const fields = {
  title: { type: 'string', maxLength: 200 },
  description: { type: 'string', maxLength: 10000 },
  status: { type: 'string', enum: ['inbox','refine','ready','progress','done'] },
  priority: { type: 'string', enum: ['low','medium','high'] },
  tags: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 20 },
};
export const tools = [
  tool('list_ideas', 'List and filter ideas in Idea Vault', {
    status: fields.status, priority: fields.priority,
    query: { type: 'string', maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 100 },
  }),
  tool('get_idea', 'Get an idea by UUID', { id: { type: 'string', format: 'uuid' } }, ['id']),
  tool('create_idea', 'Create an idea in Idea Vault', fields, ['title']),
  tool('update_idea', 'Update fields of an existing idea', { id: { type: 'string', format: 'uuid' }, ...fields }, ['id']),
  tool('delete_idea', 'Permanently delete an idea by UUID', { id: { type: 'string', format: 'uuid' } }, ['id']),
];
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const success = (data: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const failure = (message: string) => ({ content: [{ type: 'text', text: message }], isError: true });
export async function callTool(db: Database, name: string, args: unknown) {
  if (!isRecord(args)) return failure('Expected object arguments');
  if (name === 'list_ideas') {
    if (Object.keys(args).some(k => !['status','priority','query','limit'].includes(k))) return failure('Unknown filter');
    if (args.status !== undefined && !['inbox','refine','ready','progress','done'].includes(String(args.status))) return failure('Invalid status');
    if (args.priority !== undefined && !['low','medium','high'].includes(String(args.priority))) return failure('Invalid priority');
    if (args.query !== undefined && (typeof args.query !== 'string' || args.query.length > 200)) return failure('Invalid query');
    if (args.limit !== undefined && (!Number.isInteger(args.limit) || (args.limit as number) < 1 || (args.limit as number) > 100)) return failure('Invalid limit');
    const where: string[] = []; const bindings: (string | number)[] = [];
    if (args.status) { where.push('status = ?'); bindings.push(args.status as string); }
    if (args.priority) { where.push('priority = ?'); bindings.push(args.priority as string); }
    if (args.query) { where.push('(title LIKE ? OR description LIKE ?)'); const q = '%' + (args.query as string).replace(/[\\%_]/g, '\\$&') + '%'; bindings.push(q,q); }
    const sql = 'SELECT * FROM ideas' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY updated_at DESC LIMIT ?';
    const results = await db.prepare(sql).bind(...bindings, (args.limit as number | undefined) ?? 50).all();
    return success(results.results);
  }
  if (name === 'get_idea') {
    if (!uuid(args.id)) return failure('Invalid id');
    const result = await db.prepare('SELECT * FROM ideas WHERE id=?').bind(args.id).first();
    return result ? success(result) : failure('Idea not found');
  }
  if (name === 'create_idea') {
    const input = validateCreate(args);
    if (!input) return failure('Invalid idea fields');
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO ideas (id,title,description,status,priority,tags) VALUES (?,?,?,?,?,?)')
      .bind(id,input.title,input.description,input.status,input.priority,JSON.stringify(input.tags)).run();
    return success({ id, ...input });
  }
  if (name === 'update_idea') {
    if (!uuid(args.id)) return failure('Invalid id');
    const { id, ...patch } = args;
    const input = validatePatch(patch);
    if (!input) return failure('Invalid update fields');
    const keys = Object.keys(input);
    const values = keys.map(key => key === 'tags' ? JSON.stringify(input[key]) : input[key]);
    const result = await db.prepare('UPDATE ideas SET ' + keys.map(k => k + '=?').join(',') + ", updated_at=datetime('now') WHERE id=?")
      .bind(...values,id).run();
    return result.meta.changes ? success({ id, updated: true }) : failure('Idea not found');
  }
  if (name === 'delete_idea') {
    if (!uuid(args.id)) return failure('Invalid id');
    const result = await db.prepare('DELETE FROM ideas WHERE id=?').bind(args.id).run();
    return result.meta.changes ? success({ id: args.id, deleted: true }) : failure('Idea not found');
  }
  return failure('Unknown tool');
}
const rpcError = (id: RpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: '2.0', id, result });
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', 'mcp-protocol-version': protocol };
export async function handleMcp(request: Request, db: Database): Promise<Response> {
  if (request.method === 'GET') return new Response(null, { status: 405, headers: { Allow: 'POST, DELETE' } });
  if (request.method === 'DELETE') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST, DELETE' } });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) return Response.json(rpcError(null,-32600,'Content-Type must be application/json'), { status: 415, headers });
  if ((Number(request.headers.get('content-length')) || 0) > 65536) return new Response(null, { status: 413 });
  let data: unknown;
  try { data = await request.text(); if ((data as string).length > 65536) return new Response(null, { status: 413 }); data = JSON.parse(data as string); }
  catch { return Response.json(rpcError(null,-32700,'Parse error'), { status: 400, headers }); }
  if (!isRecord(data) || data.jsonrpc !== '2.0' || typeof data.method !== 'string' || (data.id !== undefined && data.id !== null && typeof data.id !== 'string' && typeof data.id !== 'number')) return Response.json(rpcError(null,-32600,'Invalid request'), { status: 400, headers });
  const rpc = data as RpcRequest;
  if (rpc.id === undefined) return new Response(null, { status: 202, headers });
  const id = rpc.id;
  try {
    if (rpc.method === 'initialize') return Response.json(rpcResult(id, { protocolVersion: protocol, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'idea-vault', version: '0.1.0' } }), { headers });
    if (rpc.method === 'ping') return Response.json(rpcResult(id, {}), { headers });
    if (rpc.method === 'tools/list') return Response.json(rpcResult(id, { tools }), { headers });
    if (rpc.method === 'tools/call') {
      if (!isRecord(rpc.params) || typeof rpc.params.name !== 'string') return Response.json(rpcError(id,-32602,'Invalid params'), { headers });
      return Response.json(rpcResult(id, await callTool(db,rpc.params.name,rpc.params.arguments ?? {})), { headers });
    }
    return Response.json(rpcError(id,-32601,'Method not found'), { headers });
  } catch {
    return Response.json(rpcError(id,-32603,'Internal error'), { headers });
  }
}
