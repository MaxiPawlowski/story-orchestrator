import type { Story } from "@engine/index";
import { unknownEntityNames } from "./labelDiagnostics";
import { mentions } from "./codexDiagnostics";

type OfferCode = "offer-names-unknown" | "check-hint-names-unknown";

export const OFFER_CONSEQUENCES: Record<OfferCode, string> = {
  "offer-names-unknown": "The offer is held back while it names a place, quest or person the player has not met, so it may never show.",
  "check-hint-names-unknown": "The help is held back while it names a place, quest or person the player has not met, so it may never show.",
};

export interface OfferRun {
  draft: Story;
  startId: string;
  push: (code: OfferCode, severity: "warning", path: string, message: string) => void;
}

const mayBeWithheld = (draft: Story, startId: string, here: string): string[] => [
  ...draft.checkpoints.filter((checkpoint) => checkpoint.id !== startId && checkpoint.id !== here).flatMap((checkpoint) => [checkpoint.player_name, checkpoint.name]),
  ...(draft.quests ?? []).map((quest) => quest.title),
  ...unknownEntityNames(draft),
].map((name) => name?.trim() ?? "").filter((name) => name.length >= 4);

const hintTexts = (draft: Story) => [
  ...draft.checkpoints.flatMap((checkpoint, index) => (checkpoint.checks ?? []).map((check, at) => ({ check, path: `checkpoints.${index}.checks.${at}`, here: checkpoint.id }))),
  ...draft.transitions.flatMap((transition, index) => (transition.check ? [{ check: transition.check, path: `transitions.${index}.check`, here: transition.from }] : [])),
].flatMap(({ check, path, here }) => (check.modifiers ?? []).flatMap((modifier, at) => (modifier.hint ? [{ text: modifier.hint, path: `${path}.modifiers.${at}.hint`, here, id: check.id }] : [])));

export const checkOfferDiagnostics = ({ draft, startId, push }: OfferRun) => {
  draft.checkpoints.forEach((checkpoint, index) => {
    const names = checkpoint.offers?.length ? mayBeWithheld(draft, startId, checkpoint.id) : [];
    (checkpoint.offers ?? []).forEach((offer, at) => {
      const path = `checkpoints.${index}.offers.${at}`;
      [[`${path}.text`, offer.text], ...(offer.needs ? [[`${path}.needs.reason`, offer.needs.reason]] : [])].forEach(([where, text]) => {
        const hit = names.find((name) => mentions(text, name));
        if (hit) push("offer-names-unknown", "warning", where, `offer '${offer.id}' names '${hit}', which the player may not have seen yet`);
      });
    });
  });
  hintTexts(draft).forEach(({ text, path, here, id }) => {
    const hit = mayBeWithheld(draft, startId, here).find((name) => mentions(text, name));
    if (hit) push("check-hint-names-unknown", "warning", path, `check '${id}' hint names '${hit}', which the player may not have seen yet`);
  });
};
