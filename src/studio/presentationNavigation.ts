import { createContext } from "react";

export const PreparePresentationContext = createContext<(() => void) | null>(null);
