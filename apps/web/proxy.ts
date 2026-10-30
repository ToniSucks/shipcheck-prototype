import { NextResponse, type NextRequest } from 'next/server';
// This MVP is a local installation. Deny hostile Host headers, including DNS rebinding to loopback.
export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(host))
    return NextResponse.json(
      { error: 'ShipCheck only accepts local hostnames.' },
      { status: 403 },
    );
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
export const config = { matcher: ['/api/:path*', '/'] };
