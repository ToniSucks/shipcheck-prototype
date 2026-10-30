import { NextResponse, type NextRequest } from 'next/server';
export function mutationGuard(request: NextRequest): NextResponse | undefined {
  const origin = request.headers.get('origin');
  // Next may use localhost internally even when the client used 127.0.0.1.
  // The actual Host header identifies the browser's origin, without trusting forwarded headers.
  const expected = `${request.nextUrl.protocol}//${request.headers.get('host')}`;
  if (origin && origin !== expected)
    return NextResponse.json(
      { error: 'Cross-origin requests are blocked.' },
      { status: 403 },
    );
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return NextResponse.json(
      { error: 'Use application/json.' },
      { status: 415 },
    );
  if (Number(request.headers.get('content-length') ?? 0) > 8192)
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
}
export async function readBody(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new Error('Request too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
