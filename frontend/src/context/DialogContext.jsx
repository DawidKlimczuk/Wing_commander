// =======================
// w tym pliku jest okienko z komunikatami (jak w grze) i funkcja pokazująca błędy z serwera
// =======================
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ApiError } from "../api.js";
import { sound } from "../engine/audio.js";
import { fmt } from "../utils.js";

const DialogContext = createContext(null);
export const useDialog = () => useContext(DialogContext);

// ==============
// funkcja zamienia szczegóły błędu z API na listę do wyświetlenia
// ==============
function errorDetails(d) {
  if (d.fields) return Object.entries(d.fields).map(([k, v]) => `${k}: ${v}`);
  if (d.shortages) return d.shortages.map(s => `${s.name}: potrzeba ${s.requested}, na stanie ${s.in_stock}`);
  if (d.missing) return [`Brakuje: ${fmt(d.missing)} kr`];
  if (d.allowed) return [`Dozwolone: ${d.allowed.join(", ")}`];
  return [];
}

export function DialogProvider({ children }) {
  const [box, setBox] = useState(null);
  const okRef = useRef(null);

  // ==============
  // funkcja pokazuje okienko i czeka aż ktoś kliknie OK (true) albo ANULUJ (false)
  // ==============
  const dialog = useCallback((title, body, { error = false, confirm = false } = {}) => {
    return new Promise(resolve => setBox({ title, body, error, confirm, resolve }));
  }, []);

  // ==============
  // funkcja pokazuje błąd z serwera (komunikat, szczegóły i kod HTTP)
  // ==============
  const showError = useCallback(e => {
    sound.error();
    if (!(e instanceof ApiError)) {
      console.error(e);
      return dialog("AWARIA SYSTEMU", e?.message || String(e), { error: true });
    }
    const list = errorDetails(e.details || {});
    const title = e.status === 0 ? "BRAK ŁĄCZNOŚCI" : "TRANSMISJA ODRZUCONA";
    return dialog(title, <>
      {e.message}
      {list.length > 0 && <ul>{list.map(l => <li key={l}>{l}</li>)}</ul>}
      <span className="code">{e.status ? `HTTP ${e.status}` : "BRAK ODPOWIEDZI"} · {e.code}</span>
    </>, { error: true });
  }, [dialog]);

  const close = useCallback(value => {
    sound.click();
    box?.resolve(value);
    setBox(null);
  }, [box]);

  // ESC zamyka okienko, Enter klika OK
  useEffect(() => {
    if (!box) return;
    okRef.current?.focus();
    const onKey = e => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); close(!box.confirm); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [box, close]);

  return (
    <DialogContext.Provider value={{ dialog, showError, isOpen: !!box }}>
      {children}
      {box && (
        <div className="dialog">
          <div className="dialog-box">
            <div className={`dialog-title ${box.error ? "err" : ""}`}>{box.title}</div>
            <div className="dialog-body">{box.body}</div>
            <button className="btn" ref={okRef} onClick={() => close(true)}>OK</button>
            {box.confirm && <button className="btn" onClick={() => close(false)}>ANULUJ</button>}
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
