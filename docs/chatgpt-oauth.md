# ChatGPT OAuth integration (implementation design)

Status: **in progress — not deployed**.

## Why a separate hostname is required

The existing `idea.samsonov-dev.com` is protected by Cloudflare Access. ChatGPT cannot discover OAuth metadata or exchange authorization codes while that protection intercepts requests. Do **not** add a Bypass policy to the existing Idea Vault Access application: that would expose the web UI and API.

Use two origins on the same Worker:

- `https://idea.samsonov-dev.com` — existing owner-only Cloudflare Access Google login, UI, API and OAuth consent/approval.
- `https://mcp.samsonov-dev.com` — public *transport* for OAuth discovery, OAuth client registration, token exchange and `/mcp`; the Worker must reject unauthenticated requests and validate access tokens on every MCP request.

The public MCP hostname must not serve the UI or `/api/*`.

## OAuth requirements

- RFC 8414 authorization-server metadata at `/.well-known/oauth-authorization-server`.
- RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource/mcp` and optionally root.
- Authorization Code + PKCE S256 only; no implicit flow, no password flow.
- Dynamic client registration (RFC 7591) restricted to expected HTTPS redirect origins, or a manually registered public client. Never accept arbitrary redirect URI origins.
- Consent through the existing Google-protected `idea.samsonov-dev.com`, with anti-CSRF protection and exact `redirect_uri` matching.
- Short-lived single-use authorization codes; hashed codes in D1, atomic consumption, fixed client and redirect, expiry.
- Short-lived opaque access tokens, stored hashed in D1; verify scope, audience, expiry and revocation on each `/mcp` call.
- Rate-limit client registration, authorization and token endpoints; never log authorization codes, bearer tokens, or secrets.
- Enforce MCP tool authorization, including separate read and write scopes; destructive tools should be explicitly approved in ChatGPT.
- CORS only as required for discovery; no wildcard credentialed CORS.
- Preserve Cloudflare Access service-token authentication for local Codex; preserve Google owner access for the web UI.
- Include integration tests for redirect URI attacks, missing/wrong PKCE, code replay, expired tokens, wrong audience, unauthenticated MCP and attempts to reach the UI on the public host.

## Deployment prerequisites

1. Configure `mcp.samsonov-dev.com` as a second Worker custom domain, **outside** the existing Cloudflare Access application.
2. Update the deploy workflow to bind both custom domains.
3. Publish discovery endpoints and OAuth implementation only after tests pass.
4. Connect ChatGPT via `https://mcp.samsonov-dev.com/mcp`, not the Access-protected UI hostname.

Do not put the existing Cloudflare Access Service Token Client Secret into ChatGPT's OAuth client-secret field. They are different protocols.
