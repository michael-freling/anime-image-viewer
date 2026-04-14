/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  // jsdom so tests that touch window/localStorage (e.g. zustand persist) work;
  // node-only tests don't care either way.
  testEnvironment: "jsdom",

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
