import type { LifeAuthorView } from "@runtime/lifeSnapshot";

const towardLabel = (toward: string, names: Record<string, string>) => (toward === "player" ? "the player" : names[toward] ?? toward);

export type MeanwhileDecide = (id: string, status: "accepted" | "rejected") => void;

export const CharacterLifePanel = ({ life, onDecide }: { life: LifeAuthorView; onDecide?: MeanwhileDecide }) => {
  const names = Object.fromEntries(life.rows.map((row) => [row.id, row.name]));
  const waiting = life.proposals.filter((proposal) => proposal.status === "proposed");
  const settled = life.proposals.filter((proposal) => proposal.status === "accepted" || proposal.status === "applied").slice(-6);
  return (
    <section id="so-character-life" aria-label="Character life" className="mt-3 text-xs">
      <div className="font-medium mb-1">Character life</div>
      {life.rows.map((row) => (
        <div key={row.id} data-so="life-member" data-member={row.id} className="mb-2">
          <div className="font-medium">
            {row.name}
            {row.mood ? <span className="opacity-70"> · {row.mood}</span> : null}
            {row.away ? <span data-so="life-away" className="opacity-70"> · away at {row.away}</span> : null}
          </div>
          {row.relationships.length > 0 && (
            <ul className="list-none p-0 m-0">
              {row.relationships.map((axis) => (
                <li key={axis.key} data-so="life-axis" data-key={axis.key}>
                  {axis.axis} toward {towardLabel(axis.toward, names)}: {axis.value} <span className="opacity-70">({axis.range[0]} to {axis.range[1]})</span>
                </li>
              ))}
            </ul>
          )}
          {row.agendas.map((agenda) => (
            <div key={agenda.id} data-so="life-agenda" data-agenda={agenda.id}>
              {agenda.goal}: {agenda.done} of {agenda.of}
              {agenda.next ? <span className="opacity-70"> · next: {agenda.next}</span> : null}
            </div>
          ))}
        </div>
      ))}
      {life.scopeOverflow.length > 0 && (
        <div data-so="life-overflow" className="opacity-70">Not read this turn: {life.scopeOverflow.join(", ")}</div>
      )}
      {waiting.length > 0 && (
        <div data-so="life-proposals">
          <div className="font-medium">Meanwhile, proposed</div>
          {waiting.map((proposal) => (
            <div key={proposal.id} data-so="life-proposal" data-id={proposal.id} className="flex flex-wrap items-center gap-1">
              <span>{names[proposal.memberId] ?? proposal.memberId}: {proposal.text}</span>
              {onDecide && (
                <>
                  <button type="button" className="menu_button" data-so="life-proposal-accept" onClick={() => onDecide(proposal.id, "accepted")}>Accept</button>
                  <button type="button" className="menu_button" data-so="life-proposal-reject" onClick={() => onDecide(proposal.id, "rejected")}>Reject</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {settled.length > 0 && (
        <div data-so="life-proposals-settled">
          <div className="font-medium">Meanwhile, accepted</div>
          {settled.map((proposal) => (
            <div key={proposal.id} data-so="life-proposal-settled" data-status={proposal.status}>
              {names[proposal.memberId] ?? proposal.memberId}: {proposal.text}
              <span className="opacity-70"> · {proposal.status === "applied" ? "in their private notes" : "lands at the next reply"}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
