import { scriptModule } from "./modules";
import { log } from "@utils/log";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

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

export function openGroupMemberList(): WriteResult<{ opened: true }> {
  const panel = document.getElementById("right-nav-panel");
  const toggle = document.getElementById("unimportantYes");
  if (!panel || !toggle) return couldNot("SillyTavern's character panel is not on this page");
  if (!panel.classList.contains("openDrawer")) toggleNavbarDrawer(toggle);
  document.getElementById("rm_button_selected_ch")?.click();
  document.getElementById("rm_group_members")?.scrollIntoView({ block: "center" });
  return wrote({ opened: true });
}
