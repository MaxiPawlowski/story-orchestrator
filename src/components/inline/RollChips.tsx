import { rollText, type RollRecord } from "@runtime/rolls";
import { PRESENCE_TEXT } from "@features/presenceCopy";

export interface RollChipsProps {
  messageId: number;
  rolls: RollRecord[];
}

const ICON: Record<RollRecord["source"], string> = {
  quality: "fa-solid fa-dice-d20",
  npc: "fa-solid fa-comment-dots",
  talk: "fa-solid fa-users",
  check: "fa-solid fa-dice",
};

export const RollChips = ({ messageId, rolls }: RollChipsProps) => {
  if (!rolls.length) return null;
  return (
    <div data-so="roll-chips" data-mesid={messageId} className="so-inline-chips" role="group" aria-label={`${PRESENCE_TEXT.rollsLabel} for message ${messageId}`}>
      {rolls.map((roll) => (
        <span
          key={`${roll.source}:${roll.key}:${roll.boundary}:${roll.draw}`}
          data-so="roll-chip"
          data-source={roll.source}
          data-outcome={roll.outcome ?? "draw"}
          className="so-inline-chip so-roll-chip"
          title={roll.detail ? `${rollText(roll)} (${roll.detail})` : rollText(roll)}
        >
          <i className={ICON[roll.source]} aria-hidden="true" />
          <span>{rollText(roll)}</span>
        </span>
      ))}
    </div>
  );
};

export default RollChips;
