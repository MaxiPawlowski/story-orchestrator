import type { CarryView } from "@runtime/carryPort";
import { CARRY_COPY } from "@features/carryCopy";
import { Button } from "@components/ui/Button";

export interface CarryCardProps {
  view: CarryView;
  onDismiss?: () => void;
}

export const CarryCard = ({ view, onDismiss }: CarryCardProps) => {
  const state = view.state;
  if (!state) return null;
  const heritage = state.values.filter((value) => value.as === "heritage").map((value) => value.label);
  return (
    <div id="so-carry-heritage" className="flex flex-col gap-1">
      <div className="font-medium">{CARRY_COPY.heading}</div>
      <div className="text-sm opacity-80">{CARRY_COPY.ended(state.projection.storyTitle, state.projection.endingTitle)}</div>
      {heritage.length > 0 && <ul data-so="carry-heritage-lines" className="flex flex-col gap-1 text-sm">{heritage.map((line) => <li key={line}>{line}</li>)}</ul>}
      {view.active && state.previously && (
        <div id="so-carry-previously" className="flex flex-col gap-1 text-sm">
          <div className="font-medium">{CARRY_COPY.previously}</div>
          <p className="m-0 opacity-80 whitespace-pre-wrap">{state.previously}</p>
          {onDismiss && <Button id="so-carry-dismiss" type="button" className="self-start" onClick={onDismiss}>{CARRY_COPY.dismiss}</Button>}
        </div>
      )}
    </div>
  );
};

export default CarryCard;
