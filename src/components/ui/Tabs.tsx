import { createContext, useContext, type ReactNode, type Ref } from "react";
import { cx } from "./cx";
import { roveWithin } from "./rovingKeys";

export type TabsVariant = "underline" | "segmented";

interface TabsState {
  value: string;
  onChange: (value: string) => void;
  idPrefix: string;
}

const TabsContext = createContext<TabsState | null>(null);

const useTabs = (): TabsState => {
  const state = useContext(TabsContext);
  if (!state) throw new Error("Tab must sit inside Tabs");
  return state;
};

export interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  idPrefix: string;
  children: ReactNode;
}

export const Tabs = ({ value, onChange, idPrefix, children }: TabsProps) => (
  <TabsContext.Provider value={{ value, onChange, idPrefix }}>{children}</TabsContext.Provider>
);

export interface TabListProps {
  label: string;
  variant?: TabsVariant;
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
  className?: string;
  id?: string;
}

export const TabList = ({ label, variant = "underline", orientation = "horizontal", children, className, id }: TabListProps) => (
  <div id={id} role="tablist" aria-label={label} aria-orientation={orientation} data-variant={variant} className={cx("so-tablist", className)}
    onKeyDown={(event) => { roveWithin(event, "[role=tab]", orientation); }}>
    {children}
  </div>
);

export interface TabProps {
  value: string;
  id?: string;
  children: ReactNode;
  controls?: string;
  count?: number;
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  "data-so"?: string;
  "data-tab"?: string;
}

export const tabId = (prefix: string, value: string) => `${prefix}${value}`;

export const Tab = ({ value, id, children, controls, count, disabled, className, ref, "data-so": dataSo, "data-tab": dataTab }: TabProps) => {
  const tabs = useTabs();
  const selected = tabs.value === value;
  return (
    <button ref={ref} type="button" role="tab" id={id ?? tabId(tabs.idPrefix, value)} aria-selected={selected} aria-controls={controls} tabIndex={selected ? 0 : -1}
      disabled={disabled} data-so={dataSo} data-tab={dataTab} className={cx("so-tab", className)} onClick={() => { if (!selected) tabs.onChange(value); }}>
      {children}
      {count !== undefined && <span className="so-tab-count">{count}</span>}
    </button>
  );
};

export interface TabPanelProps {
  id: string;
  labelledBy?: string;
  children: ReactNode;
  className?: string;
  "data-so"?: string;
  "data-tab"?: string;
}

export const TabPanel = ({ id, labelledBy, children, className, "data-so": dataSo, "data-tab": dataTab }: TabPanelProps) => {
  const tabs = useTabs();
  return <div id={id} role="tabpanel" tabIndex={-1} aria-labelledby={labelledBy ?? tabId(tabs.idPrefix, tabs.value)} data-so={dataSo} data-tab={dataTab} className={className}>{children}</div>;
};

export default Tabs;
