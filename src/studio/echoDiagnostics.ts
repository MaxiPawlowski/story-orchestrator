import { evaluateGate, type Story } from "@engine/index";
import { ECHO_NARRATOR } from "@engine/echoSchema";
import { unknownEntityNames } from "./labelDiagnostics";
import { mentions } from "./codexDiagnostics";
import { narratesPlayer } from "./cueDiagnostics";

type EchoCode = "echo-speaks-for-player" | "echo-names-unknown-entity" | "echo-gate-holds-never";

export const ECHO_CONSEQUENCES: Record<EchoCode, string> = {
  "echo-speaks-for-player": "The narrator or character is handed a line that says what the player does or feels, and may narrate it as fact; say what comes back instead.",
  "echo-names-unknown-entity": "While the player has not met someone or somewhere this cue names, the narrator's echo waits, and may expire before it lands.",
  "echo-gate-holds-never": "This echo is cancelled as soon as it is scheduled, unless the story changes its cancel gate first, so it may never land.",
};

export interface EchoRun {
  draft: Story;
  push: (code: EchoCode, severity: "warning", path: string, message: string) => void;
}

const startValues = (draft: Story) => Object.fromEntries(draft.qualities.flatMap((quality) => (quality.step_rule?.start !== undefined ? [[quality.key, quality.step_rule.start]] : [])));

export const checkEchoDiagnostics = ({ draft, push }: EchoRun) => {
  if (!draft.echoes?.length) return;
  const names = unknownEntityNames(draft).filter((name) => name.trim().length >= 4);
  const start = startValues(draft);
  draft.echoes.forEach((echo, index) => {
    const path = `echoes.${index}`;
    if (narratesPlayer(echo.cue ?? "")) push("echo-speaks-for-player", "warning", `${path}.cue`, `echo '${echo.id}' says what the player does or feels`);
    const hit = echo.to === ECHO_NARRATOR ? names.find((name) => mentions(echo.cue ?? "", name)) : undefined;
    if (hit) push("echo-names-unknown-entity", "warning", `${path}.cue`, `echo '${echo.id}' names '${hit}', which the player may not have met when it is due`);
    if (echo.cancel_when && evaluateGate(echo.cancel_when, { get: (key) => start[key] })) {
      push("echo-gate-holds-never", "warning", `${path}.cancel_when`, `echo '${echo.id}' is cancelled by a gate that already holds at the start`);
    }
  });
};
