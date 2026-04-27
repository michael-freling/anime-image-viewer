/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  // jsdom so tests that touch window/localStorage (e.g. zustand persist) work;
  // node-only tests don't care either way.
  testEnvironment: "jsdom",

  // jsdom lacks TextEncoder/matchMedia which react-router v7 and Chakra v3
  // touch at import time; the setup file polyfills both before any
  // module-under-test is imported.
  setupFilesAfterEnv: ["<rootDir>/__tests__/jest.setup.ts"],

  // Default testMatch includes EVERY file under __tests__/, which picks up
  // helper modules (test-utils.tsx, jest.setup.ts, chakra-stub.ts, ...). Scope
  // the match to *.test.[jt]s[x] only so helpers live next to the tests
  // without triggering "must contain at least one test" failures.
  testMatch: ["**/__tests__/**/*.test.[jt]s?(x)"],

  transform: {
    "^.+.tsx?$": ["ts-jest",{
      tsconfig: "<rootDir>/__tests__/tsconfig.json"
    }],
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
