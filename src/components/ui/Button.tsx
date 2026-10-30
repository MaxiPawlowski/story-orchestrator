import type { ButtonHTMLAttributes, MouseEventHandler, Ref } from "react";
import { cx } from "./cx";
import { useBusyWork } from "./useBusyWork";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ControlSize = "sm" | "md";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: string;
  busy?: boolean;
  work?: () => Promise<unknown> | unknown;
  chatId?: string | null;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  ref?: Ref<HTMLButtonElement>;
}

export const Icon = ({ name }: { name: string }) => <i aria-hidden="true" className={`fa-solid ${name}`} />;

export function Button({ variant = "secondary", size = "md", icon, busy = false, work, chatId = null, disabled, className, children, type = "button", onClick, ...rest }: ButtonProps) {
  const job = useBusyWork(work, chatId, disabled);
  const pending = busy || job.busy;
  return (
    <button type={type} {...rest} className={cx("so-btn", className)} data-variant={variant} data-size={size} disabled={disabled || pending}
      aria-busy={pending || undefined} onClick={work ? () => void job.run() : onClick}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export default Button;
