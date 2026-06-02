import { CheckpointSchema, StorySchema } from "./story-schema";

describe("story-schema", () => {
  it("accepts stories with and without arc_template", () => {
    expect(() => StorySchema.parse({
      title: "Story",
      global_lorebook: "Lorebook",
      checkpoints: [{ id: "cp-1", name: "Intro", objective: "Start" }],
    })).not.toThrow();

    expect(() => StorySchema.parse({
      title: "Story",
      arc_template: "freytag",
      global_lorebook: "Lorebook",
      checkpoints: [{ id: "cp-1", name: "Intro", objective: "Start" }],
    })).not.toThrow();
  });

  it("accepts checkpoint tension_target and progress_override in range", () => {
    expect(() => CheckpointSchema.parse({
      id: "cp-1",
      name: "Intro",
      objective: "Start",
      tension_target: 0,
      progress_override: 1,
    })).not.toThrow();

    expect(() => CheckpointSchema.parse({
      id: "cp-1",
      name: "Intro",
      objective: "Start",
      tension_target: 1,
      progress_override: 0,
    })).not.toThrow();
  });

  it("rejects out-of-range checkpoint pacing fields", () => {
    expect(() => CheckpointSchema.parse({
      id: "cp-1",
      name: "Intro",
      objective: "Start",
      tension_target: -0.01,
    })).toThrow();

    expect(() => CheckpointSchema.parse({
      id: "cp-1",
      name: "Intro",
      objective: "Start",
      tension_target: 1.01,
    })).toThrow();

    expect(() => CheckpointSchema.parse({
      id: "cp-1",
      name: "Intro",
      objective: "Start",
      progress_override: -0.01,
    })).toThrow();

    expect(() => CheckpointSchema.parse({
      id: "cp-1",
      name: "Intro",
      objective: "Start",
      progress_override: 1.01,
    })).toThrow();
  });
});
