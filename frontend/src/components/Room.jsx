// =======================
// w tym pliku jest ramka pomieszczenia: metalowa tabliczka z nazwą, tło i przycisk powrotu
// =======================
import { useMemo } from "react";
import { roomBackground } from "../engine/rooms.js";
import { sound } from "../engine/audio.js";

export default function Room({ id, title, sub, tint, seed, right, onExit, children }) {
  // tło rysuję tylko raz, bo to trochę trwa
  const bg = useMemo(() => roomBackground(tint, seed), [tint, seed]);
  return (
    <section id={id} className="scene active room" style={{ "--room-bg": bg }}>
      <header className="plate">
        <span className="plate-title">{title}</span>
        <span className="plate-sub">{sub}</span>
        {right && <div className="plate-right">{right}</div>}
      </header>
      {children}
      <button className="btn exit" onClick={() => { sound.click(); onExit(); }}>&#9664; CONCOURSE</button>
    </section>
  );
}
