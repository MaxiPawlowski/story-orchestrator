import { useState } from "react";
import type { InChatChips } from "@runtime/inChatTypes";
import type { WriteResult } from "@utils/writeResult";
import { IN_CHAT_COPY } from "@features/inChatCopy";
import { Badge } from "@components/ui/Badge";
import { Button } from "@components/ui/Button";
import { StatusText } from "@components/ui/StatusText";
import "./inchat.css";

export interface ChatEndChipsProps {
  chips: InChatChips;
  fill: (text: string) => WriteResult;
  openIdeas?: () => void;
}

export const ChatEndChips = ({ chips, fill, openIdeas }: ChatEndChipsProps) => {
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const put = (text: string) => {
    const result = fill(text);
    setOutcome(result.ok ? { ok: true, text: IN_CHAT_COPY.filled } : { ok: false, text: result.reason });
  };
  return (
    <div data-so="chat-end-chips" data-mesid={chips.messageId} className="so-ic-chips" role="group" aria-label={IN_CHAT_COPY.chipsLabel}>
      <div className="so-ic-chips-row">
        {chips.yours && <Badge tone="info" icon="fa-hand-point-right" data-so="chat-end-your-move">{IN_CHAT_COPY.yourMove}</Badge>}
        {chips.offers.map((offer) => (
          <Button key={offer.key} size="sm" variant="secondary" data-so="chat-end-offer" title={IN_CHAT_COPY.offerTitle} onClick={() => put(offer.text)}>
            {offer.text}
          </Button>
        ))}
        {chips.ideas && openIdeas && (
          <Button size="sm" variant="ghost" icon="fa-lightbulb" data-so="chat-end-ideas" title={IN_CHAT_COPY.ideasTitle} onClick={openIdeas}>{IN_CHAT_COPY.ideas}</Button>
        )}
      </div>
      {outcome && <StatusText tone={outcome.ok ? "ok" : "warn"} role="status" data-so="chat-end-outcome">{outcome.text}</StatusText>}
    </div>
  );
};

export default ChatEndChips;
