import React, { useContext, useEffect, useState } from "react";
import { getGlobalSettings } from "@runtime/settingsStore";
import { spriteBuilderMembers, spriteVisualCardPresent } from "@services/stHost/sprites";
import { cardArt } from "../../sprites/cardArt";
import { subscribeVisualSources } from "../../sprites/visualChanges";
import { PreparePresentationContext } from "../presentationNavigation";
import CardArtView from "./CardArtView";

const read = (name: string) => cardArt(name, spriteBuilderMembers([name]), getGlobalSettings().sprites.visualSources, spriteVisualCardPresent);

export default function CharacterCardArt({ name, created }: { name: string; created: boolean }) {
  const prepare = useContext(PreparePresentationContext);
  const [art, setArt] = useState(() => read(name));
  useEffect(() => { setArt(read(name)); return subscribeVisualSources(() => setArt(read(name))); }, [name, created]);
  return <CardArtView name={name} art={art} onPrepare={prepare ?? undefined} />;
}
