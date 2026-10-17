import type { SyntheticEvent } from "react";

export const cancelInto = (close: () => void) => (event: SyntheticEvent<HTMLDialogElement>) => {
  event.preventDefault();
  event.stopPropagation();
  close();
};

export const keepClose = (event: SyntheticEvent<HTMLDialogElement>) => event.stopPropagation();
