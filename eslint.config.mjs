import next from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';
const config = [
  ...next,
  ...tseslint.configs.recommended,
  { settings: { next: { rootDir: 'apps/web/' } } },
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      'work/**',
      'outputs/**',
      '**/next-env.d.ts',
    ],
  },
];
export default config;
