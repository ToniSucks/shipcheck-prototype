import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScanReport } from './types';
export function escapeHtml(value: unknown) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
}
export function htmlReport(report: ScanReport): string {
  const e = escapeHtml;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"><title>ShipCheck report</title><style>body{background:#101115;color:#e9e9ef;font:15px/1.6 system-ui;margin:40px auto;padding:0 24px;max-width:1000px}a{color:#a99bff}h1{font-size:36px}article{border:1px solid #363740;background:#191a21;padding:24px;margin:16px 0;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#b3b5c5}img{max-width:100%;border-radius:8px}small{color:#aaa}strong{color:#b9afff}</style><h1>ShipCheck <strong>${report.status === 'failed' ? 'Unavailable' : report.score + '/100'}</strong></h1><p>${e(report.url)} · ${e(report.status)} · ${new Set(report.pages.map((p) => p.url)).size} pages · ${report.issues.length} findings</p><small>${e(report.finishedAt)} · Score deductions: critical 20, high 10, medium 5, low 2 per unique page/viewport finding.</small><h2>Coverage notes</h2>${report.warnings.map((w) => `<p>${e(w)}</p>`).join('')}<h2>Findings</h2>${report.issues.length ? report.issues.map((issue) => `<article><small>${e(issue.severity.toUpperCase())} · ${e(issue.viewport)} · ${e(issue.type)}</small><h3>${e(issue.description)}</h3><p>${e(issue.pageUrl)}</p><pre>${e(JSON.stringify(issue.evidence, null, 2))}</pre>${issue.screenshot ? `<img alt="Captured issue evidence" src="${e(issue.screenshot)}">` : '<p>No screenshot available.</p>'}</article>`).join('') : '<p>No findings recorded. This is limited automated coverage, not a guarantee of correctness.</p>'}</html>`;
}
export async function writeReport(report: ScanReport, outputDir: string) {
  const directory = join(outputDir, report.id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  await writeFile(join(directory, 'report.html'), htmlReport(report));
  return directory;
}
