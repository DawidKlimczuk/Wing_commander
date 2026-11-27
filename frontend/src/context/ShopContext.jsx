// =======================
// w tym pliku trzymam dane pobrane z serwera (statki, broń, klienci) i aktualnego klienta
// każdy widok bierze dane stąd, więc po zmianie wystarczy zawołać refresh()
// =======================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { store } from "../utils.js";

const ShopContext = createContext(null);
export const useShop = () => useContext(ShopContext);

const DEFAULT_SHIP = { name: "Tarsus" };

export function ShopProvider({ children }) {
  const [hulls, setHulls] = useState([]);
  const [weapons, setWeapons] = useState([]);
  const [clients, setClients] = useState([]);
  const [meta, setMeta] = useState({ origins: [], professions: [], acceleration: [] });
  const [clientId, setClientId] = useState(() => Number(store.get("gemini.client")) || null);
  const [padHull, setPadHull] = useState(DEFAULT_SHIP);
  // czy ostatnie zapytanie do serwera się udało (lampka w rogu ekranu)
  const [online, setOnline] = useState(null);

  // ==============
  // funkcja pobiera wszystkie dane z serwera
  // ==============
  const refresh = useCallback(async () => {
    try {
      const [h, w, c, m] = await Promise.all([api.hulls(), api.weapons(), api.clients(), api.meta()]);
      setHulls(h); setWeapons(w); setClients(c); setMeta(m);
      setClientId(id => (c.some(x => x.id === id) ? id : c[0]?.id ?? null));
      setOnline(true);
      return { hulls: h, weapons: w, clients: c };
    } catch (e) {
      setOnline(false);
      throw e;
    }
  }, []);

  // ==============
  // funkcja ustawia aktualnie obsługiwanego klienta
  // ==============
  const selectClient = useCallback(id => {
    setClientId(id);
    store.set("gemini.client", String(id));
  }, []);

  const currentClient = useMemo(() => clients.find(c => c.id === clientId) || null, [clients, clientId]);

  // statek na lądowisku to ostatni statek kupiony przez klienta (albo stary Tarsus)
  useEffect(() => {
    let cancelled = false;
    const c = currentClient;
    if (!c || !c.transactions) { setPadHull(DEFAULT_SHIP); return; }
    api.client(c.id).then(detail => {
      if (cancelled) return;
      const last = detail.history.at(-1)?.ships.at(-1)?.hull;
      setPadHull(last ? hulls.find(h => h.id === last.id) || { name: last.name } : DEFAULT_SHIP);
    }).catch(() => { if (!cancelled) setPadHull(DEFAULT_SHIP); });
    return () => { cancelled = true; };
  }, [currentClient, hulls]);

  const value = {
    hulls, weapons, clients, meta, online,
    clientId, currentClient, selectClient, padHull, refresh,
  };
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
