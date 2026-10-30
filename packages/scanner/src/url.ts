import { z } from 'zod';
export function normalizeUrl(input: string, base?: string): string {
  const url = new URL(input, base);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  if (url.username || url.password)
    throw new Error('URLs containing credentials are not allowed.');
  if (url.href.length > 2048) throw new Error('URL is too long.');
  url.hash = '';
  url.searchParams.sort();
  return url.href;
}
export const scanInput = z
  .object({
    url: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .transform((value, ctx) => {
        try {
          return normalizeUrl(value);
        } catch {
          ctx.addIssue({
            code: 'custom',
            message: 'Enter a complete HTTP or HTTPS URL without credentials.',
          });
          return z.NEVER;
        }
      }),
    maxPages: z.number().int().min(1).max(30).default(10),
    mobile: z.boolean().default(true),
  })
  .strict();
export function internalLinks(
  links: string[],
  base: string,
  origin: string,
): string[] {
  const found = new Set<string>();
  for (const link of links) {
    try {
      const url = normalizeUrl(link, base);
      if (new URL(url).origin === origin) found.add(url);
    } catch {
      /* unsupported link */
    }
  }
  return [...found];
}
