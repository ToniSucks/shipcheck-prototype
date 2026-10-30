import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { mutationGuard, readBody } from '../apps/web/lib/http';
import { proxy } from '../apps/web/proxy';
function request(origin: string, host = '127.0.0.1:3000') {
  return new NextRequest('http://localhost:3000/api/scans', {
    method: 'POST',
    headers: { origin, host, 'Content-Type': 'application/json' },
    body: '{}',
  });
}
describe('local API boundary', () => {
  it('accepts the actual browser Host even when Next internally uses localhost', () =>
    expect(mutationGuard(request('http://127.0.0.1:3000'))).toBeUndefined());
  it('rejects cross-origin submissions', () =>
    expect(mutationGuard(request('https://attacker.example'))?.status).toBe(
      403,
    ));
  it('rejects hostile Host headers for read and mutation endpoints', () =>
    expect(
      proxy(request('http://attacker.example', 'attacker.example')).status,
    ).toBe(403));
  it('requires JSON', () => {
    const req = new NextRequest('http://localhost:3000', {
      method: 'POST',
      headers: { host: 'localhost:3000' },
      body: '{}',
    });
    expect(mutationGuard(req)?.status).toBe(415);
  });
  it('bounds request bodies including requests without Content-Length', async () => {
    const req = new NextRequest('http://localhost:3000', {
      method: 'POST',
      body: JSON.stringify({ long: 'x'.repeat(9000) }),
    });
    await expect(readBody(req)).rejects.toThrow('Request too large');
  });
  it('parses a valid bounded body', async () =>
    expect(await readBody(request('http://127.0.0.1:3000'))).toEqual({}));
});
