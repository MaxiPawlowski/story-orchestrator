import type { Story } from "@engine/index";
import { renderDelivery } from "@runtime/delivery/render";
import { mentions } from "./codexDiagnostics";
import { unknownEntityNames } from "./labelDiagnostics";

type DeliveryCode = "delivery-names-unknown-entity" | "delivery-directs-player" | "delivery-over-budget";

export const DELIVERY_CONSEQUENCES: Record<DeliveryCode, string> = {
  "delivery-names-unknown-entity": "The character is told about someone or somewhere the story has not introduced, and may bring them up early.",
  "delivery-directs-player": "A voice note says how this character speaks, never what the player does.",
  "delivery-over-budget": "Part of this sheet is left out of the prompt, because the whole addition would pass about 120 tokens.",
};

export interface DeliveryRun {
  draft: Story;
  push: (code: DeliveryCode, severity: "warning", path: string, message: string) => void;
}

const PLAYER_WORDS = ["{{user}}", "the player"];

const playerNames = (draft: Story): string[] => [...PLAYER_WORDS, ...(draft.player?.name?.value ? [draft.player.name.value] : [])];

const namesPlayer = (text: string, names: string[]): string | undefined =>
  names.find((name) => (name.startsWith("{{") ? text.toLowerCase().includes(name) : mentions(text, name)));

export const checkDeliveryDiagnostics = ({ draft, push }: DeliveryRun) => {
  const unknown = unknownEntityNames(draft);
  const player = playerNames(draft);
  draft.roster.forEach((member, index) => {
    const polish = member.polish;
    if (!polish) return;
    const path = `roster.${index}.polish`;
    const texts: Array<[string, string]> = [
      ...(polish.notes ? [[`${path}.notes`, polish.notes] as [string, string]] : []),
      ...Object.entries(polish.by_mood ?? {}).map(([mood, text]): [string, string] => [`${path}.by_mood.${mood}`, text]),
    ];
    texts.forEach(([where, text]) => {
      const hit = unknown.find((name) => mentions(text, name));
      if (hit) push("delivery-names-unknown-entity", "warning", where, `the voice sheet names '${hit}', who is not known when the story starts`);
      const playerHit = namesPlayer(text, player);
      if (playerHit) push("delivery-directs-player", "warning", where, `the voice sheet names the player ('${playerHit}'); write how ${member.name ?? member.id} speaks instead`);
    });
    const moods = [null, ...Object.keys(polish.by_mood ?? {})];
    const cut = [...new Set(moods.flatMap((mood) => renderDelivery({ sheet: polish, mood }).cut))];
    if (cut.length) push("delivery-over-budget", "warning", path, `${member.name ?? member.id}'s sheet passes about 120 tokens; left out: ${cut.join(", ")}`);
  });
};
