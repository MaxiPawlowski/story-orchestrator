import { getRequestHeaders, getWorldInfoSettings, loadWorldInfo } from "./SillyTavernAPI";


export const fetchLoreInfo = async () => {
  const worlds = []
  const { world_info: { globalSelect } } = getWorldInfoSettings()
  for (const world of globalSelect) {
    const data = await loadWorldInfo(world)
    worlds.push({ name: world, data })
  }

  return worlds
};

export const saveWorldInfo = async (data, name) => {
  const response = await fetch("/editworldinfo", {
    method: "POST",
    headers: getRequestHeaders(),
    body: JSON.stringify({ data, name }),
  });
  if (!response.ok) throw new Error("Failed to save world info");
  return response.json();
};

// export const saveWorldInfo = async (data, name) => {
//   const response = await fetch("/getchat", {
//     method: "POST",
//     headers: getRequestHeaders(),
//     body: JSON.stringify({ data, name }),
//   });
//   if (!response.ok) throw new Error("Failed to save world info");
//   return response.json();
// };
