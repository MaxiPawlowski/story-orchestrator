import { getMetadataBlob } from "./persistence";
import { settingsRoot } from "./settingsRoot";
import { listed, sizeOfItems, type StateSize } from "./stateSizeCore";

export const stateSize = (): StateSize => {
  const root = settingsRoot();
  return {
    blobChars: sizeOfItems(listed(getMetadataBlob().stories)),
    libraryChars: sizeOfItems(listed(root.v2Stories)) + sizeOfItems(listed(root.wizardSessions)),
  };
};
