// =======================
// w tym pliku są małe funkcje pomocnicze używane w wielu miejscach
// =======================
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// liczba z odstępami co 3 cyfry, np. 150 000
export const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// zapis w localStorage (w trybie prywatnym może nie działać, więc try/catch)
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* brak storage */ } },
};

export const PROF = { trader: "Handlarz", pirate: "Pirat", mercenary: "Najemnik", bounty_hunter: "Łowca nagród", smuggler: "Przemytnik" };
export const MOUNT = { gun: "DZIAŁO", turret: "WIEŻA", missile: "RAKIETY" };

// ==============
// funkcja zamienia datę na datę gwiezdną (rok + 643, bo gra dzieje się w 2669)
// ==============
export function toStardate(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear() + 643}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// czy strona jest otwarta po https
export const isSecure = () => window.location.protocol === "https:";
