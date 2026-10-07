import { useState } from "react";
import { createdPersonaDescription } from "@engine/player";
import { PLAYER_SETUP_COPY as COPY } from "@features/playerSetupCopy";
import type { PlayerSetupView } from "@runtime/playerSetup";
import type { PlayerSetupRequest } from "@runtime/playerSetupPort";

export type ChooseIdentity = (request: PlayerSetupRequest) => Promise<{ ok: boolean; reason?: string }>;

export interface PlayerSetupPaneProps {
  view: PlayerSetupView;
  rechoose?: boolean;
  onChoose: ChooseIdentity;
}

const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

const Profile = ({ view }: { view: PlayerSetupView }) => (
  <>
    {view.player?.role && <p data-so="player-setup-role" className="so-briefing-paragraph"><strong>{view.player.role}</strong></p>}
    {view.player?.summary && <p data-so="player-setup-summary" className="so-briefing-paragraph">{view.player.summary}</p>}
    {Boolean(view.player?.assumes?.length) && (
      <div data-so="player-setup-assumes" className="flex flex-col gap-1">
        <span className="text-sm opacity-80">{COPY.assumes}</span>
        <ul className="flex flex-col gap-1">{view.player?.assumes?.map((line) => <li key={line}>{line}</li>)}</ul>
      </div>
    )}
    {view.fixedName && <p data-so="player-setup-fixed" className="so-briefing-paragraph">{COPY.fixed(view.fixedName)}</p>}
  </>
);

const CreateForm = ({ view, busy, run }: { view: PlayerSetupView; busy: boolean; run: (request: PlayerSetupRequest) => void }) => {
  const [name, setName] = useState(view.fixedName ?? (view.player?.name?.mode === "suggested" ? view.player.name.value ?? "" : ""));
  const [description, setDescription] = useState(() => createdPersonaDescription(view.player ?? undefined));
  if (!view.canCreate) return <p data-so="player-setup-no-create" className="text-sm opacity-80">{COPY.noCreate}</p>;
  return (
    <details data-so="player-setup-create-form" className="flex flex-col gap-2">
      <summary>{COPY.create}</summary>
      <label className="flex flex-col gap-1 text-sm">
        <span>{COPY.createName}</span>
        <input id="so-player-setup-name" className="text_pole" value={name} readOnly={Boolean(view.fixedName)} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>{COPY.createDescription}</span>
        <textarea id="so-player-setup-description" className="text_pole" rows={6} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <button type="button" data-so="player-setup-create" className="menu_button" disabled={busy || !name.trim()} onClick={() => run({ choice: "create", name, description })}>
        {COPY.createButton}
      </button>
    </details>
  );
};

export const PlayerSetupPane = ({ view, rechoose = false, onChoose }: PlayerSetupPaneProps) => {
  const others = view.personas.filter((entry) => entry.avatarId !== view.current?.avatarId);
  const [picked, setPicked] = useState(others[0]?.avatarId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = view.record && !view.record.pending && !rechoose;
  const keepAllowed = Boolean(view.current) && (!view.fixedName || same(view.current?.name ?? "", view.fixedName));
  const run = (request: PlayerSetupRequest) => {
    setBusy(true);
    setError(null);
    void onChoose(request).then((result) => {
      setBusy(false);
      if (!result.ok) setError(result.reason ?? null);
    });
  };
  return (
    <section id="so-player-setup" data-so="player-setup" aria-labelledby="so-player-setup-heading" className="flex flex-col gap-2">
      <h3 id="so-player-setup-heading" className="so-briefing-heading">{COPY.heading}</h3>
      <Profile view={view} />
      {view.current && <p data-so="player-setup-current" className="text-sm">{COPY.current} {view.current.name}</p>}
      {settled ? (
        <p data-so="player-setup-done" role="status" className="so-briefing-paragraph">{COPY.playingAs(view.lockedName ?? view.current?.name ?? "")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {keepAllowed && view.current && (
            <button type="button" data-so="player-setup-keep" className="menu_button" disabled={busy} onClick={() => run({ choice: "keep" })}>{COPY.keep(view.current.name)}</button>
          )}
          {others.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <span>{COPY.pick}</span>
                <select id="so-player-setup-pick" className="text_pole" value={picked} onChange={(event) => setPicked(event.target.value)}>
                  {others.map((entry) => <option key={entry.avatarId} value={entry.avatarId}>{entry.name}</option>)}
                </select>
              </label>
              <button type="button" data-so="player-setup-pick" className="menu_button" disabled={busy || !picked} onClick={() => run({ choice: "pick", avatarId: picked })}>{COPY.pickButton}</button>
            </div>
          )}
          <CreateForm view={view} busy={busy} run={run} />
          {!view.beforeFirstMessage && <p data-so="player-setup-old-name" className="text-sm opacity-80">{COPY.oldName}</p>}
        </div>
      )}
      {error && <p data-so="player-setup-error" role="alert" className="text-sm">{error}</p>}
    </section>
  );
};

export default PlayerSetupPane;
