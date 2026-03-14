type GenericRecord = Record<string, unknown>;

export function createRuntime(overrides: GenericRecord = {}) {
  return {
    checkpointIndex: 0,
    activeCheckpointKey: "cp-1",
    turnsSinceEval: 0,
    checkpointTurnCount: 0,
    checkpointStatusMap: {},
    ...overrides,
  };
}

export function createBasicStory(overrides: GenericRecord = {}) {
  return {
    title: "Story 1",
    description: "desc",
    roles: { dm: "DM" },
    checkpoints: [{ id: "cp-1", name: "CP1", objective: "obj" }],
    transitions: [],
    startId: "cp-1",
    ...overrides,
  };
}

export function createTalkControlStory(overrides: GenericRecord = {}) {
  return {
    roles: {},
    checkpoints: [],
    transitions: [],
    ...overrides,
  };
}

export function createArinContext(overrides: GenericRecord = {}) {
  return {
    groupId: "group-1",
    characters: [{ name: "Arin" }],
    ...overrides,
  };
}
