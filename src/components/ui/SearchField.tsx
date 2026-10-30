import { useId } from "react";
import { cx } from "./cx";
import { Icon } from "./Button";
import { IconButton } from "./IconButton";

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  id?: string;
  className?: string;
  "data-so"?: string;
}

export const SearchField = ({ value, onChange, label, placeholder, id, className, "data-so": dataSo }: SearchFieldProps) => {
  const fallback = useId();
  const inputId = id ?? fallback;
  return (
    <div className={cx("so-search", className)}>
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <Icon name="fa-magnifying-glass" />
      <input id={inputId} data-so={dataSo} type="search" className="text_pole so-field" value={value} placeholder={placeholder ?? label}
        onChange={(event) => onChange(event.target.value)} />
      {value && <IconButton size="sm" icon="fa-xmark" label={`Clear: ${label}`} onClick={() => onChange("")} />}
    </div>
  );
};

export default SearchField;
