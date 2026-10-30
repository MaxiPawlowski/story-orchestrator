import { useEffect, useState } from "react";
import type { CarryActions, CarryCandidateRow, CarryView } from "@runtime/carryPort";
import { CarryCard } from "./CarryCard";
import { CARRY_COPY } from "@features/carryCopy";
import { Button } from "@components/ui/Button";

export interface CarryPaneProps {
  view: CarryView;
  actions: Pick<CarryActions, "candidates" | "pick" | "decline" | "dismiss">;
}

const dateOf = (iso: string) => (Number.isNaN(Date.parse(iso)) ? "" : new Date(iso).toLocaleDateString());

export const CarryPane = ({ view, actions }: CarryPaneProps) => {
  const [rows, setRows] = useState<CarryCandidateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picking = view.pending && view.canPick;
  useEffect(() => {
    if (!picking) return undefined;
    let live = true;
    void actions.candidates().then((found) => { if (live) setRows(found); }, () => { if (live) setRows([]); });
    return () => { live = false; };
  }, [picking, actions]);
  if (!picking) return view.state ? <CarryCard view={view} onDismiss={() => void actions.dismiss()} /> : null;
  const run = async (step: () => Promise<{ ok: true } | { ok: false; reason: string }>) => {
    setBusy(true);
    const outcome = await step();
    setBusy(false);
    setError(outcome.ok ? null : CARRY_COPY.refused);
  };
  return (
    <section id="so-carry-picker" data-so="carry-picker" className="flex flex-col gap-2">
      <h3 className="so-briefing-heading">{CARRY_COPY.pickHeading}</h3>
      <p className="so-briefing-paragraph">{view.mode === "replay" ? CARRY_COPY.replayIntro : CARRY_COPY.pickIntro}</p>
      {rows === null && <p className="text-sm opacity-70">{CARRY_COPY.loading}</p>}
      {rows?.length === 0 && <p data-so="carry-none" className="text-sm opacity-70">{CARRY_COPY.none}</p>}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.chatId} data-so="carry-run" className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{CARRY_COPY.ended(row.title, row.endingTitle)} <span className="opacity-70">{dateOf(row.endedAt)}</span></span>
              <Button type="button" disabled={busy} onClick={() => void run(() => actions.pick(row.chatId))}>{CARRY_COPY.pick}</Button>
            </li>
          ))}
        </ul>
      )}
      {!view.required && (
        <Button id="so-carry-fresh" type="button" className="self-start" disabled={busy} onClick={() => void run(() => actions.decline())}>{CARRY_COPY.fresh}</Button>
      )}
      {error && <p data-so="carry-error" role="alert" className="text-sm">{error}</p>}
    </section>
  );
};

export default CarryPane;
