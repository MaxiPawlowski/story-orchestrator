import { authoredLayers, derivedLayers, indoorFrom, mergeEffect, pickBackdrop, readState, timeFrom, weatherFrom } from "./select";
import { defaultBackdropSettings } from "./settings";
import type { BackdropState } from "./types";

const state = (patch: Partial<BackdropState>): BackdropState => ({ sceneKey: "x", weather: null, timeOfDay: null, tension: 0, ...patch });
const kinds = (patch: Partial<BackdropState>) => derivedLayers(state(patch)).map((layer) => layer.kind);
const pick = (patch: Partial<Parameters<typeof pickBackdrop>[0]> = {}) => pickBackdrop({
  sceneKey: "forest road.jpg", values: {}, effect: null, settings: defaultBackdropSettings(), reducedMotion: false, ...patch,
});

describe("v3.0 45 A: backdrop state from story state", () => {
  it("reads weather and time words", () => {
    expect([weatherFrom("light drizzle"), weatherFrom("Thunderstorm"), weatherFrom("blizzard"), weatherFrom("morning mist"), weatherFrom("sunny"), weatherFrom(3)])
      .toEqual(["rain", "storm", "snow", "fog", "clear", null]);
    expect([timeFrom("late afternoon"), timeFrom("late morning"), timeFrom("today"), timeFrom("Sunday")]).toEqual(["day", "dawn", null, null]);
    expect([timeFrom("late evening"), timeFrom("Morning"), timeFrom("afternoon"), timeFrom("midnight"), timeFrom(undefined, true), timeFrom(undefined)])
      .toEqual(["night", "dawn", "day", "night", "night", null]);
  });

  it("guesses indoor from the background name only when it says so", () => {
    expect([indoorFrom("tavern_night.png"), indoorFrom("forest-road.jpg"), indoorFrom("abstract7.png")]).toEqual([true, false, undefined]);
    expect([indoorFrom("shallow river.png"), indoorFrom("mushroom forest.jpg"), indoorFrom("lighthouse cliff.jpg"), indoorFrom("portrait.png"), indoorFrom("castle interior.jpg"),
      indoorFrom("bedroom clean.jpg"), indoorFrom("seat cushion.png")]).toEqual([false, false, false, undefined, true, true, undefined]);
    expect([indoorFrom("forest-cabin.jpg"), indoorFrom("village tavern.png"), indoorFrom("churches.jpg"), indoorFrom("greenhouse exterior.png")]).toEqual([false, true, true, false]);
    expect([weatherFrom("no rain"), weatherFrom("after the storm, clear"), weatherFrom("rain")]).toEqual([null, "clear", "rain"]);
  });

  it("authored fields win over state, field by field, and a beat wins over the defaults", () => {
    const effect = mergeEffect({ weather: "snow", time: "dusk" }, { weather: "rain" });
    expect(effect).toEqual({ weather: "rain", time: "dusk" });
    expect(readState("cellar.png", { weather: "clear", time_of_day: "noon", tension_current: 2 }, effect)).toEqual({
      sceneKey: "cellar.png", weather: "rain", timeOfDay: "dusk", tension: 1, indoor: true,
    });
    expect(mergeEffect(undefined, undefined)).toBeNull();
  });
});

describe("v3.0 45 A: layers from state", () => {
  it("weather picks its layers outdoors; indoors keeps sky weather out", () => {
    expect(kinds({ weather: "rain" })).toEqual(["drift", "rain"]);
    expect(kinds({ weather: "storm" })).toEqual(["drift", "rain", "fog", "flicker"]);
    expect(kinds({ weather: "snow", indoor: true, timeOfDay: "night" })).toEqual(["drift", "dust", "flicker"]);
    expect(kinds({ timeOfDay: "night", indoor: false, sceneKey: "forest glade.jpg" })).toEqual(["drift", "fireflies"]);
    expect(kinds({ timeOfDay: "night", indoor: false, sceneKey: "city street.jpg" })).toEqual(["drift"]);
    expect(kinds({ timeOfDay: "night", weather: "snow", indoor: false, sceneKey: "forest.jpg" })).toEqual(["drift", "snow"]);
    expect(kinds({})).toEqual(["drift"]);
  });

  it("authored layers replace the derived ones, empty means none", () => {
    expect(pick({ effect: { layers: [] } }).layers).toEqual([]);
    expect(authoredLayers([{ kind: "embers", intensity: 0.3, color: "#ff0000" }, { kind: "embers" }])).toEqual([{ id: "embers", kind: "embers", params: { intensity: 0.3, color: "#ff0000" } }]);
    expect(pick({ values: { weather: "rain" }, effect: { layers: [{ kind: "snow" }] } }).layers.map((layer) => layer.kind)).toEqual(["snow"]);
  });

  it("reduced motion, the master switch and the effects switch leave the still only", () => {
    expect(pick({ values: { weather: "rain" }, reducedMotion: true }).layers).toEqual([]);
    expect(pick({ values: { weather: "rain" }, settings: { ...defaultBackdropSettings(), effects: false } }).layers).toEqual([]);
    expect(pick({ values: { weather: "rain" }, settings: { ...defaultBackdropSettings(), enabled: false } }).layers).toEqual([]);
  });

  it("intensity follows the setting, the authored scale and tension, capped at 1", () => {
    expect(pick().intensity).toBeCloseTo(0.5 * 0.85);
    expect(pick({ effect: { intensity: 0.5 } }).intensity).toBeCloseTo(0.25 * 0.85);
    expect(pick({ values: { tension_current: 1 }, settings: { ...defaultBackdropSettings(), intensity: 1 } }).intensity).toBe(1);
  });
});
