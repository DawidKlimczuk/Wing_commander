// =======================
// w tym pliku jest animacja startu z lądowiska statkiem kupionym przez pilota
// =======================
import { useEffect, useRef } from "react";
import { runLaunch } from "../engine/scenes.js";
import { useShop } from "../context/ShopContext.jsx";

export default function Launch({ backdrop, onDone }) {
  const { padHull } = useShop();
  const canvasRef = useRef(null);
  const commRef = useRef(null);
  const started = useRef(false);

  // animację odpalam tylko raz, po jej końcu wracam na plac
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runLaunch(canvasRef.current, commRef.current, backdrop, padHull).then(onDone);
  }, [backdrop, padHull, onDone]);

  return (
    <section id="launch" className="scene active">
      <canvas ref={canvasRef} width="320" height="200" className="pix fill" />
      <div className="comm" ref={commRef}></div>
    </section>
  );
}
