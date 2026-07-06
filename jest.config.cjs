module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src/engine", "<rootDir>/src/extraction", "<rootDir>/src/pacing", "<rootDir>/src/generation", "<rootDir>/src/runtime", "<rootDir>/src/memory", "<rootDir>/src/studio"],
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
    "^@runtime/(.*)$": "<rootDir>/src/runtime/$1",
    "^@extraction/(.*)$": "<rootDir>/src/extraction/$1",
    "^@pacing/(.*)$": "<rootDir>/src/pacing/$1",
    "^@generation/(.*)$": "<rootDir>/src/generation/$1",
    "^@memory/(.*)$": "<rootDir>/src/memory/$1",
  },
  clearMocks: true,
};
