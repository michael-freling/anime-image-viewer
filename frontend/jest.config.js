/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: "node",

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
