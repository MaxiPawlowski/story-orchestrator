import { PLAYER_SETUP_COPY } from "@features/playerSetupCopy";
import { yourCharacterLines } from "@runtime/yourCharacter";
import type { RuntimeSnapshot } from "@runtime/types";

export const YourCharacter = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const view = snapshot.playerSetup;
  if (!view || (!view.player?.role && !view.player?.summary && !view.lockedName)) return null;
  return (
    <details id="so-your-character" data-so="your-character" className="text-sm">
      <summary>{PLAYER_SETUP_COPY.yourCharacter}</summary>
      <div className="flex flex-col gap-1 pt-1">
        {yourCharacterLines(view).map((line) => <p key={line}>{line}</p>)}
        <p className="opacity-70">{PLAYER_SETUP_COPY.lockedHint}</p>
      </div>
    </details>
  );
};

export default YourCharacter;
