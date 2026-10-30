import { NextResponse } from 'next/server';
import { getJob } from '@/lib/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  return job
    ? NextResponse.json(job)
    : NextResponse.json({ error: 'Scan not found.' }, { status: 404 });
}
