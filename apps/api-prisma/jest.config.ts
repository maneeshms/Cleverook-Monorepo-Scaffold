export default {
  displayName: 'api-prisma',
  preset: '../../jest.preset.js',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    // Module files are pure wiring, exercised by the e2e suite.
    '!src/**/*.module.ts',
    '!src/**/index.ts',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
  ],
};
