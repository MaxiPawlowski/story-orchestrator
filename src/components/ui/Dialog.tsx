import { useEffect, useRef, type DialogHTMLAttributes, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";

export type DialogSize = "full" | "window" | "sheet";

export interface DialogProps extends Omit<DialogHTMLAttributes<HTMLDialogElement>, "open"> {
  id: string;
  size?: DialogSize;
  ref?: Ref<HTMLDialogElement>;
  children?: ReactNode;
}

const assign = <T,>(ref: Ref<T> | undefined, node: T | null) => {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as { current: T | null }).current = node;
};

export const Dialog = ({ size = "window", className, ref, children, ...rest }: DialogProps) => {
  const own = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const dialog = own.current;
    if (dialog && !dialog.open && typeof dialog.showModal === "function") dialog.showModal();
  }, []);
  return (
    <dialog {...rest} ref={(node) => { own.current = node; assign(ref, node); }} data-size={size} className={cx("so-dialog", className)}>
      {children}
    </dialog>
  );
};

export const Sheet = (props: Omit<DialogProps, "size">) => <Dialog {...props} size="sheet" />;

export interface DialogHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  titleId?: string;
  subtitle?: ReactNode;
  level?: 1 | 2 | 3;
  onClose?: () => void;
  closeLabel?: string;
  closeId?: string;
  closeDataSo?: string;
  compact?: boolean;
  children?: ReactNode;
}

export const DialogHeader = ({ title, titleId, subtitle, level = 2, onClose, closeLabel = "Close", closeId, closeDataSo, compact = false, children, className, ...rest }: DialogHeaderProps) => {
  const Heading = `h${level}` as const;
  return (
    <div {...rest} data-compact={compact || undefined} className={cx("so-dialog-head", className)}>
      <div className="so-dialog-heading">
        <Heading id={titleId} className="so-dialog-title">{title}</Heading>
        {subtitle && <span className="so-dialog-subtitle">{subtitle}</span>}
      </div>
      {children && <div className="so-dialog-slot">{children}</div>}
      {onClose && <IconButton id={closeId} data-so={closeDataSo} className="so-dialog-close" icon="fa-xmark" label={closeLabel} size={compact ? "sm" : "md"} onClick={onClose} />}
    </div>
  );
};

export default Dialog;
