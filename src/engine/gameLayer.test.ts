import type * as Validate from "./validate";
import type * as Layer from "./validate/gameLayer";

const plain = {
  format: 2, title: "Plain", description: "No game layer.", roster: [],
  qualities: [{ key: "paid", type: "bool", source: "extractor", rubric: "Paid?" }],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }],
  transitions: [],
};
const gamey = { ...plain, quests: [{ id: "debt", title: "The debt", kind: "side", steps: [], done_when: { q: "paid", op: "==", v: true } }] };

const fresh = (): { validate: typeof Validate; layer: typeof Layer } => {
  let loaded: { validate: typeof Validate; layer: typeof Layer } | null = null;
  jest.isolateModules(() => {
    loaded = { validate: jest.requireActual("./validate"), layer: jest.requireActual("./validate/gameLayer") };
  });
  return loaded!;
};

describe("the quest layer loads apart from the main bundle", () => {
  test("before it loads, a story without quests parses and a story with them is refused, never half-read", () => {
    const { validate, layer } = fresh();
    expect(layer.gameLayer()).toBeNull();
    expect(Array.isArray(validate.parseStoryV2(plain))).toBe(false);
    expect(validate.parseStoryV2(gamey)).toEqual([{ path: "$", message: layer.GAME_LAYER_LOADING }]);
  });

  test("once loaded, the same story parses", async () => {
    const { validate, layer } = fresh();
    await layer.loadGameLayer();
    const parsed = validate.parseStoryV2(gamey);
    expect(Array.isArray(parsed)).toBe(false);
  });

  test("the probe sees every game field", () => {
    const { layer } = fresh();
    expect(layer.usesGameLayer(plain)).toBe(false);
    expect(layer.usesGameLayer({ ...plain, qualities: [{ ...plain.qualities[0], display: { public: true } }] })).toBe(true);
    expect(layer.usesGameLayer({ ...plain, checkpoints: [{ ...plain.checkpoints[0], checks: [] }] })).toBe(true);
    expect(layer.usesGameLayer({ ...plain, transitions: [{ check: {} }] })).toBe(true);
    expect(layer.usesGameLayer({ ...plain, widgets: [] })).toBe(true);
  });
});
