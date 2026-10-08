import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'dist-dev/**', 'node_modules/**', 'artifacts/**'] },
  js.configs.recommended,
  {
    files: ['src/client/**/*.js'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: [
      'tests/legacy/**/*.js',
      'src/server/**/*.js',
      'src/shared/**/*.js',
      'tests/**/*.mjs',
      'vite.config.js'
    ],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  }
];
