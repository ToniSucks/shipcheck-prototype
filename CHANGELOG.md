# Changelog

## 0.1.0 — Prototype — 2026-10-30

Initial working prototype of ShipCheck.

- Real Chromium scanning on desktop and mobile, with bounded same-origin crawling.
- Broken internal links, HTTP failures, JavaScript exceptions, console errors, and mobile overflow checks.
- Recorded screenshots, structured JSON evidence, deterministic scoring, and HTML reports.
- Next.js dashboard with progress, local scan history, filters, and issue details.
- CLI and optional OpenAI explanations; core scans require no paid key.
- Public-address validation, DNS-pinned egress, request limits, and local API protections.
- Unit and Chromium integration tests, contributor documentation, MIT license, and GitHub Actions CI.

### Prototype limitations

Single persistent local process; third-party resources are blocked; no authenticated flows, accessibility audit, or Lighthouse scores. The live key-enabled AI path remains unverified. See README.md for details and the roadmap.
