import type { IdeaInput } from '../idea-validation';

export class IdeasService {
  constructor(private readonly db: D1Database) {}

  async list(limit = 500, filters: { status?: string; priority?: string; query?: string } = {}) {
    const where: string[] = [];
    const bindings: (string | number)[] = [];
    if (filters.status) { where.push('status = ?'); bindings.push(filters.status); }
    if (filters.priority) { where.push('priority = ?'); bindings.push(filters.priority); }
    if (filters.query) {
      where.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
      const query = '%' + filters.query.replace(/[\\%_]/g, '\\$&') + '%';
      bindings.push(query, query);
    }
    const result = await this.db.prepare('SELECT * FROM ideas' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY updated_at DESC LIMIT ?')
      .bind(...bindings, limit).all();
    return result.results;
  }

  get(id: string) {
    return this.db.prepare('SELECT * FROM ideas WHERE id=?').bind(id).first();
  }

  async create(input: IdeaInput) {
    const id = crypto.randomUUID();
    await this.db.prepare('INSERT INTO ideas (id,title,description,status,priority,tags) VALUES (?,?,?,?,?,?)')
      .bind(id,input.title,input.description,input.status,input.priority,JSON.stringify(input.tags)).run();
    return { id, ...input };
  }

  async update(id: string, input: Record<string, string | string[]>) {
    const keys = Object.keys(input);
    const values = keys.map(key => key === 'tags' ? JSON.stringify(input[key]) : input[key]);
    const result = await this.db.prepare('UPDATE ideas SET ' + keys.map(k => k + '=?').join(',') + ", updated_at=datetime('now') WHERE id=?")
      .bind(...values,id).run();
    return Boolean(result.meta.changes);
  }

  async delete(id: string) {
    const result = await this.db.prepare('DELETE FROM ideas WHERE id=?').bind(id).run();
    return Boolean(result.meta.changes);
  }
}
