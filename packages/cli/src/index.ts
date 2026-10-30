import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { scanSite, writeReport, scanInput } from '@shipcheck/scanner';
async function main() {
  const { values, positionals } = parseArgs({
    options: {
      'max-pages': { type: 'string', default: '10' },
      mobile: { type: 'boolean', default: true },
      'desktop-only': { type: 'boolean' },
      output: { type: 'string', default: './reports' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: true,
  });
  if (values.help) {
    console.log(
      'Usage: npm run scan -- <url> [--max-pages 10] [--mobile] [--desktop-only] [--output ./reports]',
    );
    return;
  }
  if (positionals.length !== 1)
    throw new Error('Provide exactly one URL. Use --help for usage.');
  const input = scanInput.parse({
    url: positionals[0],
    maxPages: Number(values['max-pages']),
    mobile: !values['desktop-only'] && values.mobile,
  });
  const outputDir = resolve(values.output!);
  const report = await scanSite({
    ...input,
    outputDir,
    onProgress: (p) => {
      if (p.currentUrl)
        process.stdout.write(
          `\r${p.pagesScanned} pages · ${p.issuesFound} findings · ${p.currentUrl.slice(0, 90)}                 `,
        );
    },
  });
  const directory = await writeReport(report, outputDir);
  console.log(
    `\n\nShipCheck · ${report.status}\nQuality score: ${report.status === 'failed' ? 'unavailable' : report.score + '/100'}\nPages: ${new Set(report.pages.map((p) => p.url)).size} · Findings: ${report.issues.length}\nCritical ${report.counts.critical} / High ${report.counts.high} / Medium ${report.counts.medium} / Low ${report.counts.low}\nJSON: ${directory}/report.json\nHTML: ${directory}/report.html`,
  );
  for (const warning of report.warnings) console.log(`Note: ${warning}`);
  if (report.status === 'failed') process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    `ShipCheck: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
