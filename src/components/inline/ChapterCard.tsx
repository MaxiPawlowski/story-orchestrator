import type { ChapterCard as ChapterCardView } from "@runtime/chapterCards";
import { PRESENCE_TEXT } from "@features/presenceCopy";

export interface ChapterCardProps {
  card: ChapterCardView;
}

const eyebrow = (card: ChapterCardView) => {
  if (card.interlude) return PRESENCE_TEXT.interlude;
  if (card.final) return PRESENCE_TEXT.finalChapter;
  return card.number === null ? PRESENCE_TEXT.chapter : `${PRESENCE_TEXT.chapter} ${card.number}`;
};

export const ChapterCard = ({ card }: ChapterCardProps) => (
  <section data-so="chapter-card" data-chapter-kind={card.interlude ? "interlude" : "chapter"} className="so-chapter-card" aria-label={`${eyebrow(card)}: ${card.title}`}>
    <div className="so-chapter-card-eyebrow">{eyebrow(card)}</div>
    <div className="so-chapter-card-title">{card.title}</div>
    {card.briefing && <p data-so="chapter-card-briefing" className="so-chapter-card-briefing">{card.briefing}</p>}
  </section>
);

export default ChapterCard;
