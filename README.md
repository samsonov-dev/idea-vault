# Idea Vault

Personal idea inbox built on Cloudflare Workers and D1. Public source code; private user data.

## Security

Cloudflare Access protects the app. The Worker independently validates signed Access JWTs and checks the owner's email. Do not publish secrets or database exports.

## Setup

1. Use Node.js 26.13.0 (see `.node-version`) and pnpm 12.16.1 (`npm install --global pnpm@12.16.1`), then install dependencies: `pnpm install --frozen-lockfile`
2. Create D1 database: `pnpm exec wrangler d1 create idea-vault`
3. Replace the placeholder database ID in `wrangler.jsonc`.
4. Apply migrations: `pnpm run db:remote`
5. Configure `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `OWNER_EMAIL` as Worker environment variables.
6. Configure a Cloudflare Access self-hosted application for the domain and all paths, allowing only the owner's Google email.
7. Disable the public `workers.dev` route or protect it equivalently.
8. Deploy: `pnpm run deploy`.

Do not deploy until Access is configured. MCP is available at `/mcp`; service identities are restricted to that endpoint.

## Frontend architecture agreement (ADR-0001)

**Mantine is the primary UI component library.** Prefer Mantine components, hooks, theme tokens, and layouts before creating custom components or writing CSS. Custom components are limited to app-specific composition (such as an idea card or Kanban column); drag-and-drop uses dnd-kit because Mantine does not provide a Kanban DnD primitive. React 19 + Vite builds static assets served through the authenticated Cloudflare Worker. Keep the API and Access JWT validation in the Worker. Never expose D1 or credentials to the browser.

## Local development

Use the Node.js version in `.node-version`. Run `pnpm install --frozen-lockfile`, then `pnpm run db:local` and `pnpm run dev`. The Worker intentionally denies requests without a valid Cloudflare Access JWT; local development requires a protected Access setup or a dedicated safe development authentication strategy. Do not bypass authentication in production.

## Браузерные тесты

Первичная установка Chromium: `pnpm exec playwright install chromium`.
В Linux/CI используйте `pnpm exec playwright install --with-deps chromium`.

```sh
pnpm run typecheck
pnpm test
pnpm run build
pnpm run test:browser
```

Playwright сам запускает локальные серверы на портах 4173 и 5174; перед запуском
они должны быть свободны. После изменения кода заново выполните сборку.
Основные сценарии работают на сборке для публикации, а проверка ввода текста
дополнительно запускается в режиме разработки с React StrictMode.
Запуск только этой проверки: `pnpm run test:browser --project chromium-development`.
Для наблюдения за браузером добавьте `--headed`.

Тесты проверяют создание и редактирование идеи, отмену, поиск и фильтры,
а также повторное сохранение после ошибки. Каждый тест отслеживает необработанные
ошибки JavaScript. API подменяется изолированными данными в памяти: Cloudflare
Access и D1 в этих тестах не участвуют, рабочие данные не используются.
Service Worker отключён в тестовом браузере для надёжного перехвата запросов;
жизненный цикл PWA этим набором не проверяется. `pnpm test` запускает только Vitest.

Отчёт: `pnpm run test:browser:report`. При падении скриншоты и трассировки остаются
в `output/playwright/results/`; открыть трассировку можно командой
`pnpm exec playwright show-trace <путь-к-trace.zip>`.
CI и процесс публикации загружают отчёты в артефакты GitHub Actions на 7 дней,
включая неуспешные запуски. Падение теста блокирует миграции рабочей БД и деплой
в процессе публикации; автоматические повторные попытки отключены.

## Production hostname

The production application hostname is **https://idea.samsonov-dev.com**. Configure Cloudflare Access for this exact hostname before manually running the deployment workflow. The workflow requires a D1 database UUID and Access readiness confirmation; it does not create the Access policy.

## Dependency updates

Dependabot checks pnpm dependencies (using the npm ecosystem) and GitHub Actions every Monday at 09:00 (Asia/Tbilisi). Related Mantine, React, and Vite packages are grouped to keep upgrades compatible. Updates require the existing CI checks before review and merge. Node.js is pinned in `.node-version`; update that file and `engines.node` together when upgrading Node.js.

## Backend architecture

The backend runs on Hono inside the existing Cloudflare Worker. D1, Access policies,
static asset bindings, and the deployment workflow remain unchanged.

- `src/index.ts`: Worker entry point.
- `src/backend/app.ts`: Hono routes, authentication middleware, telemetry, and asset serving.
- `src/backend/auth.ts`: Cloudflare Access JWT verification.
- `src/backend/ideas-service.ts`: shared D1 operations used by REST and MCP.
- `src/backend/types.ts`: Worker bindings and request context.
- `src/mcp.ts`: MCP protocol and tool validation.

REST endpoints and response shapes are preserved, including JSON-encoded tags.
Every request uses one metrics instance for auth, handler, and MCP operations.
Failures return sanitized errors; arbitrary paths, SQL errors, and tool inputs are not logged.
