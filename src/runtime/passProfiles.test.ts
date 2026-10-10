import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { PASS_ROLES } from "@extraction/passRole";
import { resolveRoute, sanitizePassProfiles } from "./passProfiles";

const exists = (ids: string[]) => (id: string) => ids.includes(id);

describe("per-pass profile routing (v2.4 plan 08 T18)", () => {
  it("an unset role uses the memory model profile: today's behaviour is the default for every role", () => {
    for (const role of PASS_ROLES) {
      expect(resolveRoute({ profileId: "memory", profiles: {} }, role, exists(["memory"]))).toEqual({ ok: true, route: { kind: "profile", profileId: "memory" }, source: "fallback" });
      expect(resolveRoute({ profileId: "memory" }, role, exists(["memory"]))).toEqual({ ok: true, route: { kind: "profile", profileId: "memory" }, source: "fallback" });
    }
  });

  it("a set role routes to its own profile", () => {
    expect(resolveRoute({ profileId: "memory", profiles: { director: "fast" } }, "director", exists(["memory", "fast"]))).toEqual({ ok: true, route: { kind: "profile", profileId: "fast" }, source: "role" });
    expect(resolveRoute({ profileId: "memory", profiles: { director: "fast" } }, "curator", exists(["memory", "fast"]))).toEqual({ ok: true, route: { kind: "profile", profileId: "memory" }, source: "fallback" });
  });

  it("a role set to a profile that no longer exists refuses instead of silently falling back", () => {
    expect(resolveRoute({ profileId: "memory", profiles: { curator: "deleted" } }, "curator", exists(["memory"]))).toEqual({ ok: false, profileId: "deleted", reason: expect.stringContaining("World Info curator") });
  });

  it("never routes to an empty id: the sanitizer drops blank and unknown roles", () => {
    expect(sanitizePassProfiles({ read: "", director: "  ", curator: "c", bogus: "x", synthesis: 7 })).toEqual({ curator: "c" });
    expect(sanitizePassProfiles(null)).toBeUndefined();
    expect(sanitizePassProfiles({})).toBeUndefined();
  });

  it("keeps the fallback null when no memory model is chosen, so the call reports it as today", () => {
    expect(resolveRoute({ profileId: null }, "read", exists([]))).toEqual({ ok: true, route: null, source: "fallback" });
  });
});

// Census style: every file that calls the model client names the role of each call, as a literal.
const SRC = join(__dirname, "..");
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return walk(path);
  return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
});

const CALL_SITE_ROLES: Record<string, string[]> = {
  "copilot/agent/route.ts": [],
  "copilot/authoring.ts": [],
  "extraction/modelRoute.ts": [],
  "extraction/scheduler.ts": ["read"],
  "extraction/sharedRead.ts": [],
  "generation/critic.ts": [],
  "generation/generate.ts": [],
  "generation/living/direct.ts": [],
  "runtime/askHost.ts": ["authoring"],
  "runtime/canonSynthesis.ts": ["synthesis"],
  "runtime/chapterSeal.ts": ["synthesis"],
  "runtime/coordinators/agendaProposalCoordinator.ts": ["curator"],
  "runtime/coordinators/copilotCoordinator.ts": ["authoring"],
  "runtime/coordinators/expansionCoordinator.ts": ["authoring"],
  "runtime/coordinators/extractionCoordinator.ts": ["read", "synthesis"],
  "runtime/coordinators/innerCoordinator.ts": ["inner"],
  "runtime/coordinators/memoryCoordinator.ts": ["read", "synthesis"],
  "runtime/coordinators/stagecraftCoordinator.ts": ["curator"],
  "runtime/liveSuite.ts": ["read", "curator"],
  "runtime/loreCreator.ts": ["lore"],
  "runtime/memorizeBacklog.ts": ["read"],
  "runtime/roleCalibration.ts": ["authoring", "curator", "director", "synthesis"],
  "runtime/roleSelfTest.ts": ["authoring", "curator", "director", "synthesis", "inner", "lore"],
  "runtime/sceneArmRunner.ts": ["read"],
  "runtime/selfTest.ts": ["read"],
  "runtime/suggestionsHost.ts": ["read"],
  "runtime/wiring/talk.ts": ["director"],
  "studio/components/StudioCopilot.stories.tsx": ["authoring"],
  "studio/studioAssist.ts": ["authoring"],
};

describe("every model call names its role (census)", () => {
  const callers = walk(SRC)
    .filter((path) => !path.endsWith(join("extraction", "client.ts")))
    .filter((path) => /\b(askText|askReply|modelOf\(options\)|callExtractionReply|runSharedRead|runAuthoringStage|runDriverSuggest|runDriverReport|generateReviewedBeats|generateBeats|runCritic)\(/.test(readFileSync(path, "utf8")))
    .map((path) => path.slice(SRC.length + 1).replace(/\\/g, "/"))
    .sort();

  it("every file that calls the client is listed", () => {
    expect(callers).toEqual(Object.keys(CALL_SITE_ROLES).sort());
  });

  it.each(Object.entries(CALL_SITE_ROLES).filter(([, roles]) => roles.length))("%s passes its role(s) as a literal", (file, roles) => {
    const text = readFileSync(join(SRC, file), "utf8");
    for (const role of roles) expect({ file, role, literal: new RegExp(`role: "${role}"`).test(text) }).toEqual({ file, role, literal: true });
  });

  it("the census check fails on a synthetic offender", () => {
    expect(/role: "curator"/.test("askText(model, prompt, { pass })")).toBe(false);
  });
});
