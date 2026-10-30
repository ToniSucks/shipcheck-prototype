import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanSite, writeReport, scoreIssues } from '../packages/scanner/src';
let server: http.Server,
  forbidden: http.Server,
  url: string,
  forbiddenUrl: string,
  directory: string;
let mutations = 0,
  outside = 0;
const hits = new Map<string, number>();
async function listen(server: http.Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'shipcheck-test-'));
  forbidden = http.createServer((_req, res) => {
    outside++;
    res.end('Never visit');
  });
  forbiddenUrl = await listen(forbidden);
  server = http.createServer((req, res) => {
    hits.set(req.url!, (hits.get(req.url!) ?? 0) + 1);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      mutations++;
      res.end('Mutation');
      return;
    }
    if (req.url === '/missing') {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>Missing</h1>');
      return;
    }
    if (req.url === '/server-error') {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>Server error</h1>');
      return;
    }
    if (req.url === '/alias') {
      res.writeHead(302, { Location: '/good' });
      res.end();
      return;
    }
    if (req.url === '/escape') {
      res.writeHead(302, { Location: forbiddenUrl });
      res.end();
      return;
    }
    if (req.url === '/loop') {
      res.writeHead(302, { Location: '/loop' });
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    if (req.url === '/noisy') {
      res.end(
        '<!doctype html><title>Noisy fixture</title><script>for(let i=0;i<150;i++) console.error("noise "+i)</script>',
      );
      return;
    }
    if (req.url === '/slow') {
      const timer = setTimeout(() => res.end('Late response'), 10000);
      res.on('close', () => clearTimeout(timer));
      return;
    }
    if (req.url === '/good') {
      res.end('<!doctype html><title>Good</title><h1>Good page</h1>');
      return;
    }
    res.end(
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Broken fixture</title><h1>QA fixture</h1><div id="too-wide" style="width:700px">Overflows mobile only</div><a href="/missing">Broken</a><a href="/missing#duplicate">Same</a><a href="/server-error">Error</a><a href="/alias">Redirect</a><a href="/good">Good</a><a href="/escape">Outside redirect</a><a href="${forbiddenUrl}">Outside</a><a href="/loop">Loop</a><button onclick="fetch('/purchase',{method:'POST'})">Do not click</button><script>console.error('fixture console error');console.error('fixture console error');fetch('/mutation',{method:'POST'}).catch(()=>{});fetch('${forbiddenUrl}').catch(()=>{});setTimeout(()=>{throw new Error('fixture exception')},50)</script>`,
    );
  });
  url = await listen(server);
});
afterAll(async () => {
  server?.closeAllConnections();
  forbidden?.closeAllConnections();
  await Promise.all([
    new Promise<void>((resolve) => server?.close(() => resolve())),
    new Promise<void>((resolve) => forbidden?.close(() => resolve())),
  ]);
  await rm(directory, { recursive: true, force: true });
});
describe('real Chromium integration', () => {
  it('detects actual defects, captures evidence, respects scope, deduplicates and exports', async () => {
    const report = await scanSite({
      url,
      maxPages: 8,
      mobile: true,
      outputDir: directory,
      allowLoopbackForTests: true,
    });
    expect(report.status).toBe('partial');
    expect(
      report.issues.some(
        (i) =>
          i.type === 'broken-link' &&
          i.evidence.status === 404 &&
          i.evidence.sourcePage === url + '/',
      ),
    ).toBe(true);
    expect(
      report.issues.some(
        (i) => i.type === 'http-error' && i.evidence.status === 500,
      ),
    ).toBe(true);
    expect(
      report.issues.some(
        (i) =>
          i.type === 'javascript-error' &&
          i.evidence.message?.includes('fixture exception'),
      ),
    ).toBe(true);
    expect(
      report.issues.filter(
        (i) =>
          i.type === 'console-error' &&
          i.evidence.message === 'fixture console error',
      ),
    ).toHaveLength(2);
    expect(
      report.issues.some(
        (i) =>
          i.type === 'mobile-overflow' &&
          i.viewport === 'mobile' &&
          i.evidence.documentWidth! > 375,
      ),
    ).toBe(true);
    expect(
      report.issues.some(
        (i) => i.type === 'mobile-overflow' && i.viewport === 'desktop',
      ),
    ).toBe(false);
    expect(
      new Set(report.pages.map((p) => `${p.url}:${p.viewport}`)).size,
    ).toBe(report.pages.length);
    expect(hits.get('/missing')).toBe(2);
    expect(hits.get('/good')).toBe(2);
    expect(mutations).toBe(0);
    expect(outside).toBe(0);
    expect(report.score).toBe(scoreIssues(report.issues).score);
    expect(
      report.issues.find((i) => i.type === 'javascript-error')?.screenshot,
    ).toBeTruthy();
    const screenshot = report.issues.find((i) => i.screenshot)!.screenshot!;
    expect(
      (await readFile(join(directory, report.id, screenshot)))
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
    const location = await writeReport(report, directory);
    expect(
      JSON.parse(await readFile(join(location, 'report.json'), 'utf8')).id,
    ).toBe(report.id);
    expect(await readFile(join(location, 'report.html'), 'utf8')).toContain(
      'fixture exception',
    );
  });
  it('enforces page limit and desktop-only mode', async () => {
    const report = await scanSite({
      url,
      maxPages: 1,
      mobile: false,
      outputDir: directory,
      allowLoopbackForTests: true,
    });
    expect(report.pages).toHaveLength(1);
    expect(report.pages[0].viewport).toBe('desktop');
    expect(report.warnings.some((w) => w.includes('limit'))).toBe(true);
  });
  it('bounds noisy issue streams and marks the report partial', async () => {
    const report = await scanSite({
      url: url + '/noisy',
      maxPages: 1,
      mobile: false,
      outputDir: directory,
      allowLoopbackForTests: true,
    });
    expect(report.issues.length).toBeLessThanOrEqual(100);
    expect(report.status).toBe('partial');
    expect(report.warnings.some((w) => w.includes('Issue limit'))).toBe(true);
  });
  it('returns partial evidence when its time budget expires', async () => {
    const report = await scanSite({
      url: url + '/slow',
      maxPages: 1,
      mobile: false,
      durationMs: 1000,
      outputDir: directory,
      allowLoopbackForTests: true,
    });
    expect(['partial', 'failed']).toContain(report.status);
    expect(report.warnings.some((w) => w.includes('duration limit'))).toBe(
      true,
    );
    expect(report.durationMs).toBeLessThan(8000);
  });
  it('blocks private targets without the isolated test option', async () => {
    const report = await scanSite({ url, maxPages: 1, outputDir: directory });
    expect(report.status).toBe('failed');
    expect(report.pages).toHaveLength(0);
  });
});
