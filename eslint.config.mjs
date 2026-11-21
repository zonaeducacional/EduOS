import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['**/dist/**', '**/target/**', '**/gen/**', 'apps/desktop/public/escola-office/office.js'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  { files: ['apps/desktop/public/vibelab/js/*.js'], languageOptions: {
    globals: { document: 'readonly', window: 'readonly' },
  } },
  { files: ['apps/mini-navegador/*.js'], languageOptions: {
    globals: { require: 'readonly', __dirname: 'readonly', URL: 'readonly', Response: 'readonly',
      document: 'readonly', window: 'readonly', console: 'readonly' },
  } },
  { files: ['apps/mini-navegador/main.js', 'apps/mini-navegador/preload.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['**/*.svelte'], rules: { 'no-undef': 'off' }, languageOptions: { parserOptions: { parser: ts.parser } } },
);
