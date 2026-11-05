# Browser regression tests

## Goal

Catch failures in real user interactions before publication, including the React event lifetime bug that blanks the application when typing into the idea form.

## Agreed approach

Use Playwright Test with Chromium and intercepted `/api/ideas` requests. Keep the existing Vitest tests for validation and backend behavior. Browser tests exercise the actual React application without Cloudflare credentials or production data. They do not validate authentication, D1 persistence, or the deployed Worker.

Run the primary suite against a production build served locally by Vite preview. Also run the typing regression against Vite development mode with the existing React StrictMode enabled, so development-only scheduling checks remain covered. Each test receives fresh in-memory API data; mutations update that data and subsequent GET responses. Unknown API requests fail rather than reaching an external service. Verify mutation payloads as well as visible results.

## Initial scenarios

1. Create an idea: type title and description character by character, change status and priority, add a tag, save, and verify the resulting card and submitted values.
2. Edit an existing idea and verify changed values in the card and a reopened form.
3. Cancel creation and verify that no mutation or card is produced.
4. Search and filter seeded ideas by priority and tags, then clear filters and verify restoration.
5. Return an API error on save, verify that an error message appears and form contents survive, then retry successfully.

The development regression types repeatedly into both text fields and changes both native selects. It verifies field values and that the modal and application remain visible. Prove the regression by temporarily restoring the old handlers, observing failure, restoring the fix, and observing success. Never commit the temporary regression.

## Reliability and diagnostics

Use accessible labels and roles, scoped to the dialog or card where necessary. Use Playwright assertions to await UI state, without fixed sleeps. Collect uncaught page errors from before navigation and fail the test if any occur. Use isolated browser contexts and deterministic fixtures. Start with a desktop Chromium viewport; cross-browser, mobile, drag-and-drop, screenshot baselines, and PWA lifecycle tests are outside this initial scope.

Retain traces and screenshots for failures and upload reports from GitHub Actions even when tests fail. Do not use retries to turn an initial failure into an accepted successful validation.

## Commands and integration

Expose a documented browser-test command, separate from `pnpm test`. Configure Vitest discovery so it does not collect Playwright specs. Keep generated reports and test artifacts out of Git.

Both PR CI and the production deployment workflow install Chromium and run browser tests after the existing typecheck, unit tests, and production build. In the deployment job, browser-test failure must stop execution before remote migrations or deployment. Preserve the existing manually dispatched deployment authorization and configuration validation.

## Acceptance

- Existing typecheck, build, and Vitest tests pass.
- All browser scenarios pass locally.
- The original form handlers make the typing regression fail; fixed handlers pass.
- CI and deployment both require successful browser checks before publishing.
- README explains how to install the browser, run tests, and inspect failure reports.
