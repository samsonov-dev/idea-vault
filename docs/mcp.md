# Idea Vault MCP

The existing Worker exposes a stateless [Streamable HTTP MCP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) endpoint:

`https://idea.samsonov-dev.com/mcp`

It supports `initialize`, `ping`, `tools/list`, `tools/call` and notification acknowledgements. Tools: `list_ideas`, `get_idea`, `create_idea`, `update_idea`, `delete_idea`. The tools operate on the same D1 database as the web UI. The endpoint is protected by Cloudflare Access, not a public API.

## Agent authentication

The current Access application allows the owner's Google login for the browser. To enable non-interactive agents:

1. In Cloudflare Zero Trust, create a **Service Token** for Idea Vault. Save the **Client ID** and **Client Secret** in a password manager. The secret is displayed only when created. Never commit it or paste it in a chat.
2. Add an Access policy to the **Idea Vault** self-hosted application that allows **only this specific Service Token**, not *Any valid service token*. Preserve the existing owner-only Google policy.
3. Configure Worker variable `CF_ACCESS_SERVICE_TOKEN_ID` to the identity from the verified service-token JWT (`sub` or `common_name`). This is deliberately **not** set by default: until it is configured, machine identities cannot pass the Worker-level authorization check. Do not configure the secret as a Worker variable.
4. Send the following HTTP headers from your MCP client (over HTTPS):

   `CF-Access-Client-Id: <client id>`

   `CF-Access-Client-Secret: <client secret>`

Cloudflare Access authenticates the service token and supplies a signed JWT to the Worker. The Worker verifies the JWT's signature, issuer, audience, expiry and pinned service identity. Service identities can call **only** `/mcp`; the web UI and REST API remain owner-only.

### Claude Code

Store secrets in environment variables on your machine. Example:

```bash
claude mcp add --transport http idea-vault https://idea.samsonov-dev.com/mcp \
  --header "CF-Access-Client-Id: $IDEA_VAULT_CF_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $IDEA_VAULT_CF_CLIENT_SECRET"
```

Note: depending on your Claude Code version, this may persist expanded header values in its MCP configuration. Check file permissions and avoid committing that configuration.

### Codex

In `~/.codex/config.toml`, configure the remote server with environment-backed headers (keep secrets out of the file):

```toml
[mcp_servers.idea_vault]
url = "https://idea.samsonov-dev.com/mcp"

[mcp_servers.idea_vault.env_http_headers]
CF-Access-Client-Id = "IDEA_VAULT_CF_CLIENT_ID"
CF-Access-Client-Secret = "IDEA_VAULT_CF_CLIENT_SECRET"
```

Export both environment variables before launching Codex. Restart the agent and verify that the five tools appear. Service-token authorization and JWT identity pinning must be completed first.

## Example JSON-RPC request

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_idea","arguments":{"title":"Refactor authentication","priority":"high","status":"inbox","tags":["frontend"]}}}
```

`tools/call` errors are reported as `isError: true` in the JSON-RPC result. There are no server-side sessions; clients should use JSON POST requests and accept JSON responses.

## Security notes

- Never use an Access bypass policy for the MCP endpoint.
- Never add service token credentials to the frontend or GitHub repository.
- Rotate a leaked service token in Cloudflare and update your local client secrets.
- Service-token access permits **write and delete** actions through MCP; restrict the credential to trusted agents.
