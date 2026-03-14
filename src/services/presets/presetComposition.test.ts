import { clonePresetFields, composePresetObject } from "./presetComposition";

describe("presetComposition", () => {
  const settingNames = ["temperature", "top_p", "max_tokens"];

  it("keeps fallback below checkpoint overrides", () => {
    const result = composePresetObject({
      base: { temperature: 1.1, top_p: 0.95, logit_bias: [{ id: 1 }] },
      fallback: { temperature: 0.6, top_p: 0.7, max_tokens: 150 },
      checkpointOverride: { temperature: 0.2 } as any,
      settingNames,
    });

    expect(result).toEqual({
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 150,
      logit_bias: [{ id: 1 }],
    });
  });

  it("clones only known preset fields", () => {
    const source = {
      temperature: 0.8,
      nested: { ignored: true },
      logit_bias: [{ token: 42 }],
    };

    const cloned = clonePresetFields(source, settingNames);
    expect(cloned).toEqual({ temperature: 0.8, logit_bias: [{ token: 42 }] });

    (source.logit_bias as Array<{ token: number }>)[0].token = 99;
    expect((cloned.logit_bias as Array<{ token: number }>)[0].token).toBe(42);
  });
});
