module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src/engine"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json", diagnostics: false }],
  },
  moduleNameMapper: {
    "^@components/(.*)$": "<rootDir>/src/components/$1",
    "^@services/(.*)$": "<rootDir>/src/services/$1",
    "^@hooks/(.*)$": "<rootDir>/src/hooks/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
    "^@controllers/(.*)$": "<rootDir>/src/controllers/$1",
    "^@constants/(.*)$": "<rootDir>/src/constants/$1",
    "^@store/(.*)$": "<rootDir>/src/store/$1",
    "^@engine/(.*)$": "<rootDir>/src/engine/$1",
  },
  clearMocks: true,
};
