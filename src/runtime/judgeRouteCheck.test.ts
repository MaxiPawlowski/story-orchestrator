import { defaultJudgeSettings, judgeProviderControlId, judgeRoute, judgeRouteGaps, type JudgeProviderId, type JudgeRouteKey, type JudgeSettings } from "@judge/index";
import { CHECKS, runCheck, type Check } from "./checks";
import { installFindings } from "./repair";
import { createSaveHealth } from "./saveHealth";
import type { RuntimeSnapshot } from "./types";

const routed = (routes: Partial<Record<JudgeRouteKey, JudgeProviderId>>, patch: Partial<JudgeSettings> = {}): JudgeSettings => {
  const base = defaultJudgeSettings();
  return { ...base, ...patch, provider: { ...base.provider, ...routes } };
};

const snapshot = (settings: JudgeSettings, warden = false, authorView = true): RuntimeSnapshot => ({
  storyId: null,
  extraction: { settings: { enabled: true, profileId: "p" } },
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  saveHealth: createSaveHealth(),
  ui: { authorView },
  judgeRouteGaps: judgeRouteGaps(settings, warden),
}) as unknown as RuntimeSnapshot;

const check = CHECKS.find((entry) => entry.id === "judge-route-uncalibrated") as Check;

describe("v2.8 small fixes 1: an uncalibrated judge route is a setup finding", () => {
  it("is a degrades, author, install check on the judge feature", () => {
    expect(check).toMatchObject({ severity: "degrades", audience: "author", scope: "install", feature: "judge" });
  });

  it("default routes raise nothing", () => {
    expect(judgeRouteGaps(defaultJudgeSettings(), true)).toEqual([]);
    expect(runCheck(check, snapshot(defaultJudgeSettings(), true))).toBeNull();
  });

  it("a use routed to a provider with no calibration row fires, names it and points at its provider control", () => {
    const settings = routed({ canonDraft: "systemone-local" });
    expect(judgeRouteGaps(settings, false)).toEqual([{ key: "canonDraft", provider: "systemone-local", problem: "unmeasured" }]);
    const result = runCheck(check, snapshot(settings));
    expect(result?.detail).toMatch(/Checked canon drafts on .+never measured there/);
    expect(result?.target).toEqual({ kind: "setting", id: judgeProviderControlId("canonDraft") });
    expect(result?.player).toBeNull();
    expect(installFindings(snapshot(settings)).map((step) => step.check)).toContain("judge-route-uncalibrated");
    expect(installFindings(snapshot(settings, false, false)).map((step) => step.check)).not.toContain("judge-route-uncalibrated");
  });

  it("agrees with the call-time refusal", () => {
    const settings = routed({ canonDraft: "systemone-local" });
    expect(judgeRoute(settings, "canonDraft").refused).toBe("uncalibrated");
  });

  it("an off use, an off judge or an off warden raise nothing", () => {
    expect(judgeRouteGaps(routed({ canonDraft: "systemone-local" }, { uses: { ...defaultJudgeSettings().uses, canonDraft: false } }), false)).toEqual([]);
    expect(judgeRouteGaps(routed({ canonDraft: "systemone-local" }, { enabled: false }), false)).toEqual([]);
    expect(judgeRouteGaps(routed({ warden: "systemone-local" }), false).map((gap) => gap.key)).not.toContain("warden");
    expect(judgeRouteGaps(routed({ warden: "systemone-local" }), true).map((gap) => gap.key)).toContain("warden");
  });
});
