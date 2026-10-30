import { PLAYER_SETUP_COPY } from "@features/playerSetupCopy";
import type { RuntimeSnapshot } from "@runtime/types";

export const YourCharacter = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const view = snapshot.playerSetup;
  if (!view || (!view.player?.role && !view.player?.summary && !view.lockedName)) return null;
  const name = view.lockedName ?? view.current?.name ?? null;
  return (
    <section id="so-your-character" data-so="your-character" aria-labelledby="so-your-character-heading" className="so-you-card">
      <h3 id="so-your-character-heading" className="so-play-label">{PLAYER_SETUP_COPY.youHeading}</h3>
      <p className="so-you-line">
        {name && <strong data-so="you-name">{name}</strong>}
        {name && view.player?.role && <span aria-hidden="true"> · </span>}
        {view.player?.role && <span data-so="you-role">{view.player.role}</span>}
      </p>
      {view.player?.summary && <p className="so-you-summary">{view.player.summary}</p>}
      {Boolean(view.player?.assumes?.length) && (
        <ul className="so-you-assumes" aria-label={PLAYER_SETUP_COPY.assumes}>
          {view.player?.assumes?.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      <p className="so-play-meta">{PLAYER_SETUP_COPY.lockedHint}</p>
    </section>
  );
};

export default YourCharacter;
