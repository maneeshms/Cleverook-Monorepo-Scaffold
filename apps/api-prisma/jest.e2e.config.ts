export default {
  displayName: 'api-prisma-e2e',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  setupFiles: ['reflect-metadata', '<rootDir>/test/setup-e2e.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.e2e.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@clevscaffold/common(.*)$': '<rootDir>/../../libs/common/src$1',
    '^@clevscaffold/config(.*)$': '<rootDir>/../../libs/config/src$1',
    '^@clevscaffold/logger(.*)$': '<rootDir>/../../libs/logger/src$1',
  },
  maxWorkers: 1,
};
