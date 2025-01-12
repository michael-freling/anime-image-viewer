/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  testEnvironment: "node",

  transform: {
    "^.+.tsx?$": ["ts-jest",{
      tsconfig: "<rootDir>/__tests__/tsconfig.json"
    }],
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
};
