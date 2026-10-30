import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  scanSite,
  writeReport,
  type ScanJob,
  type ScanReport,
} from '@shipcheck/scanner';
// next runs with apps/web as its cwd. Keep storage outside .next and public/.
export const dataDir = process.env.SHIPCHECK_DATA_DIR
  ? resolve(process.env.SHIPCHECK_DATA_DIR)
  : resolve(process.cwd(), '../../.shipcheck');
const globalStore = globalThis as typeof globalThis & {
  shipcheck?: { active?: ScanJob; activeKey?: string; writes: Promise<void> };
};
const store = (globalStore.shipcheck ??= { writes: Promise.resolve() });
export const validId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
async function persist(job: ScanJob) {
  // Serialize progress writes so completion cannot be overwritten by stale progress.
  const snapshot = JSON.stringify(job);
  store.writes = store.writes
    .catch(() => {})
    .then(async () => {
      const file = join(dataDir, job.id, 'job.json');
      await mkdir(dirname(file), { recursive: true });
      const temp = file + '.' + randomUUID() + '.tmp';
      await writeFile(temp, snapshot);
      await rename(temp, file);
    });
  await store.writes;
}
export async function getJob(id: string): Promise<ScanJob | undefined> {
  if (!validId(id)) return;
  if (store.active?.id === id) return structuredClone(store.active);
  try {
    const job = JSON.parse(
      await readFile(join(dataDir, id, 'job.json'), 'utf8'),
    ) as ScanJob;
    if (job.state === 'running') {
      job.state = 'failed';
      job.error =
        'The server restarted before this scan finished. Start a new scan.';
    }
    return job;
  } catch {
    return;
  }
}
export async function listJobs(): Promise<ScanJob[]> {
  await mkdir(dataDir, { recursive: true });
  const entries = await readdir(dataDir);
  const jobs = await Promise.all(entries.filter(validId).map(getJob));
  return jobs
    .filter((job): job is ScanJob => Boolean(job))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function startJob(input: {
  url: string;
  maxPages: number;
  mobile: boolean;
}): Promise<ScanJob> {
  if (store.active?.state === 'running') {
    const job = store.active;
    if (store.activeKey === JSON.stringify(input)) return structuredClone(job);
    throw new Error(
      'Another scan is running. Wait for it to finish before starting a new one.',
    );
  }
  const job: ScanJob = {
    id: randomUUID(),
    url: input.url,
    state: 'running',
    createdAt: new Date().toISOString(),
    progress: {
      phase: 'launching',
      pagesScanned: 0,
      pagesDiscovered: 1,
      issuesFound: 0,
    },
  };
  store.active = job;
  store.activeKey = JSON.stringify(input);
  await persist(job);
  // Intentional local Node worker. Route returns 202; browser polls a small status endpoint.
  setTimeout(() => {
    void (async () => {
      try {
        const report: ScanReport = await scanSite({
          ...input,
          id: job.id,
          outputDir: dataDir,
          onProgress: (progress) => {
            job.progress = progress;
            void persist(job).catch(console.error);
          },
        });
        await writeReport(report, dataDir);
        job.report = report;
        job.state = report.status === 'failed' ? 'failed' : 'completed';
        if (report.status === 'failed')
          job.error = report.warnings
            .filter((w) => !w.startsWith('Only same-origin'))
            .join(' ');
      } catch (error) {
        job.state = 'failed';
        job.error = error instanceof Error ? error.message : String(error);
      }
      await persist(job);
    })().catch((error) => {
      job.state = 'failed';
      job.error =
        'Could not persist scan results. Check available disk space and storage permissions.';
      console.error(error);
    });
  }, 0);
  return structuredClone(job);
}
