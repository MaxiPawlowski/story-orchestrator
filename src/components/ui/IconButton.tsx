import { cx } from "./cx";
import { Button, Icon, type ButtonProps } from "./Button";

export interface IconButtonProps extends Omit<ButtonProps, "children" | "icon" | "aria-label"> {
  icon: string;
  label: string;
}

export const IconButton = ({ icon, label, variant = "ghost", className, title, ...rest }: IconButtonProps) => (
  <Button {...rest} variant={variant} className={cx("so-icon-btn", className)} aria-label={label} title={title ?? label}>
    <Icon name={icon} />
  </Button>
);

export default IconButton;
