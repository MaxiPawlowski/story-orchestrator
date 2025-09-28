import StoryContext, { StoryContextValue } from "@components/context/StoryContext";
import { useContext } from "react";

export function useStoryContext(): StoryContextValue {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error("useStoryContext must be used within a StoryProvider");
  return ctx;
}