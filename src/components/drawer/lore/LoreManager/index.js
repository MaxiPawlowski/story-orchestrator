import React, { useState, useEffect } from "react";
import {
  fetchWorldInfo,
  saveWorldInfo,
} from "../../../../services/LoreManager";
import LoreEntry from "../LoreEntry";
import {
  getContext,
  getWorldInfoSettings,
} from "../../../../services/SillyTavernAPI";

const LoreManager = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [entryList, setEntryList] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(
    localStorage.getItem("lvm--lvm.selectedCategory") || ""
  );

  const context = getContext();

  const categoryList = [...new Set(entryList.map((e) => e.category))].sort();

  useEffect(() => {
    const handleWorldInfoSettingsUpdated = () => {
      console.log("WORLDINFO_SETTINGS_UPDATED");
      updateEntries();
    };

    const handleSettingsUpdated = () => {
      console.log("SETTINGS_UPDATED");
      updateEntries();
    };

    const handleChatChanged = () => {
      console.log("CHAT_CHANGED");
      updateEntries();
    };

    context.eventSource.on(
      context.event_types.WORLDINFO_SETTINGS_UPDATED,
      handleWorldInfoSettingsUpdated
    );
    context.eventSource.on(
      context.event_types.SETTINGS_UPDATED,
      handleSettingsUpdated
    );
    context.eventSource.on(context.event_types.CHAT_CHANGED, handleChatChanged);

    return () => {
      context.eventSource.off(
        context.event_types.WORLDINFO_SETTINGS_UPDATED,
        handleWorldInfoSettingsUpdated
      );
      context.eventSource.off(
        context.event_types.SETTINGS_UPDATED,
        handleSettingsUpdated
      );
      context.eventSource.off(
        context.event_types.CHAT_CHANGED,
        handleChatChanged
      );
    };
  }, [context.eventSource, context.event_types]);

  useEffect(() => {
    updateEntries();
  }, []);

  const updateEntries = async () => {
    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const worldNames = getWorldInfoSettings().world_info.globalSelect;
      console.log(worldNames);

      let updatedEntries = [];
      for (const name of worldNames) {
        const entries = await updateWorld(name);
        updatedEntries = [...updatedEntries, ...entries];
      }

      setEntryList(
        updatedEntries.filter((entry) => worldNames.includes(entry.world))
      );
    } catch (error) {
      console.error("Error updating entries:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const updateWorld = async (name) => {
    const queue = [];
    try {
      const data = await fetchWorldInfo(name);
      console.log(data);

      const entries = Object.values(data.entries).filter((entry) =>
        /^#lv:([a-z]+)/i.test(entry.comment)
      );

      for (const entryData of entries) {
        const categoryMatch = entryData.comment.match(/^#lv:([a-z]+)/i);
        const category = categoryMatch ? categoryMatch[1] : "default";

        const varList = parseVariables(entryData);

        const entry = {
          id: `${name}---${entryData.key.join(",")}`,
          world: name,
          key: entryData.key.join(","),
          category,
          isEnabled: !entryData.disable,
          varList,
          rawData: entryData,
        };

        queue.push(entry);
      }
    } catch (error) {
      console.error("Error updating world:", error);
    }
    return queue;
  };

  const parseVariables = (entryData) => {
    const vars = [];

    const varDefs = entryData.comment
      .split("###lv-values")[0]
      .split("\n")
      .slice(1)
      .join("\n");

    const varMatches = [
      ...varDefs.matchAll(/<([a-z][a-z0-9]*):([a-z]+)(\[\])?(?:=([^>]*))?>/gi),
    ];

    varMatches.forEach((match) => {
      const [, name, type, isList, defaultValue] = match;
      const value = defaultValue || "";
      const loreVar = {
        name,
        type,
        isList: !!isList,
        value,
        state: {},
      };
      vars.push(loreVar);
    });

    const savedValues = JSON.parse(
      (entryData.comment.split("###lv-values")[1] || "[]").trim()
    );

    vars.forEach((v) => {
      const savedVar = savedValues.find((sv) => sv.name === v.name);
      if (savedVar) {
        v.value = savedVar.value;
      }
    });

    return vars;
  };

  const handleCategorySelect = (category) => {
    setSelectedCategory((prevCategory) => {
      const newCategory = prevCategory === category ? "" : category;
      localStorage.setItem("lvm--lvm.selectedCategory", newCategory);
      return newCategory;
    });
  };

  const handleEntryChange = async (updatedEntry) => {
    setEntryList((prevEntries) =>
      prevEntries.map((entry) =>
        entry.id === updatedEntry.id ? updatedEntry : entry
      )
    );

    await saveWorld(updatedEntry.world);
  };

  const saveWorld = async (name) => {
    try {
      const data = await fetchWorldInfo(name);
      let hasUpdate = false;

      const updatedEntries = entryList.filter((e) => e.world === name);

      Object.values(data.entries).forEach((entryData) => {
        const updatedEntry = updatedEntries.find(
          (e) => e.key === entryData.key.join(",")
        );
        if (updatedEntry) {
          const varDefs = entryData.comment
            .split("###lv-values")[0]
            .split("\n")
            .slice(1)
            .join("\n");

          const newContent = varDefs.replace(
            /<([a-z][a-z0-9]*):([a-z]+)(\[\])?(?:=([^>]*))?>/gi,
            (text, vName) => {
              const v = updatedEntry.varList.find((it) => it.name === vName);
              return v ? v.typedValue : text;
            }
          );

          const newComment = `${
            entryData.comment.split("###lv-values")[0]
          }###lv-values${JSON.stringify(updatedEntry.varList)}`;

          if (
            newContent !== entryData.content ||
            newComment !== entryData.comment ||
            entryData.disable !== !updatedEntry.isEnabled
          ) {
            hasUpdate = true;
            entryData.content = newContent;
            entryData.comment = newComment;
            entryData.disable = !updatedEntry.isEnabled;
          }
        }
      });

      if (hasUpdate) {
        await saveWorldInfo(data, name);
      }
    } catch (error) {
      console.error("Error saving world:", error);
    }
  };

  if (!entryList.length) return null;

  return (
    <div id="lvm--root" className="lvm--root">
      <div className="lvm--tabs">
        <div className="lvm--tab lvm--reload" onClick={updateEntries}>
          ⟳
        </div>
        {categoryList.map((category) => (
          <div
            key={category}
            className={`lvm--tab ${
              selectedCategory === category ? "active" : ""
            }`}
            onClick={() => handleCategorySelect(category)}
          >
            {category}
          </div>
        ))}
      </div>
      <div className="lvm--tabContent">
        {entryList
          .filter((entry) => entry.category === selectedCategory)
          .map((entry) => (
            <LoreEntry
              key={entry.id}
              entry={entry}
              onEntryChange={handleEntryChange}
            />
          ))}
      </div>
    </div>
  );
};

export default LoreManager;
