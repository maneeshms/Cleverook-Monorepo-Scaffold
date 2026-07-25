// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Frontend security guard (see docs/agents/security.md §Frontend). React Native
// has no localStorage/dangerouslySetInnerHTML, so only the cleartext-URL guard
// applies here; the refresh token belongs in expo-secure-store, never
// AsyncStorage (enforced by review — AsyncStorage is plaintext on disk).
module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*'] },
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^http:\\/\\/(?!localhost|127\\.0\\.0\\.1)/]",
          message:
            'Cleartext http:// URL — use https:// or EXPO_PUBLIC_API_URL (http://localhost is allowed for dev).',
        },
      ],
    },
  },
]);
