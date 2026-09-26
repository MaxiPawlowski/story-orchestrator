import { scriptModule } from "./modules";
import { log } from "@utils/log";

export function bindNavbarDrawerToggle(toggle: HTMLElement): () => void {
  if (typeof scriptModule.doNavbarIconClick !== "function") {
    log.warn("host has no doNavbarIconClick; drawer toggle inert");
    return () => undefined;
  }
  const onClick = () => {
    void scriptModule.doNavbarIconClick.call(toggle);
  };
  toggle.addEventListener("click", onClick);
  return () => toggle.removeEventListener("click", onClick);
}

export function toggleNavbarDrawer(toggle: HTMLElement): void {
  if (typeof scriptModule.doNavbarIconClick !== "function") return;
  void scriptModule.doNavbarIconClick.call(toggle);
}
