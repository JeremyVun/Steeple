import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist*/**', 'node_modules/**'] },
  {
    files: ['src/**/*.js', 'public/**/*.js', 'tools/**/*.mjs', '*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        __steeple: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Intentional catches often classify a failed capability without using
      // the provider error; named catch bindings remain useful in nearby logs.
      // The visual modules deliberately keep named design-axis parameters and
      // harness cleanup assignments. Adoption focuses on executable mistakes;
      // checkJs covers the typed seam allowlist separately.
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      // Several harnesses translate provider failures into purpose-built
      // diagnostics; attaching causes is valuable but not a correctness gate.
      'preserve-caught-error': 'off',
    },
  },
];
