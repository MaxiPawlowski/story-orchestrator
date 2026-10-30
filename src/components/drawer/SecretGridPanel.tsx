import type { SecretAudience } from "@memory/index";
import type { SecretGridAlert, SecretGridView } from "@runtime/whoKnows";
import { Callout } from "@components/ui/Callout";
import { Badge, type Tone } from "@components/ui/Badge";

const CELL: Record<SecretAudience, { word: string; tone: Tone; icon: string | null }> = {
  knows: { word: "knows", tone: "ok", icon: "fa-eye" },
  "kept-out": { word: "kept out", tone: "error", icon: "fa-eye-slash" },
  "not-told": { word: "not told", tone: "neutral", icon: null },
};

const clip = (text: string) => (text.length > 120 ? `${text.slice(0, 119)}…` : text);

export const KeptOutAlert = ({ alerts }: { alerts: readonly SecretGridAlert[] }) => {
  if (!alerts.length) return null;
  const names = [...new Set(alerts.map((alert) => alert.name))];
  return (
    <Callout tone="warn" role="status" data-so="secret-on-stage" title={`${names.join(", ")} ${names.length === 1 ? "is" : "are"} on stage and kept out of a secret`}>
      <ul className="so-plain-list">
        {alerts.map((alert) => <li key={`${alert.secretId}-${alert.memberId}`} data-so="secret-on-stage-row"><strong>{alert.name}</strong>: {clip(alert.text)}</li>)}
      </ul>
      <p className="so-muted">Their prompt leaves it out. A reply that names it in the shared chat still reaches them.</p>
    </Callout>
  );
};

export const SecretGridPanel = ({ grid }: { grid: SecretGridView | null | undefined }) => {
  if (!grid) return null;
  return (
    <section id="so-who-knows" data-so="who-knows" className="so-console-block" aria-labelledby="so-who-knows-title">
      <h4 id="so-who-knows-title">Who knows what</h4>
      <p className="so-muted">Each held secret against each cast member, as their private prompt sees it. Author view only.</p>
      <KeptOutAlert alerts={grid.alerts} />
      {grid.rows.length === 0 ? <p className="so-muted" data-so="who-knows-empty">No secret is held right now.</p> : (
        <div className="so-table-scroll">
          <table className="so-grid-table">
            <thead>
              <tr>
                <th scope="col">Secret</th>
                {grid.members.map((member) => (
                  <th key={member.id} scope="col" data-so="who-knows-member" data-on-stage={member.onStage ? "true" : undefined}>
                    {member.name}{member.onStage ? <Badge tone="info" icon="fa-person" className="so-on-stage">on stage</Badge> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.id} data-so="who-knows-row" data-id={row.id}>
                  <th scope="row"><span className="so-muted">{row.holder} · {row.tag}</span><br />{clip(row.text)}</th>
                  {grid.members.map((member) => {
                    const cell = CELL[row.cells[member.id] ?? "not-told"];
                    return (
                      <td key={member.id} data-so="who-knows-cell" data-state={row.cells[member.id] ?? "not-told"}>
                        <Badge tone={cell.tone} icon={cell.icon}>{cell.word}</Badge>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default SecretGridPanel;
