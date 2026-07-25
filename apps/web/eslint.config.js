import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Frontend security guards (see docs/agents/security.md §Frontend). Kept inline
// so each standalone app config is self-contained (no cross-app import to break
// when an app is pruned). Mirror any change into apps/web-next + apps/mobile.
const frontendSecurityRules = [
  {
    selector: "MemberExpression[object.name=/^(localStorage|sessionStorage)$/]",
    message:
      'No localStorage/sessionStorage — a token there is an XSS exfiltration target. Keep tokens in module memory (see src/api.ts).',
  },
  {
    selector: "MemberExpression[property.name=/^(localStorage|sessionStorage)$/]",
    message: 'No window.localStorage/sessionStorage — XSS exfiltration risk. Keep tokens in module memory.',
  },
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML is an XSS sink — render text, or sanitise + justify with a one-line comment.',
  },
  {
    selector: "Property[key.name='dangerouslySetInnerHTML']",
    message: 'dangerouslySetInnerHTML is an XSS sink — render text, or sanitise + justify with a one-line comment.',
  },
  {
    selector: "Literal[value=/^http:\\/\\/(?!localhost|127\\.0\\.0\\.1)/]",
    message: 'Cleartext http:// URL — use https:// or an env var (http://localhost is allowed for dev).',
  },
];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      // Frontend security guards (see docs/agents/security.md §Frontend).
      'no-restricted-syntax': ['error', ...frontendSecurityRules],
    },
  },
);
