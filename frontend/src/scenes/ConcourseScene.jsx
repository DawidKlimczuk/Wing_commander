// =======================
// w tym pliku jest plac bazy New Detroit - klikam w budynki żeby wejść do środka
// =======================
import { useEffect, useRef, useState } from "react";
import { Concourse, shipSprite } from "../engine/concourse.js";
import { shipMesh, modelRadius } from "../engine/ships3d.js";
import { sound } from "../engine/audio.js";
import { useShop } from "../context/ShopContext.jsx";
import AnimatedNumber from "../components/AnimatedNumber.jsx";
import { isSecure, toStardate } from "../utils.js";

export default function ConcourseScene({ onSelect, onLaunch }) {
  const { hulls, weapons, currentClient, padHull, online } = useShop();
  const canvasRef = useRef(null);
  const concourseRef = useRef(null);
  const [hover, setHover] = useState(null);

  // w refach trzymam najnowsze dane, bo Concourse woła funkcje z wnętrza swojej pętli
  const tickerRef = useRef("LOADING");
  tickerRef.current = [...hulls, ...weapons.filter(w => w.kind === "energy")].map(i => `${i.name} ${i.price}`).join("  +  ") || "LOADING";
  const handlers = useRef({});
  handlers.current = { onSelect, onLaunch };

  // tworzę plac przy wejściu na scenę i sprzątam przy wyjściu
  useEffect(() => {
    const c = new Concourse(canvasRef.current, {
      onHover(h) { setHover(h); if (h) sound.hover(); },
      onSelect(h) {
        sound.click();
        if (h.id === "launch") {
          // zdjęcie placu bez statku - na nim będzie animacja startu
          c.hover = null;
          c.shipOnPad = false;
          c.draw();
          handlers.current.onLaunch(c.snapshot());
          return;
        }
        handlers.current.onSelect(h.id);
      },
      getTicker: () => tickerRef.current,
    });
    concourseRef.current = c;
    c.start();
    sound.startAmbient();
    return () => c.destroy();
  }, []);

  // podmieniam statek na lądowisku jak klient coś kupi
  useEffect(() => {
    const c = concourseRef.current;
    if (c) c.padShip = shipSprite(padHull, 72, 40, { yaw: 1.95, pitch: 0.34, scale: 22 / modelRadius(shipMesh(padHull)) });
  }, [padHull]);

  return (
    <section id="concourse" className="scene active">
      <canvas ref={canvasRef} width="320" height="200" className="pix fill" />
      <div className="hud-top">
        <span className="base-name">NEW DETROIT</span>
        <span className="hud-sep">&#9670;</span>
        <span>{toStardate(new Date().toISOString()).split(" ")[0]}</span>
        <span className="hud-sep">&#9670;</span>
        <span className={`link ${online === false ? "down" : "up"}`} title="stan połączenia z API">
          <i className="led" />{online === false ? "LINK DOWN" : "LINK OK"}
        </span>
        <span className={`link ${isSecure() ? "up" : "warn"}`} title="protokół połączenia">
          <i className="led" />{isSecure() ? "HTTPS" : "HTTP"}
        </span>
        <span className="hud-right">PILOT: <b>{currentClient?.name || "—"}</b> &nbsp; KREDYTY: <b><AnimatedNumber value={currentClient?.credits || 0} /></b></span>
      </div>
      <div className="hotspot-label">{hover && <>{hover.label}<small>{hover.sub}</small></>}</div>
    </section>
  );
}
