# Diagnosing slow MCP requests

Workers Logs and Traces are enabled in `wrangler.jsonc`. Both sample 100% of
requests during initial diagnosis; lower `head_sampling_rate` when traffic grows.
Deploying the branch activates this configuration. No external telemetry service
or additional binding is required.

In Cloudflare Dashboard, open **Workers & Pages → idea-vault → Observability**.
Find `/mcp` invocations and open a trace to inspect the waterfall:

- `handler`: application handling through response creation.
- `auth`: Access JWT validation, including the JWKS fetch on cache misses.
- `tool.list_ideas` (or another known tool): validation and database work.
- Automatic platform spans: outbound fetches and D1 operations.

`handler` contains `auth` and tool spans: do not add their durations together.
Timings end when a response is created, not when its body finishes streaming.
Platform wall time may also include background work and is not a direct measure
of client-observed latency.

Structured log fields:

| Event | Fields |
| --- | --- |
| `request` | `requestId`, `method`, normalized `route`, `status`, `durationMs` |
| `operation` | `requestId`, `operation`, `durationMs`, `outcome` |
| `mcp` | `requestId`, allowlisted `method` |
| `mcp.result` | `requestId`, `method`, allowlisted `tool`, `isError` |
| `mcp.error` | `requestId`, `method`, JSON-RPC error `code` |

Filter logs by `requestId` to join these events. JSON-RPC failures can return HTTP
200, so monitor `mcp.error` and `mcp.result.isError` as well as HTTP 5xx.
Use request duration percentiles (p50/p95/p99), operation durations, request counts,
and error counts in Observability queries/charts. Separate `/mcp` from assets.

Responses expose `X-Request-Id` and `Server-Timing` (milliseconds) for direct HTTP
measurements. An intermediary may not forward these headers to ChatGPT. Correlate
the same request using gateway logs when available; a short Worker trace alone
cannot locate a delay in ChatGPT, the MCP connector, Access before the Worker,
or the network. Compare repeated direct requests and connector requests rather
than attributing one total connector duration to server execution.

Application logs omit JWTs, authorization headers, tool arguments, idea contents,
SQL, raw exception messages, RPC IDs, and arbitrary URL paths. Review platform
telemetry and export settings separately before adding sensitive span attributes.
