export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Viewport = 'desktop' | 'mobile';
export type IssueType =
  | 'http-error'
  | 'broken-link'
  | 'javascript-error'
  | 'console-error'
  | 'mobile-overflow'
  | 'navigation-error';
export interface Issue {
  id: string;
  pageUrl: string;
  type: IssueType;
  severity: Severity;
  description: string;
  viewport: Viewport;
  evidence: {
    url?: string;
    status?: number;
    message?: string;
    stack?: string;
    sourcePage?: string;
    viewportWidth?: number;
    documentWidth?: number;
    elements?: string[];
  };
  screenshot?: string;
}
export interface PageResult {
  url: string;
  finalUrl: string;
  viewport: Viewport;
  status?: number;
  durationMs: number;
  issueIds: string[];
  screenshot?: string;
}
export interface ScanProgress {
  phase: 'launching' | 'crawling' | 'complete';
  pagesScanned: number;
  pagesDiscovered: number;
  currentUrl?: string;
  issuesFound: number;
}
export interface ScanReport {
  version: 1;
  id: string;
  url: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: 'completed' | 'partial' | 'failed';
  score: number;
  counts: Record<Severity, number>;
  options: { maxPages: number; mobile: boolean };
  pages: PageResult[];
  issues: Issue[];
  warnings: string[];
}
export interface ScanJob {
  id: string;
  url: string;
  state: 'running' | 'completed' | 'failed';
  createdAt: string;
  progress: ScanProgress;
  report?: ScanReport;
  error?: string;
}
