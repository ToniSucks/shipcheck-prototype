import { NextResponse, type NextRequest } from 'next/server';
import { scanInput, resolveTarget } from '@shipcheck/scanner';
import { listJobs, startJob } from '@/lib/store';
import { mutationGuard, readBody } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const jobs = await listJobs();
    return NextResponse.json({
      jobs: jobs.map((job) => ({
        ...job,
        report: job.report
          ? { ...job.report, issues: [], pages: [] }
          : undefined,
      })),
      aiEnabled: Boolean(process.env.OPENAI_API_KEY),
    });
  } catch {
    return NextResponse.json(
      { error: 'Could not read local scan history.' },
      { status: 500 },
    );
  }
}
export async function POST(request: NextRequest) {
  const denied = mutationGuard(request);
  if (denied) return denied;
  try {
    const input = scanInput.parse(await readBody(request));
    await resolveTarget(input.url);
    return NextResponse.json(await startJob(input), { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid scan input.';
    return NextResponse.json(
      { error: message },
      { status: message.startsWith('Another scan') ? 409 : 400 },
    );
  }
}
