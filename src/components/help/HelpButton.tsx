import type { MouseEvent } from "react";
import { HELP_COPY } from "@features/helpCopy";

export interface HelpButtonProps {
  id: string;
  open: boolean;
  controls?: string;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}

export const HelpButton = ({ id, open, controls = "so-help", onToggle }: HelpButtonProps) => (
  <button
    id={id}
    type="button"
    data-so="help-toggle"
    className="menu_button fa-solid fa-circle-question"
    aria-label={HELP_COPY.toggle}
    title={HELP_COPY.toggle}
    aria-expanded={open}
    aria-controls={controls}
    onClick={onToggle}
  />
);

export default HelpButton;
