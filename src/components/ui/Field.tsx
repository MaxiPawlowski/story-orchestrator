import type { InputHTMLAttributes, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

export type FieldSize = "xs" | "sm" | "md" | "lg" | "full";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: FieldSize;
  ref?: Ref<HTMLInputElement>;
}

export const TextInput = ({ size = "full", className, type = "text", ...rest }: TextInputProps) => (
  <input type={type} {...rest} data-size={size} className={cx("text_pole so-field", className)} />
);

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: FieldSize;
  ref?: Ref<HTMLSelectElement>;
}

export const Select = ({ size = "md", className, children, ...rest }: SelectProps) => (
  <select {...rest} data-size={size} className={cx("text_pole so-field", className)}>{children}</select>
);

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: FieldSize;
  ref?: Ref<HTMLTextAreaElement>;
}

export const TextArea = ({ size = "full", className, ...rest }: TextAreaProps) => (
  <textarea {...rest} data-size={size} className={cx("text_pole so-field", className)} />
);

export default TextInput;
