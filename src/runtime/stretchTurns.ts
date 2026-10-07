import { PLAYER_TURNS_KEY, playerTurnsBetween, type DerivedQualityView, type EngineState, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { playerTurnIds } from "./agencyRecovery";
import type { ChanceSeams } from "./chance";
import { gameLayer } from "@engine/validate/gameLayer";

type TurnWindow = Pick<EngineState, "checkpointStartedMessageId" | "lastMessageId">;

export const playerTurnsInCheckpoint = (state: TurnWindow | null, chat: readonly unknown[]): number =>
  (state ? playerTurnsBetween(playerTurnIds(chat), state.checkpointStartedMessageId, state.lastMessageId) : 0);

export const playerTurnValues = (story: NormalizedStoryV2 | null, view: DerivedQualityView, chat: readonly unknown[]): Array<{ q: string; v: PrimitiveValue }> =>
  (story?.qualityByKey[PLAYER_TURNS_KEY]?.source === "code" ? [{ q: PLAYER_TURNS_KEY, v: playerTurnsInCheckpoint(view, chat) }] : []);

export const deriveQualities = (chance: ChanceSeams, story: () => NormalizedStoryV2 | null, chat: () => readonly unknown[]) =>
  (view: DerivedQualityView): Array<{ q: string; v: PrimitiveValue }> => {
    const loaded = story();
    const life = loaded?.life ? gameLayer()?.life.deriveLife(loaded, view, chat()) ?? [] : [];
    return [...chance.derive(view), ...playerTurnValues(loaded, view, chat()), ...life];
  };
