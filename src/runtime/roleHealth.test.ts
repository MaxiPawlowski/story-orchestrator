import { buildRoleRoutes, RoleHealth } from "./roleHealth";
import type { RoleSelfTestResult } from "./roleSelfTest";

const exists = (ids: string[]) => (id: string) => ids.includes(id);
const healthy = () => null;
const test = (role: RoleSelfTestResult["role"], profileId: string, status: "pass" | "fail"): RoleSelfTestResult => ({ role, profileId, status, ranAt: "t", detail: status === "pass" ? "ok" : "3 of 3 wrong" });

describe("role routes (v2.4 plan 08 T18)", () => {
  it("every unset role reads as the memory model, which is not a problem", () => {
    const routes = buildRoleRoutes({ settings: { profileId: "memory" }, exists: exists(["memory"]), health: healthy, selfTests: {} });
    expect(routes.map((route) => [route.role, route.state, route.profileId])).toEqual([
      ["read", "fallback", "memory"], ["synthesis", "fallback", "memory"], ["authoring", "fallback", "memory"], ["director", "fallback", "memory"], ["curator", "fallback", "memory"],
    ]);
  });

  it("a set role whose profile was deleted is missing and names the dangling id", () => {
    const [curator] = buildRoleRoutes({ settings: { profileId: "memory", profiles: { curator: "gone" } }, exists: exists(["memory"]), health: healthy, selfTests: {} }).filter((route) => route.role === "curator");
    expect(curator).toMatchObject({ state: "missing", profileId: "gone" });
    expect(curator.detail).toContain("gone");
  });

  it("a set role whose own profile's breaker is open is not answering; the read path's health does not leak into it", () => {
    const health = (id: string) => (id === "fast" ? { kind: "transport" as const, detail: "API request failed", since: 1, nextProbeAt: 2, probing: false } : null);
    const routes = buildRoleRoutes({ settings: { profileId: "memory", profiles: { director: "fast" } }, exists: exists(["memory", "fast"]), health, selfTests: {} });
    expect(routes.find((route) => route.role === "director")).toMatchObject({ state: "not-answering", detail: expect.stringContaining("API request failed") });
    expect(routes.find((route) => route.role === "read")?.state).toBe("fallback");
  });

  it("a config problem on a routed profile is not-configured", () => {
    const health = (id: string) => (id === "fast" ? { kind: "config" as const, detail: "the profile has no API set" } : null);
    const routes = buildRoleRoutes({ settings: { profileId: "memory", profiles: { director: "fast" } }, exists: exists(["memory", "fast"]), health, selfTests: {} });
    expect(routes.find((route) => route.role === "director")).toMatchObject({ state: "not-configured" });
  });

  it("a failed self-test on the profile the role is routed to is failed; one run against another profile is ignored", () => {
    const settings = { profileId: "memory", profiles: { director: "fast" } };
    const failedHere = buildRoleRoutes({ settings, exists: exists(["memory", "fast", "old"]), health: healthy, selfTests: { director: test("director", "fast", "fail") } });
    expect(failedHere.find((route) => route.role === "director")).toMatchObject({ state: "failed", detail: expect.stringContaining("3 of 3 wrong") });
    const stale = buildRoleRoutes({ settings, exists: exists(["memory", "fast", "old"]), health: healthy, selfTests: { director: test("director", "old", "fail") } });
    expect(stale.find((route) => route.role === "director")?.state).toBe("untested");
    const passed = buildRoleRoutes({ settings, exists: exists(["memory", "fast"]), health: healthy, selfTests: { director: test("director", "fast", "pass") } });
    expect(passed.find((route) => route.role === "director")?.state).toBe("ok");
  });

  it("the singleton reports nothing until attached, and forgets its self-tests on detach", () => {
    const health = new RoleHealth();
    expect(health.view()).toEqual([]);
    const notify = jest.fn();
    const detach = health.attach({ settings: () => ({ profileId: "memory", profiles: { curator: "c" } }), exists: exists(["memory", "c"]), health: healthy, notify });
    health.record(test("curator", "c", "fail"));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(health.view().find((route) => route.role === "curator")?.state).toBe("failed");
    detach();
    expect(health.view()).toEqual([]);
    health.attach({ settings: () => ({ profileId: "memory", profiles: { curator: "c" } }), exists: exists(["memory", "c"]), health: healthy, notify });
    expect(health.view().find((route) => route.role === "curator")?.state).toBe("untested");
  });
});
