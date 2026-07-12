const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.base.json');

module.exports = {
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/../../',
  }),
  coverageDirectory: '<rootDir>/coverage',
  // Quality gate: unit tests always run with coverage and must keep every
  // metric at >= 90%. e2e configs override collectCoverage to false.
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/index.ts',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
    '!src/**/migrations/**',
    '!src/data-source.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
