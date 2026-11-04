# Idea Vault

Personal idea inbox built on Cloudflare Workers and D1. Public source code; private user data.

## Security

Cloudflare Access protects the app. The Worker independently validates signed Access JWTs and checks the owner's email. Do not publish secrets or database exports.

## Setup

1. Install dependencies: `npm install`
2. Create D1 database: `npx wrangler d1 create idea-vault`
3. Replace the placeholder database ID in `wrangler.jsonc`.
4. Apply migrations: `npm run db:remote`
5. Configure `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `OWNER_EMAIL` as Worker environment variables.
6. Configure a Cloudflare Access self-hosted application for the domain and all paths, allowing only the owner's Google email.
7. Disable the public `workers.dev` route or protect it equivalently.
8. Deploy: `npm run deploy`.

Do not deploy until Access is configured. Agent authentication and MCP are not yet implemented.

## Frontend architecture agreement (ADR-0001)

**Mantine is the primary UI component library.** Prefer Mantine components, hooks, theme tokens, and layouts before creating custom components or writing CSS. Custom components are limited to app-specific composition (such as an idea card or Kanban column); drag-and-drop uses dnd-kit because Mantine does not provide a Kanban DnD primitive. React 19 + Vite builds static assets served through the authenticated Cloudflare Worker. Keep the API and Access JWT validation in the Worker. Never expose D1 or credentials to the browser.

## Local development

Run `npm install`, then `npm run db:local` and `npm run dev`. The Worker intentionally denies requests without a valid Cloudflare Access JWT; local development requires a protected Access setup or a dedicated safe development authentication strategy. Do not bypass authentication in production.

## Production hostname

The production application hostname is **https://idea.samsonov-dev.com**. Configure Cloudflare Access for this exact hostname before manually running the deployment workflow. The workflow requires a D1 database UUID and Access readiness confirmation; it does not create the Access policy.
