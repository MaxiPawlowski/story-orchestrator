import { useEffect, useState } from 'react';
import { fetchLoreInfo, saveWorldInfo } from '../services/LoreManager'

const useWorldLore = () => {
  const [worldLores, setWorldLores] = useState([]);

  useEffect(() => {
    const fetchLore = async () => {
      const worlds = await fetchLoreInfo();


      setWorldLores(worlds);
    };

    fetchLore();
  }, []);

  return { worldLores };
}


export default useWorldLore;
