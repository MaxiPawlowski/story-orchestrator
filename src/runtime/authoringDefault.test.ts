import { PASS_ROLES } from "@extraction/passRole";
import { AUTHORING_DEFAULT_HARNESS, resolveRoute, roleDefaultFrom, setRoleDefault } from "./passProfiles";
import { fallbackRoute } from "./harnessFallback";
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
    expect(roleDefaultFrom([{ id: "t", kind: "text", source: "deepseek" }])("authoring")).toEqual([]);
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

describe("v2.8 09 owner 2026-10-10 (second decision): opencode gpt-6.1-sol is the wizard's default when the harness offers it", () => {
  const sol = { kind: "harness", harness: "opencode", model: "openai/gpt-6.1-sol", options: {} };
  const offered = (harness: string, model: string) => harness === AUTHORING_DEFAULT_HARNESS.harness && model === AUTHORING_DEFAULT_HARNESS.model;
  const ids = exists(["memory", "ds"]);

  it("offered: an unset authoring role takes sol, ahead of the DeepSeek profile", () => {
    expect(AUTHORING_DEFAULT_HARNESS).toEqual({ harness: "opencode", model: "openai/gpt-6.1-sol" });
    expect(resolveRoute({ profileId: "memory" }, "authoring", ids, undefined, roleDefaultFrom(profiles, offered))).toEqual({ ok: true, route: sol, source: "default" });
  });

  it("not offered: DeepSeek, then the memory model, exactly as before", () => {
    expect(resolveRoute({ profileId: "memory" }, "authoring", ids, undefined, roleDefaultFrom(profiles, () => false))).toMatchObject({ route: { profileId: "ds" }, source: "default" });
    expect(resolveRoute({ profileId: "memory" }, "authoring", ids, undefined, roleDefaultFrom([], () => false))).toMatchObject({ route: { profileId: "memory" }, source: "fallback" });
  });

  it("the author's choice still wins over sol, and every other role ignores it", () => {
    const defaults = roleDefaultFrom(profiles, offered);
    expect(resolveRoute({ profileId: "memory", profiles: { authoring: "ds" } }, "authoring", ids, undefined, defaults)).toMatchObject({ route: { profileId: "ds" }, source: "role" });
    for (const role of PASS_ROLES.filter((entry) => entry !== "authoring")) {
      expect(resolveRoute({ profileId: "memory" }, role, ids, undefined, defaults)).toMatchObject({ route: { profileId: "memory" }, source: "fallback" });
    }
  });

  it("a role effort rides the default harness route", () => {
    const settings = { profileId: "memory", routes: { authoring: { route: { options: { effort: "low" as const } } } } };
    expect(resolveRoute(settings, "authoring", ids, undefined, roleDefaultFrom(profiles, offered))).toMatchObject({ route: { kind: "harness", effort: "low" }, source: "default" });
  });

  it("a failed default harness call falls back to the next default, never when the author chose the route", () => {
    setRoleDefault(roleDefaultFrom(profiles, offered));
    try {
      expect(fallbackRoute({ profileId: "memory" }, "authoring", ids)).toEqual({ kind: "profile", profileId: "ds" });
      expect(fallbackRoute({ profileId: "memory" }, "authoring", exists(["memory"]))).toEqual({ kind: "profile", profileId: "memory" });
      expect(fallbackRoute({ profileId: "memory", profiles: { authoring: "ds" } }, "authoring", ids)).toBeNull();
      const chosen = { profileId: "memory", routes: { authoring: { route: { kind: "harness" as const, harness: "opencode" as const, model: "openai/gpt-6.1-sol", options: {} } } } };
      expect(fallbackRoute(chosen, "authoring", ids)).toBeNull();
      expect(fallbackRoute({ profileId: "memory" }, "read", ids)).toBeNull();
    } finally {
      setRoleDefault(null);
    }
    setRoleDefault(roleDefaultFrom(profiles, () => false));
    try {
      expect(fallbackRoute({ profileId: "memory" }, "authoring", ids)).toBeNull();
    } finally {
      setRoleDefault(null);
    }
  });

  it("the role view marks sol defaulted under its harness key", () => {
    setRoleDefault(roleDefaultFrom(profiles, offered));
    try {
      const [authoring] = buildRoleRoutes({ settings: { profileId: "memory" }, exists: ids, health: () => null, selfTests: {} }).filter((route) => route.role === "authoring");
      expect(authoring).toMatchObject({ profileId: "harness:opencode:openai/gpt-6.1-sol", defaulted: true });
    } finally {
      setRoleDefault(null);
    }
  });
});
