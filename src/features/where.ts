import type { FeatureWhere } from "./registry";

export const settingsAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Settings › ${label}`, surface: "settings" });
export const drawerAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Story drawer › ${label}`, surface: "drawer" });
export const chatAt = (selector: string, label: string): FeatureWhere => ({ selector, label, surface: "chat" });
export const studioAt = (selector: string, label: string): FeatureWhere => ({ selector, label: `Studio › ${label}`, surface: "studio" });
