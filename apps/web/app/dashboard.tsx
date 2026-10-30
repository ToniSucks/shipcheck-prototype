'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Code2,
  ExternalLink,
  Globe2,
  History,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Monitor,
  Plus,
  Radar,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import type { Issue, ScanJob, Severity } from '@shipcheck/scanner/types';
const severities: Severity[] = ['critical', 'high', 'medium', 'low'];
const labels: Record<string, string> = {
  'http-error': 'HTTP response',
  'broken-link': 'Broken internal link',
  'javascript-error': 'JavaScript exception',
  'console-error': 'Console error',
  'mobile-overflow': 'Horizontal overflow',
  'navigation-error': 'Navigation failed',
};
function date(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function path(value: string) {
  try {
    const url = new URL(value);
    return url.pathname + url.search;
  } catch {
    return value;
  }
}
function host(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}
export default function Dashboard() {
  const [jobs, setJobs] = useState<ScanJob[]>([]),
    [selected, setSelected] = useState<ScanJob>();
  const [url, setUrl] = useState(''),
    [maxPages, setMaxPages] = useState(10),
    [mobile, setMobile] = useState(true);
  const [submitting, setSubmitting] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [section, setSection] = useState<'overview' | 'history'>('overview'),
    [tab, setTab] = useState<'issues' | 'pages'>('issues');
  const [severity, setSeverity] = useState('all'),
    [query, setQuery] = useState(''),
    [issue, setIssue] = useState<Issue>();
  const [dialog, setDialog] = useState<'settings' | 'docs' | null>(null),
    [aiEnabled, setAiEnabled] = useState(false);
  const [ai, setAi] = useState(''),
    [aiError, setAiError] = useState(''),
    [explaining, setExplaining] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null),
    selectedId = useRef<string | undefined>(undefined);
  const fetchHistory = useCallback(async () => {
    const data = await json<{ jobs: ScanJob[]; aiEnabled: boolean }>(
      '/api/scans',
    );
    setJobs(data.jobs);
    setAiEnabled(data.aiEnabled);
    return data.jobs;
  }, []);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void fetchHistory()
        .then(async (list) => {
          if (list[0]) {
            const job = await json<ScanJob>(`/api/scans/${list[0].id}`);
            if (alive) {
              setSelected(job);
              selectedId.current = job.id;
            }
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [fetchHistory]);
  const active = jobs.find((job) => job.state === 'running');
  const pollingId = selected?.state === 'running' ? selected.id : active?.id;
  useEffect(() => {
    if (!pollingId) return;
    let alive = true;
    const timer = setInterval(() => {
      void json<ScanJob>(`/api/scans/${pollingId}`)
        .then((job) => {
          if (!alive) return;
          setJobs((list) =>
            list.map((item) => (item.id === job.id ? job : item)),
          );
          if (selectedId.current === job.id) setSelected(job);
          if (job.state !== 'running') void fetchHistory().catch(() => {});
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }, 1200);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pollingId, fetchHistory]);
  useEffect(() => {
    if (!issue && !dialog) return;
    const prior = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('[role="dialog"]');
    modal
      ?.querySelector<HTMLElement>('button, input, select, a[href]')
      ?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIssue(undefined);
        setDialog(null);
      }
      if (e.key === 'Tab' && modal) {
        const nodes = [
          ...modal.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input, select, a[href]',
          ),
        ];
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prior?.focus();
    };
  }, [issue, dialog]);
  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const job = await json<ScanJob>('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, maxPages, mobile }),
      });
      selectedId.current = job.id;
      setSelected(job);
      setSection('overview');
      setSeverity('all');
      setQuery('');
      await fetchHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  async function selectJob(job: ScanJob) {
    setError('');
    try {
      const full = await json<ScanJob>(`/api/scans/${job.id}`);
      selectedId.current = job.id;
      setSelected(full);
      setSection('overview');
      setSeverity('all');
      setQuery('');
      setIssue(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function explain() {
    if (!selected || !issue) return;
    setExplaining(true);
    setAiError('');
    try {
      const data = await json<{ explanation: string }>(
        `/api/scans/${selected.id}/explain`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issueId: issue.id }),
        },
      );
      setAi(data.explanation);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setExplaining(false);
    }
  }
  const report = selected?.report,
    running = selected?.state === 'running';
  const pageCount = report
    ? new Set(report.pages.map((page) => page.url)).size
    : undefined;
  const findings =
    report?.issues.filter(
      (item) =>
        (severity === 'all' || item.severity === severity) &&
        `${item.description} ${item.pageUrl} ${item.type}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) ?? [];
  const hasScore = report && report.status !== 'failed',
    scoreColor = hasScore
      ? report.score >= 90
        ? 'var(--green)'
        : report.score >= 60
          ? 'var(--amber)'
          : 'var(--red)'
      : 'var(--purple)';
  function newScan() {
    setSection('overview');
    setTimeout(() => inputRef.current?.focus(), 0);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <CheckCheck size={22} />
          </span>{' '}
          ShipCheck<span className="version">BETA</span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">S</span>
          <div>
            Personal workspace<small>Local installation</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            aria-label="Overview"
            className={section === 'overview' ? 'nav-item active' : 'nav-item'}
            onClick={() => setSection('overview')}
          >
            <LayoutDashboard size={18} /> Overview
          </button>
          <button
            aria-label="Scan history"
            className={section === 'history' ? 'nav-item active' : 'nav-item'}
            onClick={() => setSection('history')}
          >
            <History size={18} /> Scan history
            <span className="nav-count">{jobs.length}</span>
          </button>
          <button
            aria-label="Scan settings"
            className="nav-item"
            onClick={() => setDialog('settings')}
          >
            <Settings2 size={18} /> Scan settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="status-dot" />
            <span>
              Runs on your machine<small>Your reports stay local.</small>
            </span>
          </div>
          <button className="nav-item" onClick={() => setDialog('docs')}>
            <BookOpen size={18} /> Documentation
            <ArrowUpRight size={14} className="push" />
          </button>
          <div className="profile">
            <span className="avatar">
              <Terminal size={16} />
            </span>
            <div>
              Developer<small>Open-source edition</small>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>{section === 'history' ? 'Scan history' : 'Overview'}</span>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <span className="status-dot" /> Local environment
            </span>
            <span className="top-divider" />
            <button
              className="icon-button"
              aria-label="Open documentation"
              onClick={() => setDialog('docs')}
            >
              <BookOpen size={17} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> THE LAST CHECK BEFORE LAUNCH
              </div>
              <h1>
                {section === 'history'
                  ? 'Your scan history'
                  : 'Ship with confidence.'}
              </h1>
              <p>
                {section === 'history'
                  ? 'Every scan, every finding. Pick up where you left off.'
                  : 'Find the bugs your users shouldn’t have to.'}
              </p>
            </div>
            <button className="button secondary new-scan" onClick={newScan}>
              <Plus size={16} /> New scan
            </button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {section === 'history' ? (
            <section className="panel history-panel">
              <div className="panel-heading">
                <h2>
                  All scans <span className="count-tag">{jobs.length}</span>
                </h2>
                <span>Stored on this machine</span>
              </div>
              {loading ? (
                <div className="empty-state">
                  <LoaderCircle className="spin" />
                  Loading history…
                </div>
              ) : !jobs.length ? (
                <div className="empty-state">
                  <History size={30} />
                  <h3>A fresh start.</h3>
                  <p>Your completed scans will appear here.</p>
                  <button className="button primary" onClick={newScan}>
                    Run your first scan <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="history-list">
                  {jobs.map((job) => (
                    <button
                      className="history-row"
                      key={job.id}
                      onClick={() => void selectJob(job)}
                    >
                      <span className="site-icon">
                        <Globe2 size={19} />
                      </span>
                      <span className="history-name">
                        {host(job.url)}
                        <small>{job.url}</small>
                      </span>
                      <span className={`state-badge ${job.state}`}>
                        {job.state === 'running' && (
                          <LoaderCircle size={12} className="spin" />
                        )}
                        {job.report?.status ?? job.state}
                      </span>
                      <span className="history-date">
                        {date(job.createdAt)}
                      </span>
                      <span className="history-score">
                        {job.report && job.report.status !== 'failed'
                          ? job.report.score
                          : '—'}
                        <small>/100</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="scan-panel">
                <div className="scan-panel-top">
                  <h2>
                    <Radar size={18} /> Start a website scan
                  </h2>
                  <span className="engine-label">
                    <span className="status-dot" /> Powered by Chromium
                  </span>
                </div>
                <form onSubmit={start}>
                  <label htmlFor="website" className="sr-only">
                    Website URL
                  </label>
                  <div className="url-field">
                    <Globe2 size={19} />
                    <input
                      ref={inputRef}
                      id="website"
                      type="url"
                      required
                      maxLength={2048}
                      placeholder="https://your-website.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      autoComplete="url"
                      spellCheck={false}
                    />
                    <kbd>URL</kbd>
                  </div>
                  <button
                    className="button primary scan-button"
                    disabled={submitting || Boolean(active)}
                    type="submit"
                  >
                    {submitting || active ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Zap size={17} />
                    )}{' '}
                    {submitting
                      ? 'Starting…'
                      : active
                        ? 'Scan running'
                        : 'Start scan'}
                    {!submitting && !active && <ArrowRight size={16} />}
                  </button>
                </form>
                <div className="scan-options">
                  <span>
                    <Monitor size={14} /> Desktop{' '}
                    {mobile && (
                      <>
                        <span className="option-plus">+</span>
                        <Smartphone size={13} /> Mobile
                      </>
                    )}
                  </span>
                  <i />
                  <button onClick={() => setDialog('settings')}>
                    <Layers3 size={14} /> Up to {maxPages} pages{' '}
                    <ChevronDown size={12} />
                  </button>
                  <span className="safe-note">
                    <ShieldCheck size={14} /> Read-only. No clicks. No forms.
                  </span>
                </div>
              </section>
              {running && (
                <div
                  className="progress-panel"
                  role="status"
                  aria-live="polite"
                >
                  <LoaderCircle className="spin" size={20} />
                  <div>
                    <strong>
                      {selected.progress.phase === 'launching'
                        ? 'Warming up a real browser'
                        : 'Inspecting your website'}
                    </strong>
                    <span>
                      {selected.progress.currentUrl ||
                        'Preparing a safe scan environment…'}
                    </span>
                  </div>
                  <span>
                    {selected.progress.pagesScanned} pages ·{' '}
                    {selected.progress.issuesFound} findings
                  </span>
                  <div className="progress-track">
                    <div />
                  </div>
                </div>
              )}
              {selected?.state === 'failed' && (
                <div className="alert error">
                  <CircleAlert size={18} />
                  <span>Scan couldn’t finish. {selected.error}</span>
                </div>
              )}
              <div className="section-heading">
                <h2>
                  Quality overview{' '}
                  {report && (
                    <span
                      className={`state-badge ${report.status === 'completed' ? 'completed' : 'failed'}`}
                    >
                      {report.status}
                    </span>
                  )}
                </h2>
                <div>
                  {selected ? (
                    <>
                      <Clock3 size={13} />
                      <span>{date(selected.createdAt)}</span>
                    </>
                  ) : (
                    <span>Awaiting your first scan</span>
                  )}
                  <button
                    className="icon-button"
                    aria-label="View history"
                    onClick={() => setSection('history')}
                  >
                    <History size={15} />
                  </button>
                </div>
              </div>
              {report && (
                <div className="report-address">
                  <Globe2 size={14} />
                  <span>{report.url}</span>
                  <a
                    href={`/api/scans/${report.id}/report`}
                    className="text-button"
                  >
                    <ArrowDownToLine size={14} /> JSON report
                  </a>
                </div>
              )}
              <div className="overview-grid">
                <section className="panel score-panel">
                  <div className="panel-heading">
                    <h3>Quality score</h3>
                    <span
                      className="info-tip"
                      title="100 minus deductions per unique finding: critical 20, high 10, medium 5, low 2. Separate desktop and mobile findings count separately."
                    >
                      i
                    </span>
                  </div>
                  <div
                    className="score-ring"
                    style={
                      {
                        '--score': hasScore ? report.score : 0,
                        '--ring-color': scoreColor,
                      } as React.CSSProperties
                    }
                  >
                    <svg viewBox="0 0 160 160" aria-hidden="true">
                      <circle cx="80" cy="80" r="65" className="ring-track" />
                      <circle cx="80" cy="80" r="65" className="ring-value" />
                    </svg>
                    <div>
                      <strong>{hasScore ? report.score : '—'}</strong>
                      <small>{hasScore ? 'OUT OF 100' : 'NO SCORE YET'}</small>
                    </div>
                  </div>
                  <div className="score-caption">
                    {hasScore ? (
                      report.score >= 90 ? (
                        <>
                          <Check size={13} /> Looking healthy
                        </>
                      ) : (
                        <>
                          <CircleAlert size={13} /> Room to improve
                        </>
                      )
                    ) : (
                      'Your launch-readiness snapshot'
                    )}
                  </div>
                  <div className="score-footnote">
                    Based on detected issues, not Lighthouse
                  </div>
                </section>
                <section className="panel findings-panel">
                  <div className="panel-heading">
                    <h3>Findings by severity</h3>
                    <span>
                      {report
                        ? `${report.issues.length} total`
                        : 'No scan data'}
                    </span>
                  </div>
                  <div className="severity-bars">
                    {severities.map((level) => (
                      <button
                        key={level}
                        className="severity-line"
                        onClick={() => {
                          setSeverity(level);
                          setTab('issues');
                        }}
                      >
                        <span className={`severity-dot ${level}`} />
                        <span className="severity-label">{level}</span>
                        <div className="bar-track">
                          <div
                            className={level}
                            style={{
                              width: report?.issues.length
                                ? `${(report.counts[level] / report.issues.length) * 100}%`
                                : '0%',
                            }}
                          />
                        </div>
                        <strong>{report ? report.counts[level] : '—'}</strong>
                        <span className="deduction">
                          −
                          {{ critical: 20, high: 10, medium: 5, low: 2 }[level]}{' '}
                          pts
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="severity-footer">
                    <ShieldCheck size={14} /> A transparent score. Every finding
                    counts.
                  </div>
                </section>
                <div className="stat-stack">
                  <section className="panel stat-card">
                    <div className="stat-icon purple">
                      <Layers3 size={18} />
                    </div>
                    <div>
                      <h3>Pages scanned</h3>
                      <strong>
                        {pageCount ?? '—'}
                        <span>
                          {pageCount !== undefined
                            ? `/ ${report?.options.maxPages}`
                            : ''}
                        </span>
                      </strong>
                      <p>
                        {report
                          ? `${report.pages.length} viewport checks completed`
                          : 'Across your website'}
                      </p>
                    </div>
                  </section>
                  <section className="panel stat-card">
                    <div className="stat-icon amber">
                      <CircleAlert size={18} />
                    </div>
                    <div>
                      <h3>Issues detected</h3>
                      <strong>{report?.issues.length ?? '—'}</strong>
                      <p>
                        {report
                          ? `${(report.durationMs / 1000).toFixed(1)}s scan duration`
                          : 'Evidence, not guesswork'}
                      </p>
                    </div>
                  </section>
                </div>
              </div>
              <section className="panel issues-panel">
                <div className="result-tabs">
                  <button
                    className={tab === 'issues' ? 'selected' : ''}
                    onClick={() => setTab('issues')}
                  >
                    <CircleAlert size={16} /> Issues{' '}
                    <span className="count-tag">
                      {report?.issues.length ?? 0}
                    </span>
                  </button>
                  <button
                    className={tab === 'pages' ? 'selected' : ''}
                    onClick={() => setTab('pages')}
                  >
                    <Layers3 size={16} /> Pages{' '}
                    <span className="count-tag">{pageCount ?? 0}</span>
                  </button>
                  <span className="evidence-label">
                    <span className="status-dot" /> Browser-verified evidence
                  </span>
                </div>
                <div className="table-toolbar">
                  <div className="search-field">
                    <Search size={15} />
                    <input
                      aria-label="Search findings"
                      placeholder={
                        tab === 'issues'
                          ? 'Search issues or page URLs…'
                          : 'Search page URLs…'
                      }
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  {tab === 'issues' && (
                    <select
                      aria-label="Filter severity"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                    >
                      <option value="all">All severities</option>
                      {severities.map((level) => (
                        <option value={level} key={level}>
                          {level[0].toUpperCase() + level.slice(1)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {tab === 'issues' ? (
                  <>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>ISSUE</th>
                            <th>SEVERITY</th>
                            <th>PAGE</th>
                            <th>DEVICE</th>
                            <th aria-label="View details" />
                          </tr>
                        </thead>
                        <tbody>
                          {findings.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <button
                                  className="issue-title"
                                  onClick={() => {
                                    setIssue(item);
                                    setAi('');
                                    setAiError('');
                                  }}
                                >
                                  <span
                                    className={`issue-symbol ${item.severity}`}
                                  >
                                    <Code2 size={15} />
                                  </span>
                                  <div>
                                    {labels[item.type]}
                                    <small>{item.description}</small>
                                  </div>
                                </button>
                              </td>
                              <td>
                                <span
                                  className={`severity-badge ${item.severity}`}
                                >
                                  <span
                                    className={`severity-dot ${item.severity}`}
                                  />
                                  {item.severity}
                                </span>
                              </td>
                              <td className="mono" title={item.pageUrl}>
                                {path(item.pageUrl)}
                              </td>
                              <td>
                                <span className="device">
                                  {item.viewport === 'mobile' ? (
                                    <Smartphone size={14} />
                                  ) : (
                                    <Monitor size={14} />
                                  )}{' '}
                                  {item.viewport}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={`View ${labels[item.type]} details`}
                                  onClick={() => {
                                    setIssue(item);
                                    setAi('');
                                    setAiError('');
                                  }}
                                >
                                  <ChevronRight size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!findings.length && (
                      <div className="empty-state">
                        <div className="empty-browser">
                          <div>
                            <span />
                            <span />
                            <span />
                          </div>
                          <ShieldCheck size={31} />
                          <span className="tiny-check">
                            <Check size={12} />
                          </span>
                        </div>
                        <h3>
                          {loading
                            ? 'Loading your workspace…'
                            : running
                              ? 'A closer look is underway.'
                              : !report
                                ? 'A little check. A better launch.'
                                : report.status === 'failed'
                                  ? 'No findings available'
                                  : report.issues.length
                                    ? 'No matching issues'
                                    : 'No issues detected in this scan.'}
                        </h3>
                        <p>
                          {!report
                            ? 'Scan your website to uncover broken links, runtime errors,'
                            : report.issues.length
                              ? 'Try a different search or severity filter.'
                              : 'Automated checks cover a limited set of conditions.'}
                          <br />
                          {!report
                            ? 'and mobile layout issues — with evidence to act on.'
                            : 'Review coverage notes before making a launch decision.'}
                        </p>
                        {!report && !running && (
                          <button
                            className="text-button"
                            onClick={() => inputRef.current?.focus()}
                          >
                            Start your first scan <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>PAGE</th>
                          <th>DEVICE</th>
                          <th>HTTP STATUS</th>
                          <th>FINDINGS</th>
                          <th>DURATION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report?.pages
                          .filter((page) =>
                            page.url
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                          )
                          .map((page, index) => (
                            <tr key={index}>
                              <td className="mono" title={page.url}>
                                {path(page.url)}
                              </td>
                              <td>
                                <span className="device">
                                  {page.viewport === 'mobile' ? (
                                    <Smartphone size={14} />
                                  ) : (
                                    <Monitor size={14} />
                                  )}{' '}
                                  {page.viewport}
                                </span>
                              </td>
                              <td>{page.status ?? 'Unavailable'}</td>
                              <td>{page.issueIds.length}</td>
                              <td>{(page.durationMs / 1000).toFixed(1)}s</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {!report?.pages.length && (
                      <div className="empty-state">
                        <Layers3 size={28} />
                        <h3>No pages inspected yet.</h3>
                        <p>Desktop and mobile page checks will appear here.</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    {report
                      ? tab === 'issues'
                        ? `${findings.length} of ${report.issues.length} issues`
                        : `${report.pages.length} viewport checks`
                      : 'Your next launch starts here.'}
                  </span>
                  <span>
                    <ShieldCheck size={13} /> Same-origin scanning only
                  </span>
                </div>
              </section>
              {report && (
                <details className="coverage-notes">
                  <summary>
                    <CircleAlert size={14} /> Coverage & scan notes{' '}
                    <ChevronDown size={14} />
                  </summary>
                  <ul>
                    {report.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                  <p>
                    Score: 100 − (20 × critical + 10 × high + 5 × medium + 2 ×
                    low), clamped to 0–100. Findings are deduplicated per page,
                    viewport, type and evidence. A partial scan’s score covers
                    recorded findings only.
                  </p>
                </details>
              )}
              <div className="bottom-note">
                <span>
                  <ShieldCheck size={14} /> Real browser. Real findings. Your
                  data stays local.
                </span>
                <button
                  className="text-button"
                  onClick={() => setDialog('docs')}
                >
                  How ShipCheck works <ArrowUpRight size={13} />
                </button>
              </div>
            </>
          )}
          <footer>
            <span className="footer-brand">
              <CheckCheck size={15} /> ShipCheck
            </span>
            <span>Built for that “is it ready?” moment.</span>
            <span>Open source · v0.1.0</span>
          </footer>
        </main>
      </div>
      {(issue || dialog) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setIssue(undefined);
            setDialog(null);
          }}
        >
          <section
            className={`modal ${issue ? 'issue-modal' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-top">
              <span className="eyebrow">
                {issue
                  ? 'RECORDED EVIDENCE'
                  : dialog === 'settings'
                    ? 'YOUR SCAN PREFERENCES'
                    : 'GETTING STARTED'}
              </span>
              <button
                className="icon-button"
                aria-label="Close dialog"
                onClick={() => {
                  setIssue(undefined);
                  setDialog(null);
                }}
              >
                <X size={19} />
              </button>
            </div>
            {issue ? (
              <>
                <h2 id="dialog-title">{labels[issue.type]}</h2>
                <div className="detail-meta">
                  <span className={`severity-badge ${issue.severity}`}>
                    <span className={`severity-dot ${issue.severity}`} />
                    {issue.severity}
                  </span>
                  <span className="device">
                    {issue.viewport === 'mobile' ? (
                      <Smartphone size={14} />
                    ) : (
                      <Monitor size={14} />
                    )}{' '}
                    {issue.viewport}
                  </span>
                </div>
                <p className="detail-description">{issue.description}</p>
                <div className="detail-url">
                  <Globe2 size={14} />
                  {issue.pageUrl}
                  <a
                    href={issue.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open scanned page"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
                <h3>Observed evidence</h3>
                <pre>{JSON.stringify(issue.evidence, null, 2)}</pre>
                <h3>Screenshot</h3>
                {issue.screenshot ? (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`/api/scans/${selected?.id}/${issue.screenshot}`}
                  >
                    <Image
                      unoptimized
                      width={issue.viewport === 'mobile' ? 375 : 1440}
                      height={issue.viewport === 'mobile' ? 812 : 900}
                      className="evidence-image"
                      src={`/api/scans/${selected?.id}/${issue.screenshot}`}
                      alt={`Recorded ${issue.viewport} screenshot of ${issue.pageUrl}`}
                    />
                  </a>
                ) : (
                  <p className="muted">
                    Screenshot unavailable for this finding.
                  </p>
                )}
                <div className="ai-section">
                  <div>
                    <h3>
                      <Sparkles size={16} /> A second opinion
                    </h3>
                    <span>
                      AI suggestions are hypotheses. Verify with a new scan.
                    </span>
                  </div>
                  <p className="muted">
                    This sends only this issue’s description and recorded
                    evidence to OpenAI. Screenshots are not sent.
                  </p>
                  <button
                    className="button secondary"
                    disabled={explaining}
                    onClick={() => void explain()}
                  >
                    {explaining ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Sparkles size={16} />
                    )}{' '}
                    {aiEnabled ? 'Explain this issue' : 'AI setup required'}
                  </button>
                  {aiError && (
                    <p role="alert" className="error-text">
                      {aiError}
                    </p>
                  )}
                  {ai && <div className="ai-output">{ai}</div>}
                </div>
              </>
            ) : dialog === 'settings' ? (
              <>
                <h2 id="dialog-title">Make it your scan.</h2>
                <p className="muted">
                  Applies to the next scan. A smaller crawl finishes faster.
                </p>
                <label className="field-label" htmlFor="max-pages">
                  Maximum pages <span>1–30 pages</span>
                </label>
                <input
                  className="settings-input"
                  id="max-pages"
                  type="number"
                  min={1}
                  max={30}
                  value={maxPages}
                  onChange={(e) =>
                    setMaxPages(
                      Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                    )
                  }
                />
                <label className="toggle-row">
                  <span>
                    <Smartphone size={18} />
                    <span>
                      Include mobile checks
                      <small>375 × 812, alongside desktop at 1440 × 900</small>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={mobile}
                    onChange={(e) => setMobile(e.target.checked)}
                  />
                </label>
                <div className="settings-note">
                  <ShieldCheck size={18} />
                  <p>
                    Scans use a fresh browser session and only inspect the
                    supplied origin. No button clicks, form submissions, or
                    login. Maximum duration: 120 seconds.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setDialog(null)}
                >
                  Done <Check size={16} />
                </button>
              </>
            ) : (
              <>
                <h2 id="dialog-title">One URL. A clearer picture.</h2>
                <p className="muted">
                  ShipCheck opens your website in Chromium and follows up to{' '}
                  {maxPages} same-origin pages.
                </p>
                <div className="docs-steps">
                  <div>
                    <span>01</span>
                    <div>
                      <h3>Enter a public website URL</h3>
                      <p>
                        Use a full https:// URL. Private networks and
                        nonstandard ports are blocked.
                      </p>
                    </div>
                  </div>
                  <div>
                    <span>02</span>
                    <div>
                      <h3>Let the browser do the checking</h3>
                      <p>
                        We inspect HTTP failures, internal links, JavaScript
                        exceptions, console errors, and mobile overflow.
                      </p>
                    </div>
                  </div>
                  <div>
                    <span>03</span>
                    <div>
                      <h3>Review the evidence</h3>
                      <p>
                        Filter findings, inspect screenshots, and download the
                        JSON report. A high score reflects limited automated
                        checks.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="command-block">
                  <Terminal size={15} />
                  <code>npm run scan -- https://example.com</code>
                </div>
                <p className="muted">
                  Optional AI: set OPENAI_API_KEY in apps/web/.env.local, then
                  restart. See README.md for setup, scoring, and security
                  details.
                </p>
                <button
                  className="button primary"
                  onClick={() => setDialog(null)}
                >
                  Got it <ArrowRight size={15} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
