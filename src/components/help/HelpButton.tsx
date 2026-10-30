import type { MouseEvent } from "react";
import { HELP_COPY } from "@features/helpCopy";
import { IconButton } from "@components/ui/IconButton";

export interface HelpButtonProps {
  id: string;
  open: boolean;
  controls?: string;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
}

export const HelpButton = ({ id, open, controls = "so-help", onToggle }: HelpButtonProps) => (
  <IconButton
    id={id}
    type="button"
    data-so="help-toggle"
    icon="fa-circle-question"
    label={HELP_COPY.toggle}
    aria-expanded={open}
    aria-controls={controls}
    onClick={onToggle}
  />
);

export default HelpButton;
