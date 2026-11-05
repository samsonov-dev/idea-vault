import { app } from './backend/app';
import type { Env } from './backend/types';
export type { Env } from './backend/types';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
