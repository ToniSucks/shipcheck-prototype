import { chromium, type Browser, type BrowserContext } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { scanInput, internalLinks, normalizeUrl } from './url';
import { resolveTarget } from './safety';
import { createSafeProxy } from './proxy';
import { deduplicateIssues, scoreIssues } from './scoring';
import { mobileOverflow, type PageChecker } from './checkers';
import type { Issue, ScanReport, ScanProgress, Viewport } from './types';
export interface ScannerOptions {
  url: string;
  maxPages?: number;
  mobile?: boolean;
  outputDir: string;
  id?: string;
  onProgress?: (progress: ScanProgress) => void;
  checkers?: PageChecker[];
  /** Strictly test-only. Ignored unless NODE_ENV=test; never exposed through CLI or API. */
  allowLoopbackForTests?: boolean;
  durationMs?: number;
}
export async function scanSite(options: ScannerOptions): Promise<ScanReport> {
  const input = scanInput.parse({
    url: options.url,
    maxPages: options.maxPages,
    mobile: options.mobile,
  });
  const id = options.id ?? randomUUID();
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw new Error('Invalid scan ID');
  const started = Date.now(),
    deadline = Math.min(120000, Math.max(1000, options.durationMs ?? 120000));
  const screenshotDir = join(options.outputDir, id, 'screenshots');
  await mkdir(screenshotDir, { recursive: true });
  const report: ScanReport = {
    version: 1,
    id,
    url: input.url,
    startedAt: new Date(started).toISOString(),
    finishedAt: '',
    durationMs: 0,
    status: 'completed',
    score: 100,
    counts: { critical: 0, high: 0, medium: 0, low: 0 },
    options: { maxPages: input.maxPages, mobile: input.mobile },
    pages: [],
    issues: [],
    warnings: [],
  };
  const findings: Omit<Issue, 'id'>[] = [];
  const origin = new URL(input.url).origin,
    queue = [input.url],
    scheduled = new Set(queue),
    visited = new Set<string>();
  const sources = new Map<string, string>();
  let browser: Browser | undefined,
    context: BrowserContext | undefined,
    expired = false;
  let requestTotal = 0,
    limitedRequests = false,
    limitedFindings = false;
  const requestCounts = new WeakMap<import('playwright').Page, number>();
  let proxy: Awaited<ReturnType<typeof createSafeProxy>> | undefined;
  const emit = (phase: ScanProgress['phase'], currentUrl?: string) =>
    options.onProgress?.({
      phase,
      currentUrl,
      pagesScanned: new Set(report.pages.map((p) => p.url)).size,
      pagesDiscovered: scheduled.size,
      issuesFound: deduplicateIssues(findings).length,
    });
  const timer = setTimeout(() => {
    expired = true;
    void context?.close().catch(() => {});
    void browser?.close().catch(() => {});
  }, deadline);
  try {
    emit('launching');
    await resolveTarget(input.url, options.allowLoopbackForTests);
    proxy = await createSafeProxy(origin, options.allowLoopbackForTests);
    browser = await chromium.launch({
      headless: true,
      proxy: proxy.config,
      timeout: 20000,
      args: [
        '--proxy-bypass-list=<-loopback>',
        '--disable-quic',
        '--disable-background-networking',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ],
    });
    if (expired) throw new Error('Scan duration limit reached.');
    context = await browser.newContext({
      serviceWorkers: 'block',
      acceptDownloads: false,
      userAgent: 'ShipCheck/0.1 (read-only website QA; Chromium)',
    });
    context.setDefaultTimeout(5000);
    await context.routeWebSocket('**/*', (socket) => socket.close());
    context.on('page', (page) => {
      if (context && context.pages().length > 1) void page.close();
    });
    await context.route('**/*', async (route) => {
      const request = route.request();
      try {
        const url = new URL(normalizeUrl(request.url()));
        const owner = request.frame().page();
        const count = (requestCounts.get(owner) ?? 0) + 1;
        requestCounts.set(owner, count);
        requestTotal++;
        if (count > 300 || requestTotal > 2000) {
          limitedRequests = true;
          await route.abort('blockedbyclient');
          return;
        }
        let hops = 0,
          prior = request.redirectedFrom();
        while (prior) {
          hops++;
          prior = prior.redirectedFrom();
        }
        if (
          url.origin !== origin ||
          !['GET', 'HEAD'].includes(request.method()) ||
          hops > 5 ||
          expired
        ) {
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      } catch {
        await route.abort('blockedbyclient').catch(() => {});
      }
    });
    let pageCount = 0;
    while (queue.length && pageCount < input.maxPages && !expired) {
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);
      pageCount++;
      for (const viewport of (input.mobile
        ? ['desktop', 'mobile']
        : ['desktop']) as Viewport[]) {
        if (expired) break;
        emit('crawling', url);
        const page = await context.newPage();
        await page.setViewportSize(
          viewport === 'desktop'
            ? { width: 1440, height: 900 }
            : { width: 375, height: 812 },
        );
        const pageStarted = Date.now(),
          pageFindings: Omit<Issue, 'id'>[] = [];
        const add = (finding: Omit<Issue, 'id' | 'pageUrl' | 'viewport'>) => {
          if (
            pageFindings.length < 100 &&
            findings.length + pageFindings.length < 1000
          )
            pageFindings.push({ ...finding, pageUrl: url, viewport });
          else limitedFindings = true;
        };
        page.on('pageerror', (error) =>
          add({
            type: 'javascript-error',
            severity: 'high',
            description: error.message.slice(0, 500),
            evidence: {
              message: error.message.slice(0, 2000),
              stack: error.stack?.slice(0, 4000),
            },
          }),
        );
        page.on('console', (message) => {
          if (message.type() === 'error')
            add({
              type: 'console-error',
              severity: 'low',
              description: message.text().slice(0, 500),
              evidence: {
                message: message.text().slice(0, 2000),
                url: message.location().url,
              },
            });
        });
        page.on('response', (response) => {
          if (response.status() >= 400)
            add({
              type: 'http-error',
              severity: response.status() >= 500 ? 'high' : 'medium',
              description: `HTTP ${response.status()} returned by ${response.url().slice(0, 300)}`,
              evidence: { url: response.url(), status: response.status() },
            });
        });
        let status: number | undefined;
        try {
          const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: Math.min(
              15000,
              Math.max(1, deadline - (Date.now() - started)),
            ),
          });
          status = response?.status();
          await page.waitForTimeout(500);
          if (status && status >= 400 && sources.has(url))
            add({
              type: 'broken-link',
              severity: 'medium',
              description: `Internal link returns HTTP ${status}.`,
              evidence: { url, status, sourcePage: sources.get(url) },
            });
          const finalUrl = normalizeUrl(page.url());
          visited.add(finalUrl);
          if (
            viewport === 'desktop' &&
            status &&
            status < 400 &&
            new URL(finalUrl).origin === origin
          ) {
            const links = internalLinks(
              await page
                .locator('a[href]')
                .evaluateAll((els) =>
                  els.slice(0, 500).map((el) => (el as HTMLAnchorElement).href),
                ),
              finalUrl,
              origin,
            );
            for (const link of links)
              if (
                !scheduled.has(link) &&
                !visited.has(link) &&
                scheduled.size < 300
              ) {
                scheduled.add(link);
                sources.set(link, finalUrl);
                queue.push(link);
              }
          }
          const checkers = [
            ...(viewport === 'mobile' ? [mobileOverflow] : []),
            ...(options.checkers ?? []),
          ];
          for (const checker of checkers) {
            for (const finding of await checker.check(page)) add(finding);
          }
        } catch (error) {
          add({
            type: 'navigation-error',
            severity: 'high',
            description: 'Page navigation or inspection could not finish.',
            evidence: {
              message: String(error).slice(0, 2000),
              url,
              sourcePage: sources.get(url),
            },
          });
          report.status = 'partial';
        }
        let screenshot: string | undefined;
        if (pageFindings.length && !page.isClosed()) {
          screenshot = `screenshots/${report.pages.length}-${viewport}.png`;
          try {
            await page.screenshot({
              path: join(options.outputDir, id, screenshot),
              fullPage: false,
              timeout: 4000,
            });
          } catch {
            screenshot = undefined;
            report.warnings.push(
              `Screenshot unavailable for ${url} (${viewport}).`,
            );
          }
        }
        for (const issue of pageFindings) issue.screenshot = screenshot;
        findings.push(...pageFindings);
        report.pages.push({
          url,
          finalUrl: page.isClosed() ? url : page.url(),
          viewport,
          status,
          durationMs: Date.now() - pageStarted,
          screenshot,
          issueIds: deduplicateIssues(pageFindings).map((issue) => issue.id),
        });
        await page.close().catch(() => {});
        emit('crawling', url);
      }
    }
    if (queue.length)
      report.warnings.push(
        'Crawl stopped at the configured page or duration limit. Unvisited links were not checked.',
      );
  } catch (error) {
    report.status = report.pages.length ? 'partial' : 'failed';
    report.warnings.push(String(error).slice(0, 2000));
  } finally {
    clearTimeout(timer);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await proxy?.close();
  }
  if (expired) {
    report.status = report.pages.length ? 'partial' : 'failed';
    report.warnings.push(
      'Scan reached its duration limit (maximum 120 seconds).',
    );
  }
  if (limitedRequests) {
    report.status = report.pages.length ? 'partial' : 'failed';
    report.warnings.push(
      'Network request limit reached; some resources were not loaded.',
    );
  }
  if (limitedFindings) {
    report.status = 'partial';
    report.warnings.push('Issue limit reached; some findings were omitted.');
  }
  report.issues = deduplicateIssues(findings);
  Object.assign(report, scoreIssues(report.issues));
  // Failed scans have no meaningful quality score; UIs must display unavailable, not a passing score.
  report.durationMs = Date.now() - started;
  report.finishedAt = new Date().toISOString();
  report.warnings.unshift(
    'Only same-origin GET/HEAD requests were allowed. Third-party scripts, APIs, fonts, and assets were blocked; this can affect rendering and produce errors.',
  );
  emit('complete');
  return report;
}
