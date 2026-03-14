describe("orchestratorManager", () => {
  const loadModule = async () => {
    jest.resetModules();

    const session = {
      getOrchestrator: jest.fn(() => ({ id: "orch" })),
      getTalkControlInterceptor: jest.fn(() => "interceptor"),
    };

    const manager = await import("@controllers/orchestratorManager");
    return { manager, session };
  };

  it("tracks the active session and exposes runtime accessors", async () => {
    const { manager, session } = await loadModule();

    manager.setActiveOrchestratorSession(session as any);

    expect(manager.getActiveOrchestratorSession()).toBe(session);
    expect(manager.getOrchestrator()).toEqual({ id: "orch" });
    expect(manager.getTalkControlInterceptor()).toBe("interceptor");
  });

  it("returns safe defaults when no session is active", async () => {
    const { manager, session } = await loadModule();

    manager.setActiveOrchestratorSession(session as any);
    expect(manager.getActiveOrchestratorSession()).toBe(session);

    manager.setActiveOrchestratorSession(null);

    expect(manager.getActiveOrchestratorSession()).toBeNull();
    expect(manager.getOrchestrator()).toBeNull();
    expect(manager.getTalkControlInterceptor()).toBeUndefined();
  });
});
