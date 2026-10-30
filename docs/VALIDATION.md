# ShipCheck validation — October 30, 2026

Completed in the current workspace on Windows with Node 24.14.0.

- `npm test`: PASS — 40 tests across 3 suites; includes real Playwright Chromium integration tests.
- `npm run lint`: PASS — no errors or warnings.
- `npm run typecheck`: PASS — scanner, CLI, tests, and Next.js dashboard.
- `npm run build`: PASS — optimized Next.js 16.4.3 production build, including all API routes and local Host proxy.
- Additional clean-source dashboard TypeScript check (without generated Next route declarations): PASS.
- Production server smoke check: PASS — real public scan, 202/poll/report flow, duplicate job reuse, 409 for competing scans, JSON download, existing screenshot delivery, blocked private URL, rejected cross-origin/hostile Host requests, and graceful missing-AI-key response.
- Real CLI scan of Wikipedia: completed, one URL in both viewports, JSON + HTML exports.
- Real CLI and dashboard scans of HTTPBin's intentional HTTP 500 endpoint: completed, four findings, score 76/100, screenshot evidence.
- Browser QA: desktop rendering, scan settings, real scan progress/results, severity filtering, issue details/screenshots, no-key AI state, persisted history after reload, history navigation, and mobile breakpoint inspected. Mobile page content width equaled viewport width.

The first example.com CLI attempt failed DNS resolution in this environment and correctly produced a failed report with unavailable UI score. Public Wikipedia and HTTPBin verification succeeded. Windows sandbox file-rename restrictions required running Vitest and the build outside the sandbox; the successful results above are from actual executions.

No paid OpenAI request was made; the live key-enabled explanation path remains unverified. GitHub Actions CI is configured but was not run on GitHub. Core scanner results are observed data; no seed/demo findings are displayed as real results.

Known limits: a single persistent local web process; strict origin policy blocks third-party resources and affects rendering; 30-page/120-second maximum coverage; no authenticated interaction, accessibility audit, Lighthouse metrics, or OS-level resource isolation. See README.md for the full policy and roadmap.

Development and production verification servers were stopped after QA. Run `npm run dev` to reopen the dashboard.
