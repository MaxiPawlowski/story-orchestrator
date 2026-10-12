import { importSTModule } from "./modules";

const userHost = await importSTModule<{ getCurrentUserHandle: () => string }>("/scripts/user.js");

export const currentUserHandle = (): string => userHost.getCurrentUserHandle();
