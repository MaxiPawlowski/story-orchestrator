import { scriptModule } from "./modules";

export function bindNavbarDrawerToggle(toggle: HTMLElement): void {
  if (typeof scriptModule.doNavbarIconClick !== "function") {
    console.warn("[Story Orchestrator] host has no doNavbarIconClick; drawer toggle inert");
    return;
  }
  toggle.addEventListener("click", () => {
    void scriptModule.doNavbarIconClick.call(toggle);
  });
}

export function toggleNavbarDrawer(toggle: HTMLElement): void {
  if (typeof scriptModule.doNavbarIconClick !== "function") return;
  void scriptModule.doNavbarIconClick.call(toggle);
}
