import { PASS_ROLES } from "@extraction/passRole";
import { resolveRoute, roleDefaultFrom, setRoleDefault } from "./passProfiles";
import { buildRoleRoutes } from "./roleHealth";

const exists = (ids: string[]) => (id: string) => ids.includes(id);

const profiles = [
  { id: "artemis", kind: "text", source: "llamacpp" },
  { id: "gpt", kind: "chat", source: "openai" },
  { id: "ds", kind: "chat", source: "deepseek" },
  { id: "ds-pro", kind: "chat", source: "deepseek" },
];

describe("v2.8 09 owner 2026-10-10: the wizard's default model is the install's DeepSeek Chat Completion profile", () => {
  const defaults = roleDefaultFrom(profiles);
  const ids = exists(["memory", "artemis", "gpt", "ds", "ds-pro"]);

  it("an unset authoring role takes the first DeepSeek profile, and says it is the default", () => {
    expect(resolveRoute({ profileId: "memory" }, "authoring", ids, undefined, defaults)).toEqual({ ok: true, route: { kind: "profile", profileId: "ds" }, source: "default" });
  });

  it("every other role keeps the memory model, and lore keeps inheriting the curator", () => {
    for (const role of PASS_ROLES.filter((entry) => entry !== "authoring")) {
      expect(resolveRoute({ profileId: "memory" }, role, ids, undefined, defaults)).toEqual({ ok: true, route: { kind: "profile", profileId: "memory" }, source: "fallback" });
    }
  });

  it("the author's own choice wins: an assigned profile, or a harness route", () => {
    expect(resolveRoute({ profileId: "memory", profiles: { authoring: "gpt" } }, "authoring", ids, undefined, defaults)).toMatchObject({ route: { profileId: "gpt" }, source: "role" });
    const harness = { profileId: "memory", routes: { authoring: { route: { kind: "harness" as const, harness: "opencode" as const, model: "x/y", options: {} } } } };
    expect(resolveRoute(harness, "authoring", ids, undefined, defaults)).toMatchObject({ route: { kind: "harness" }, source: "role" });
  });

  it("an install with no DeepSeek profile is unchanged: the memory model, never a text-completion profile", () => {
    const none = roleDefaultFrom(profiles.filter((profile) => profile.source !== "deepseek"));
    expect(resolveRoute({ profileId: "memory" }, "authoring", ids, undefined, none)).toEqual({ ok: true, route: { kind: "profile", profileId: "memory" }, source: "fallback" });
    expect(roleDefaultFrom([{ id: "t", kind: "text", source: "deepseek" }])("authoring")).toBeNull();
  });

  it("a default that no longer exists falls through to the memory model instead of refusing", () => {
    expect(resolveRoute({ profileId: "memory" }, "authoring", exists(["memory"]), undefined, defaults)).toMatchObject({ route: { profileId: "memory" }, source: "fallback" });
  });

  it("the install-wide hook is what an unparameterised call reads, and clearing it restores the old default", () => {
    setRoleDefault(defaults);
    try {
      expect(resolveRoute({ profileId: "memory" }, "authoring", ids)).toMatchObject({ route: { profileId: "ds" }, source: "default" });
    } finally {
      setRoleDefault(null);
    }
    expect(resolveRoute({ profileId: "memory" }, "authoring", ids)).toMatchObject({ route: { profileId: "memory" }, source: "fallback" });
  });

  it("the role view treats the default as a real route: tested, health-checked and marked defaulted", () => {
    setRoleDefault(defaults);
    try {
      const health = jest.fn(() => null);
      const [authoring] = buildRoleRoutes({ settings: { profileId: "memory" }, exists: ids, health, selfTests: {} }).filter((route) => route.role === "authoring");
      expect(authoring).toMatchObject({ profileId: "ds", state: "untested", defaulted: true });
      expect(health).toHaveBeenCalledWith("ds");
    } finally {
      setRoleDefault(null);
    }
  });
});
