// =======================
// w tym pliku jest ekran ładowania jak w starym pecie (BIOS + MS-DOS)
// liczby w ostatniej linijce są prawdziwe, pobrane z API
// =======================
import { useRef, useState } from "react";
import { api } from "../api.js";
import { sound } from "../engine/audio.js";
import { runBoot } from "../engine/scenes.js";
import { useShop } from "../context/ShopContext.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import { sleep } from "../utils.js";

export default function Boot({ onDone }) {
  const { refresh } = useShop();
  const { showError } = useDialog();
  const logRef = useRef(null);
  const [powered, setPowered] = useState(false);

  // ==============
  // kliknięcie włącznika - start ładowania
  // ==============
  async function powerOn() {
    sound.unlock();
    setPowered(true);
    const data = refresh();
    const statsPromise = data.then(d => api.stats().then(s => ({
      hulls: d.hulls.length, weapons: d.weapons.length, clients: s.clients, transactions: s.transactions,
    })));
    await sleep(500);
    await runBoot(logRef.current, statsPromise);
    try { await data; } catch (e) { await showError(e); }
    await sleep(700);
    onDone();
  }

  return (
    <section id="boot" className={`scene active ${powered ? "powered" : ""}`}>
      <pre id="boot-log" ref={logRef}></pre>
      {!powered && (
        <div className="power">
          <button onClick={powerOn} title="Włącz">&#x23FB;</button>
          <span className="led"></span>POWER
        </div>
      )}
    </section>
  );
}
