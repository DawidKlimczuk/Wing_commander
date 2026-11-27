// =======================
// w tym pliku jest intro z gwiazdami i przelatującym Centurionem
// =======================
import { useEffect, useRef, useState } from "react";
import { Intro } from "../engine/scenes.js";
import { sound } from "../engine/audio.js";

export default function IntroScene({ onDone }) {
  const canvasRef = useRef(null);
  const [show, setShow] = useState(false);

  // start animacji przy wejściu, stop przy wyjściu
  useEffect(() => {
    const intro = new Intro(canvasRef.current);
    intro.start();
    sound.startAmbient();
    const raf = requestAnimationFrame(() => setShow(true));
    return () => { intro.stop(); cancelAnimationFrame(raf); };
  }, []);

  // po chwili dowolny klawisz albo klik przechodzi dalej
  useEffect(() => {
    let next;
    const timer = setTimeout(() => {
      next = () => {
        window.removeEventListener("keydown", next);
        window.removeEventListener("click", next);
        sound.click();
        onDone();
      };
      window.addEventListener("keydown", next);
      window.addEventListener("click", next);
    }, 1200);
    return () => {
      clearTimeout(timer);
      if (next) { window.removeEventListener("keydown", next); window.removeEventListener("click", next); }
    };
  }, [onDone]);

  return (
    <section id="intro" className={`scene active ${show ? "show" : ""}`}>
      <canvas ref={canvasRef} width="320" height="200" className="pix fill" />
      <div className="intro-text">
        <div className="intro-pre">Sektor Gemini &middot; rok 2669</div>
        <h1 className="chrome" data-text="GEMINI">GEMINI</h1>
        <h2 className="chrome small" data-text="SHIPYARD">SHIPYARD</h2>
        <div className="intro-sub">A Privateer tribute by <span className="author">Dawid Klimczuk</span><br /><small>Programowanie Wysokopoziomowe &middot; React + REST API</small></div>
        <div className="press-key"><span className="blink">KLIKNIJ ALBO NACIŚNIJ DOWOLNY KLAWISZ</span></div>
      </div>
    </section>
  );
}
