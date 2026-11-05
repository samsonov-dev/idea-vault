import type { RequestMetrics } from '../observability';
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  OWNER_EMAIL: string;
  CF_ACCESS_SERVICE_TOKEN_ID?: string;
}
export type AppEnv = { Bindings: Env; Variables: { metrics: RequestMetrics } };
