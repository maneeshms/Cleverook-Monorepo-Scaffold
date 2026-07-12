export default {
  displayName: 'api',
  preset: '../../jest.preset.js',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    // Module files are pure wiring (composition), exercised end-to-end by the
    // e2e suite — unit coverage measures behaviour, not decorator metadata.
    '!src/**/*.module.ts',
    '!src/**/index.ts',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
  ],
};
