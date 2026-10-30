import { NextResponse } from 'next/server';
import { getJob } from '@/lib/store';
export const runtime = 'nodejs';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job?.report)
    return NextResponse.json(
      { error: 'Report not available.' },
      { status: 404 },
    );
  return new Response(JSON.stringify(job.report, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="shipcheck-${id}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
