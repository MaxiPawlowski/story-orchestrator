import { STORY_FEATURE_IDS } from "@engine/featurePolicy";
import { FEATURE_CONTROLS } from "./featureControls";
import { FEATURE_CONTROL_PATHS } from "./featureControlPaths";

describe("feature controls", () => {
  it("label every control path, in path order", () => {
    for (const id of STORY_FEATURE_IDS) {
      expect(FEATURE_CONTROLS[id].controls.map(({ field, path }) => ({ field, path }))).toEqual(FEATURE_CONTROL_PATHS[id]);
      for (const control of FEATURE_CONTROLS[id].controls) expect(control.label).not.toBe(control.field);
    }
  });
});
