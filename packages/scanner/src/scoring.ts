import { createHash } from 'node:crypto';
import type { Issue, Severity } from './types';
export const deductions: Record<Severity, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
};
export function issueKey(issue: Omit<Issue, 'id'>): string {
  return [
    issue.pageUrl,
    issue.viewport,
    issue.type,
    issue.evidence.url ?? '',
    issue.evidence.status ?? '',
    issue.evidence.message ?? issue.description,
  ].join('\n');
}
export function deduplicateIssues(issues: Omit<Issue, 'id'>[]): Issue[] {
  const map = new Map<string, Issue>();
  for (const issue of issues) {
    const key = issueKey(issue);
    if (
      !map.has(key) ||
      deductions[issue.severity] > deductions[map.get(key)!.severity]
    )
      map.set(key, {
        ...issue,
        id: createHash('sha256').update(key).digest('hex').slice(0, 16),
      });
  }
  return [...map.values()];
}
export function scoreIssues(issues: Issue[]) {
  const unique = deduplicateIssues(issues);
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const issue of unique) counts[issue.severity]++;
  return {
    score: Math.max(
      0,
      Math.min(
        100,
        100 -
          unique.reduce((sum, issue) => sum + deductions[issue.severity], 0),
      ),
    ),
    counts,
  };
}
