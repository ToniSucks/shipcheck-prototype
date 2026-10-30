import type { NextConfig } from 'next';
const config: NextConfig = { transpilePackages: ['@shipcheck/scanner'], serverExternalPackages: ['playwright','playwright-core'], devIndicators: false };
export default config;
