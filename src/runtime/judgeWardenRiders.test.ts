import { defaultJudgeSettings, judgeRouteGaps, routedProvider, WARDEN_RIDERS, type JudgeProviderId, type JudgeRouteKey, type JudgeSettings } from "@judge/index";
import { judgeReadiness } from "@judge/readinessRows";
import { FEATURES } from "@features/registry";
import { JudgeRuntime } from "./judge";
import type { GlobalSettings } from "./settingsModel";
import { testOwnership } from "../../test/findings/testOwnership";

const routed = (routes: Partial<Record<JudgeRouteKey, JudgeProviderId>>): JudgeSettings => {
  const base = defaultJudgeSettings();
  return { ...base, provider: { ...base.provider, ...routes } };
};

const runtime = (settings: JudgeSettings) => new JudgeRuntime({
  ownership: testOwnership(),
  getSettings: () => settings,
  transport: async () => ({ model: "jev", answers: {} }),
  status: async () => ({ configured: true }),
  record: () => undefined,
  context: () => ({ boundary: 0, messageId: 0 }),
});

const row = (settings: JudgeSettings, key: JudgeRouteKey) => judgeReadiness(settings, {}, null, { warden: true }).find((entry) => entry.key === key);

describe("v2.8 small fixes 6: attention and voice ride the warden's route", () => {
  it("their provider is the warden's, whatever their own stored route says", () => {
    expect(WARDEN_RIDERS).toEqual(["attentionCheck", "wardenVoice"]);
    const settings = routed({ attentionCheck: "systemone-local", wardenVoice: "llama-logprob" });
    expect(routedProvider(settings, "attentionCheck")).toBe("typesafe");
    expect(routedProvider(settings, "wardenVoice")).toBe("typesafe");
    expect(routedProvider(routed({ warden: "llama-logprob" }), "attentionCheck")).toBe("llama-logprob");
  });

  it("readiness and the setup finding read the route the call takes, not the ignored per-use one", () => {
    const settings = routed({ attentionCheck: "systemone-local" });
    expect(row(settings, "attentionCheck")?.provider).toBe("typesafe");
    expect(row(settings, "attentionCheck")?.uncalibratedOn).toBeUndefined();
    expect(judgeRouteGaps(settings, true).map((gap) => gap.key)).not.toContain("attentionCheck");
    expect(runtime(settings).ridesWarden("attentionCheck")).toBe(true);
  });

  it("calibration is enforced on the warden's route", () => {
    const settings = routed({ warden: "systemone-local" });
    expect(runtime(settings).ridesWarden("attentionCheck")).toBe(false);
    expect(row(settings, "attentionCheck")).toMatchObject({ provider: "systemone-local", uncalibratedOn: "systemone-local" });
    expect(judgeRouteGaps(settings, true)).toEqual(expect.arrayContaining([{ key: "attentionCheck", provider: "systemone-local", problem: "unmeasured" }]));
  });

  it("an ignored per-use route does not switch the local judge feature on", () => {
    const isOn = FEATURES.find((feature) => feature.id === "judge-local")?.isOn;
    const on = (judge: JudgeSettings) => isOn?.({ judge } as unknown as GlobalSettings);
    expect(on(routed({ attentionCheck: "systemone-local" }))).toBe(false);
    expect(on(routed({ warden: "systemone-local" }))).toBe(true);
  });
});
