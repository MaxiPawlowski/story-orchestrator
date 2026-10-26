import { workspaceNavigation, type WorkspaceIntent } from "./workspaceNavigation";
import { settingIntent } from "./workspaceRoutes";

export const revealSetting = (id: string, open: (intent: WorkspaceIntent) => void = workspaceNavigation.open) => {
  const element = document.getElementById(id);
  if (!element) { open(settingIntent(id)); return; }
  for (let details = element.closest("details"); details; details = details.parentElement?.closest("details") ?? null) details.open = true;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  element.classList.add("so-revealed");
  window.setTimeout(() => element.classList.remove("so-revealed"), 2000);
};
