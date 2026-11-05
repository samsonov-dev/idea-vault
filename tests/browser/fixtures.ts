import { test as base, expect } from '@playwright/test';
import type { Idea } from '../../src/ui/types';

type Input = Omit<Idea, 'id' | 'tags' | 'created_at' | 'updated_at'> & { tags: string[] };
type Mutation = { method: string; path: string; body: Partial<Input> | null };
type MockApi = { ideas: Idea[]; mutations: Mutation[]; failNextSave: boolean };

export function idea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'План путешествия', description: 'Маршрут по Грузии',
    status: 'inbox', priority: 'medium', tags: '["личное"]',
    created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z',
    ...overrides,
  };
}

export const test = base.extend<{ api: MockApi }>({
  api: async ({ page }, use) => {
    const api: MockApi = { ideas: [], mutations: [], failNextSave: false };
    const failures: string[] = [];
    const onError = (error: Error) => failures.push(error.stack ?? error.message);
    page.on('pageerror', onError);
    // Catch every API request before navigation. Unknown requests must never reach a real backend.
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      if (path === '/api/ideas' && method === 'GET') {
        await route.fulfill({ json: api.ideas });
        return;
      }
      const existing = api.ideas.find(item => path === `/api/ideas/${item.id}`);
      if ((path === '/api/ideas' && method === 'POST') ||
          (existing && (method === 'PATCH' || method === 'DELETE'))) {
        const body = method === 'DELETE' ? null : request.postDataJSON() as Partial<Input>;
        api.mutations.push({ method, path, body });
        if (api.failNextSave && method !== 'DELETE') {
          api.failNextSave = false;
          await route.fulfill({ status: 500, json: { error: 'Internal error' } });
          return;
        }
        if (method === 'DELETE') {
          api.ideas = api.ideas.filter(item => item !== existing);
        } else {
          const changes = { ...body, ...(body?.tags ? { tags: JSON.stringify(body.tags) } : {}) } as Partial<Idea>;
          if (existing) Object.assign(existing, changes);
          else api.ideas.push(idea({ ...changes, id: '00000000-0000-4000-8000-000000000099' }));
        }
        await route.fulfill({ status: method === 'POST' ? 201 : 200,
          json: method === 'POST' ? { id: api.ideas.at(-1)!.id } : { ok: true } });
        return;
      }
      failures.push(`Unexpected API request: ${method} ${path}`);
      await route.fulfill({ status: 501, json: { error: 'Unexpected test request' } });
    });
    try {
      await use(api);
    } finally {
      page.off('pageerror', onError);
      expect(failures, 'No uncaught JavaScript errors or unexpected API requests').toEqual([]);
    }
  },
});

// Every browser scenario uses the error guard and API interception, including tests without mutations.
test.beforeEach(async ({ api }) => { void api; });
export { expect };
