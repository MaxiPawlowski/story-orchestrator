import type { InChatMeter } from "@runtime/inChatTypes";
import { IN_CHAT_COPY } from "@features/inChatCopy";
import "./inchat.css";

export interface GateMeterProps {
  messageId: number;
  meter: InChatMeter;
}

const share = (met: number, total: number) => (total ? Math.round((met / total) * 100) : 0);

export const GateMeter = ({ messageId, meter }: GateMeterProps) => (
  <div data-so="gate-meter" data-mesid={messageId} className="so-ic-meter" role="group" aria-label={IN_CHAT_COPY.meterLabel}>
    {meter.moved && (
      <div data-so="gate-meter-moved" className="so-ic-meter-moved">
        <i className="fa-solid fa-route" aria-hidden="true" />
        <span>{IN_CHAT_COPY.meterMoved(meter.moved)}</span>
      </div>
    )}
    {meter.rows.map((row, index) => (
      <div key={`${row.toName}:${index}`} data-so="gate-meter-row" data-ready={row.ready || undefined} className="so-ic-meter-row">
        <span className="so-ic-meter-to">→ {row.toName}</span>
        <span className="so-ic-meter-bar" aria-hidden="true"><span style={{ width: `${share(row.met, row.total)}%` }} /></span>
        <span className="so-ic-meter-count">
          {row.ready ? <><i className="fa-solid fa-check" aria-hidden="true" /> {IN_CHAT_COPY.meterReady}</> : IN_CHAT_COPY.meterCount(row.met, row.total)}
        </span>
        {!row.ready && row.open.length > 0 && <span className="so-ic-meter-open">{row.open.join("; ")}</span>}
      </div>
    ))}
  </div>
);

export default GateMeter;
