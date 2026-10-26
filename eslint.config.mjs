import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/.next/**', '**/dist/**', '**/node_modules/**', '**/next-env.d.ts', '**/api.generated.ts'] },
  js.configs.recommended, ...ts.configs.recommended,
  { files: ['**/*.{js,mjs,ts,tsx}'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly', fetch: 'readonly', self: 'readonly', caches: 'readonly' } } }
);
