import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir, validId } from '@/lib/store';
export const runtime = 'nodejs';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await params;
  if (!validId(id) || !/^\d+-(desktop|mobile)\.png$/.test(file))
    return new Response('Not found', { status: 404 });
  try {
    const bytes = await readFile(join(dataDir, id, 'screenshots', file));
    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/png',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Screenshot unavailable', { status: 404 });
  }
}
