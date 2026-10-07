import type { Check, CheckSeverity } from "./checks";
import type { RuntimeSnapshot } from "./types";

const persona = (id: string, severity: CheckSeverity, detect: Check["detect"]): Check =>
  ({ id, area: "persona", scope: "chat", audience: "player", severity, feature: "player-setup", detect });

const setupOf = (snapshot: RuntimeSnapshot) => snapshot.playerSetup ?? null;

export const PERSONA_FIT_CHECK = persona("persona-fit", "blocks", (snapshot) => {
  const fixed = snapshot.requirements?.missingFixedName;
  return fixed ? {
    consequence: `This story is played as "${fixed}", so it waits until a persona with that name is chosen.`,
    detail: `The story fixes the player's name to "${fixed}". Choose or create that persona on the start page.`,
    action: { kind: "open-player-setup", label: "Open the start page" },
  } : null;
});

export const PERSONA_CAST_CHECK = persona("persona-fit-cast", "degrades", (snapshot) => {
  const clash = setupOf(snapshot)?.castClash;
  return clash ? {
    consequence: `Your persona shares a name with a character in this story ("${clash}"), so the two get mixed up.`,
    detail: "The player is never a cast member: play as a persona with another name.",
  } : null;
});

export const PERSONA_EMPTY_CHECK = persona("persona-fit-empty", "info", (snapshot) => {
  const setup = setupOf(snapshot);
  return setup?.injectOff && setup.descriptionEmpty ? {
    consequence: "The characters know nothing about you: your persona has no description, and this story does not describe your role.",
    detail: "player.inject is false and the persona's description is empty.",
  } : null;
});

export const PERSONA_SWITCH_CHECK = persona("persona-switch", "degrades", (snapshot) => {
  const setup = setupOf(snapshot);
  if (!setup?.switched || !setup.record?.avatarId) return null;
  const started = setup.lockedName ?? "another persona";
  return {
    consequence: `This story was started as ${started}; switching mid-story breaks what characters know about you.`,
    detail: `Selected now: ${setup.current?.name ?? "another persona"}.`,
    action: { kind: "switch-persona", avatarId: setup.record.avatarId, label: "Switch back" },
  };
});

export const PERSONA_BLOCK_CHECKS: readonly Check[] = [PERSONA_FIT_CHECK];
export const PERSONA_DEGRADE_CHECKS: readonly Check[] = [PERSONA_SWITCH_CHECK, PERSONA_CAST_CHECK];
export const PERSONA_INFO_CHECKS: readonly Check[] = [PERSONA_EMPTY_CHECK];
