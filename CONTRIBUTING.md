# Contributing to ShipCheck

Use Node 20.9+ and npm. Install with `npm ci`, then `npm run browsers:install` (Linux may need `npx playwright install --with-deps chromium`). Run `npm run dev` for the local dashboard.

Keep scanner logic in `packages/scanner` and share its types with CLI and web. New DOM checkers should implement `PageChecker` in `checkers.ts`; never turn untrusted page content into instructions or execute suggested fixes. Add severity and evidence deliberately. Never replace recorded results with sample or generated findings.

Before a pull request run:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run scan -- https://a-public-site-you-control --max-pages 1
```

For changed network policy, add regression tests for private addresses, redirects and off-origin/mutation requests. Use the isolated integration fixture for reproducible failures; do not relax production protections to make tests pass. Do not commit browser binaries, API keys, `.env` files, scan evidence or local history.

Describe the problem, resulting behavior, tests executed, and known limitations in the PR. Include redacted desktop/mobile screenshots for visible UI changes. Report security problems privately to the repository maintainer rather than posting credentials or sensitive evidence in public issues.
