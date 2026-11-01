import { IN_CHAT_COPY } from "@features/inChatCopy";
import "./inchat.css";

export interface BecauseRibbonProps {
  messageId: number;
  lines: string[];
}

export const BecauseRibbon = ({ messageId, lines }: BecauseRibbonProps) => {
  if (!lines.length) return null;
  return (
    <ul data-so="because-ribbon" data-mesid={messageId} className="so-ic-because" aria-label={IN_CHAT_COPY.becauseLabel}>
      {lines.map((line) => (
        <li key={line} data-so="because-line" className="so-ic-because-line">
          <i className="fa-solid fa-reply fa-flip-horizontal" aria-hidden="true" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
};

export default BecauseRibbon;
