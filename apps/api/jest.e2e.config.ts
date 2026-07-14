export default {
  displayName: 'api-e2e',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  setupFiles: ['reflect-metadata', '<rootDir>/test/setup-e2e.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.e2e.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@clevrook/common(.*)$': '<rootDir>/../../libs/common/src$1',
    '^@clevrook/database(.*)$': '<rootDir>/../../libs/database/src$1',
    '^@clevrook/config(.*)$': '<rootDir>/../../libs/config/src$1',
    '^@clevrook/logger(.*)$': '<rootDir>/../../libs/logger/src$1',
    '^@clevrook/messaging(.*)$': '<rootDir>/../../libs/messaging/src$1',
  },
  // Serial: e2e specs share one Postgres test database and reset it between files.
  maxWorkers: 1,
};
