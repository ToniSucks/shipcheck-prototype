import { describe, expect, it } from 'vitest';
import {
  normalizeUrl,
  internalLinks,
  scanInput,
  scoreIssues,
  deduplicateIssues,
  isPublicAddress,
  resolveTarget,
  escapeHtml,
  htmlReport,
} from '../packages/scanner/src';
import type { Issue, ScanReport } from '../packages/scanner/src';
const issue: Omit<Issue, 'id'> = {
  pageUrl: 'https://example.com/',
  viewport: 'desktop',
  type: 'javascript-error',
  severity: 'high',
  description: 'Failure',
  evidence: { message: 'Failure' },
};
describe('scoring and issue handling', () => {
  it('starts at 100', () => expect(scoreIssues([]).score).toBe(100));
  it('deducts 20 / 10 / 5 / 2 and is order independent', () => {
    const issues = deduplicateIssues(
      (['critical', 'high', 'medium', 'low'] as const).map((severity) => ({
        ...issue,
        severity,
        evidence: { message: severity },
      })),
    );
    expect(scoreIssues(issues).score).toBe(63);
    expect(scoreIssues([...issues].reverse())).toEqual(scoreIssues(issues));
    expect(scoreIssues(issues).counts).toEqual({
      critical: 1,
      high: 1,
      medium: 1,
      low: 1,
    });
  });
  it('deduplicates evidence and preserves different viewports and pages', () => {
    const issues = deduplicateIssues([
      issue,
      issue,
      { ...issue, viewport: 'mobile' },
      { ...issue, pageUrl: 'https://example.com/other' },
    ]);
    expect(issues).toHaveLength(3);
    expect(new Set(issues.map((i) => i.id)).size).toBe(3);
    expect(scoreIssues([...issues, ...issues]).score).toBe(70);
  });
  it('clamps at zero', () =>
    expect(
      scoreIssues(
        deduplicateIssues(
          Array.from({ length: 20 }, (_, i) => ({
            ...issue,
            evidence: { message: String(i) },
          })),
        ),
      ).score,
    ).toBe(0));
});
it('uses the strongest severity for conflicting duplicate evidence regardless of order', () => {
  const high = { ...issue, severity: 'high' as const };
  const critical = { ...issue, severity: 'critical' as const };
  expect(scoreIssues(deduplicateIssues([high, critical])).score).toBe(80);
  expect(scoreIssues(deduplicateIssues([critical, high])).score).toBe(80);
});
describe('URL and network policy', () => {
  it('normalizes host, port, query order, and fragments', () => {
    expect(normalizeUrl('HTTPS://EXAMPLE.com:443/a?z=2&a=1#part')).toBe(
      'https://example.com/a?a=1&z=2',
    );
    expect(normalizeUrl('/a/', 'https://example.com')).not.toBe(
      normalizeUrl('/a', 'https://example.com'),
    );
  });
  it('rejects schemes and credentials', () => {
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://user:pass@example.com',
    ])
      expect(() => normalizeUrl(url)).toThrow();
  });
  it('keeps exactly same-origin links', () =>
    expect(
      internalLinks(
        [
          '/a#1',
          '/a#2',
          'https://other.com',
          'http://example.com/a',
          'mailto:x@y.com',
        ],
        'https://example.com/',
        'https://example.com',
      ),
    ).toEqual(['https://example.com/a']));
  it('bounds input and refuses unknown fields', () => {
    expect(scanInput.parse({ url: 'https://example.com' }).maxPages).toBe(10);
    for (const maxPages of [0, 31, 1.1])
      expect(
        scanInput.safeParse({ url: 'https://example.com', maxPages }).success,
      ).toBe(false);
    expect(
      scanInput.safeParse({
        url: 'https://example.com',
        allowLoopbackForTests: true,
      }).success,
    ).toBe(false);
  });
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.1.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])('blocks %s', (address) => expect(isPublicAddress(address)).toBe(false));
  it('permits public addresses', () => {
    expect(isPublicAddress('1.1.1.1')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it('rejects private targets and nonstandard ports', async () => {
    await expect(resolveTarget('http://127.0.0.1')).rejects.toThrow();
    await expect(resolveTarget('http://example.com:8080')).rejects.toThrow();
    await expect(resolveTarget('http://localhost')).rejects.toThrow();
  });
});
describe('HTML safety', () => {
  it('escapes unsafe text', () =>
    expect(escapeHtml('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;'));
  it('does not present failed scans as passing', () => {
    const report = {
      status: 'failed',
      url: 'https://example.com',
      score: 100,
      pages: [],
      issues: [],
      warnings: [],
      finishedAt: '',
    } as unknown as ScanReport;
    expect(htmlReport(report)).toContain('Unavailable');
    expect(htmlReport(report)).not.toContain('100/100');
  });
});
