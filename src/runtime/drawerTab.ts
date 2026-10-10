import type { WidgetDrawerTab } from "@engine/index";

export const DRAWER_TAB_EVENT = "so-drawer-tab";

export const requestDrawerTab = (tab: WidgetDrawerTab): boolean => window.dispatchEvent(new CustomEvent(DRAWER_TAB_EVENT, { detail: tab }));
