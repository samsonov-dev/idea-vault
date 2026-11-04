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
