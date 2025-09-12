import { useEffect, useState } from "react";
import RequirementIndicator from "../../common/RequirementIndicator";
import { event_types, eventSource, getContext, powerUser } from "../../../services/SillyTavernAPI";
// import useWorldLore from "../../../hooks/useWorldLore";

const Requirements = () => {
  // useWorldLore();
  const [currentUserName, setCurrentUserName] = useState("");
  const [personaStatus, setPersonaStatus] = useState("green");
  const [groupChatStatus, setGroupChatStatus] = useState("red");
  const [worldLoreStatus, setWorldLoreStatus] = useState("green");
  const [objectivesStatus, setObjectivesStatus] = useState("green");



  const onPersonaReload = async () => {
    const { name1 } = getContext();
    console.log("Persona reloaded", name1);
    setCurrentUserName(name1);
    setPersonaStatus(name1 ? "green" : "yellow");
    console.log(powerUser.personas)
  }

  useEffect(() => {
    const onChatChanged = async () => {
      const { groupId, chatId, ...context } = getContext();
      console.log("Chat changed", { ...context, groupId, chatId });
      setGroupChatStatus(groupId ? "green" : "yellow");
      onPersonaReload();
    }


    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    onPersonaReload();
    onChatChanged();

    return () => {
      eventSource.removeListener(event_types.CHAT_CHANGED, onChatChanged);
    };
  }, []);


  return (

    <div className="">
      Hello {currentUserName}
      <RequirementIndicator text="Persona defined" color={personaStatus} onReload={onPersonaReload} />
      <RequirementIndicator text={`Group chat${groupChatStatus !== "green" ? " - Please select a chat group" : ""}`} color={groupChatStatus} />
      <RequirementIndicator text="World lore" color={worldLoreStatus} />
      <RequirementIndicator text="Objetives" color={objectivesStatus} />
    </div>
  );
};

export default Requirements;

