import type { ReactNode } from "react";
import { TOUR_AUTHOR_TERMS, TOUR_TERMS } from "@features/tourCopy";

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\])/g;

export const termDefinition = (key: string): string | undefined => TOUR_TERMS[key] ?? TOUR_AUTHOR_TERMS[key];

export const termsIn = (text: string): string[] => [...text.matchAll(/\[\[([^|\]]+)/g)].map((match) => match[1]);

export const TourText = ({ text }: { text: string }) => {
  const parts: ReactNode[] = text.split(TOKEN).filter(Boolean).map((part, index) => {
    if (part.startsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("[[")) {
      const [key, word] = part.slice(2, -2).split("|");
      const definition = termDefinition(key);
      const shown = word ?? key;
      return definition
        ? <button key={index} type="button" className="so-tour-term" data-def={definition} aria-label={`${shown}: ${definition}`}>{shown}</button>
        : <span key={index}>{shown}</span>;
    }
    return part;
  });
  return <>{parts}</>;
};
