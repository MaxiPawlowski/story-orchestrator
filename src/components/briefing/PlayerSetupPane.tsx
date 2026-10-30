import { useState, type MutableRefObject } from "react";
import { createdPersonaDescription } from "@engine/player";
import { PLAYER_SETUP_COPY as COPY } from "@features/playerSetupCopy";
import type { PlayerSetupView } from "@runtime/playerSetup";
import type { PlayerSetupRequest } from "@runtime/playerSetupPort";
import { Button } from "@components/ui/Button";
import { SegmentedControl } from "@components/ui/SegmentedControl";

export type ChooseIdentity = (request: PlayerSetupRequest) => Promise<{ ok: boolean; reason?: string }>;
export type StartCommit = () => Promise<boolean>;
export type IdentityMode = "keep" | "pick" | "create";

export interface PlayerSetupPaneProps {
  view: PlayerSetupView;
  rechoose?: boolean;
  onChoose: ChooseIdentity;
  startRef?: MutableRefObject<StartCommit | null>;
}

const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

const Profile = ({ view }: { view: PlayerSetupView }) => (
  <>
    {view.player?.role && <p data-so="player-setup-role" className="so-briefing-role">{view.player.role}</p>}
    {view.player?.summary && <p data-so="player-setup-summary" className="so-briefing-paragraph">{view.player.summary}</p>}
    {Boolean(view.player?.assumes?.length) && (
      <div data-so="player-setup-assumes" className="so-briefing-assumes">
        <span className="so-briefing-meta">{COPY.assumes}</span>
        <ul>{view.player?.assumes?.map((line) => <li key={line}>{line}</li>)}</ul>
      </div>
    )}
    {view.fixedName && <p data-so="player-setup-fixed" className="so-briefing-paragraph">{COPY.fixed(view.fixedName)}</p>}
  </>
);

export const identityModes = (view: PlayerSetupView, keepAllowed: boolean): IdentityMode[] => [
  ...(keepAllowed && view.current ? ["keep" as const] : []),
  ...(view.personas.some((entry) => entry.avatarId !== view.current?.avatarId) ? ["pick" as const] : []),
  ...(view.canCreate ? ["create" as const] : []),
];

export const PlayerSetupPane = ({ view, rechoose = false, onChoose, startRef }: PlayerSetupPaneProps) => {
  const others = view.personas.filter((entry) => entry.avatarId !== view.current?.avatarId);
  const keepAllowed = Boolean(view.current) && (!view.fixedName || same(view.current?.name ?? "", view.fixedName));
  const modes = identityModes(view, keepAllowed);
  const [mode, setMode] = useState<IdentityMode>(modes[0] ?? "keep");
  const [picked, setPicked] = useState(others[0]?.avatarId ?? "");
  const [name, setName] = useState(view.fixedName ?? (view.player?.name?.mode === "suggested" ? view.player.name.value ?? "" : ""));
  const [description, setDescription] = useState(() => createdPersonaDescription(view.player ?? undefined));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = view.record && !view.record.pending && !rechoose;
  const lockFailed = view.record?.pending ? view.record.lockFailed ?? null : null;
  const settledName = view.lockedName ?? view.current?.name ?? "";
  const run = async (request: PlayerSetupRequest): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const result = await onChoose(request);
    setBusy(false);
    if (!result.ok) setError(result.reason ?? null);
    return result.ok;
  };
  const request = (): PlayerSetupRequest | null => {
    if (mode === "pick") return picked ? { choice: "pick", avatarId: picked } : null;
    if (mode === "create") return name.trim() ? { choice: "create", name, description } : null;
    return modes.includes("keep") ? { choice: "keep" } : null;
  };
  if (startRef) {
    startRef.current = async () => {
      if (settled || !modes.length) return true;
      const next = request();
      if (!next) { setError(mode === "create" ? COPY.needsName : COPY.needsChoice); return false; }
      return run(next);
    };
  }
  const options = modes.map((value) => ({ value, label: value === "keep" ? COPY.keep(view.current?.name ?? "") : value === "pick" ? COPY.pickShort : COPY.createShort }));
  return (
    <section id="so-player-setup" data-so="player-setup" aria-labelledby="so-player-setup-heading" className="so-briefing-you">
      <h3 id="so-player-setup-heading" className="so-briefing-heading">{COPY.heading}</h3>
      <Profile view={view} />
      {lockFailed && (
        <div data-so="player-setup-lock-failed" className="flex flex-col gap-2">
          <p role="alert" className="so-briefing-paragraph">{COPY.lockFailed}</p>
          <p className="so-briefing-meta">{COPY.unlockedHint}</p>
          <div className="flex flex-wrap gap-2">
            <Button data-so="player-setup-retry" disabled={busy} onClick={() => void run({ choice: "retry" })}>{COPY.retryLock}</Button>
            <Button data-so="player-setup-unlocked" disabled={busy} onClick={() => void run({ choice: "unlocked" })}>{COPY.continueUnlocked}</Button>
          </div>
        </div>
      )}
      {settled ? (
        <p data-so="player-setup-done" role="status" className="so-briefing-paragraph">{view.record?.locked === false ? COPY.playingAsUnlocked(settledName) : COPY.playingAs(settledName)}</p>
      ) : (
        <div className="so-briefing-choice">
          {options.length > 1 && <SegmentedControl data-so="player-setup-mode" label={COPY.modeLabel} value={mode} options={options} disabled={busy} onChange={setMode} />}
          {mode === "keep" && view.current && <p data-so="player-setup-keep" className="so-briefing-paragraph">{COPY.keepHint(view.current.name)}</p>}
          {mode === "pick" && (
            <label data-so="player-setup-pick-row" className="so-briefing-field">
              <span>{COPY.pick}</span>
              <select id="so-player-setup-pick" className="text_pole" value={picked} disabled={busy} onChange={(event) => setPicked(event.target.value)}>
                {others.map((entry) => <option key={entry.avatarId} value={entry.avatarId}>{entry.name}</option>)}
              </select>
            </label>
          )}
          {mode === "create" && (
            <div data-so="player-setup-create-form" className="flex flex-col gap-2">
              <label className="so-briefing-field">
                <span>{COPY.createName}</span>
                <input id="so-player-setup-name" className="text_pole" value={name} readOnly={Boolean(view.fixedName)} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="so-briefing-field">
                <span>{COPY.createDescription}</span>
                <textarea id="so-player-setup-description" className="text_pole" rows={6} value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
            </div>
          )}
          {!view.canCreate && <p data-so="player-setup-no-create" className="so-briefing-meta">{COPY.noCreate}</p>}
          {!view.beforeFirstMessage && <p data-so="player-setup-old-name" className="so-briefing-meta">{COPY.oldName}</p>}
          {keepAllowed && view.current && !rechoose && <p data-so="player-setup-close-keeps" className="so-briefing-meta">{COPY.closeKeeps(view.current.name)}</p>}
        </div>
      )}
      {error && <p data-so="player-setup-error" role="alert" className="so-briefing-paragraph so-error-text">{error}</p>}
    </section>
  );
};

export default PlayerSetupPane;
