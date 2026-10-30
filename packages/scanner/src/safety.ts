import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { normalizeUrl } from './url';
export function isPublicAddress(address: string): boolean {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export async function resolveTarget(
  input: string,
  allowLoopbackForTests = false,
) {
  const url = new URL(normalizeUrl(input));
  if (
    url.port &&
    !['80', '443'].includes(url.port) &&
    !(allowLoopbackForTests && process.env.NODE_ENV === 'test')
  )
    throw new Error('Only standard HTTP/HTTPS ports (80 and 443) are allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    if (!(allowLoopbackForTests && process.env.NODE_ENV === 'test'))
      throw new Error('Private and internal network targets are blocked.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(host, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('DNS resolution timed out.')),
        5000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  if (
    !addresses.length ||
    addresses.some(
      ({ address }) =>
        !isPublicAddress(address) &&
        !(
          allowLoopbackForTests &&
          process.env.NODE_ENV === 'test' &&
          ipaddr.process(address).range() === 'loopback'
        ),
    )
  )
    throw new Error(
      'Private, reserved, and internal network targets are blocked.',
    );
  return { url, address: addresses[0].address, family: addresses[0].family };
}
