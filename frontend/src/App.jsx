// =======================
// w tym pliku jest główny komponent - ekran 1280x800, przechodzenie między miejscami i klawiatura
// =======================
import { useCallback, useEffect, useRef, useState } from "react";
import { sound } from "./engine/audio.js";
import { DialogProvider, useDialog } from "./context/DialogContext.jsx";
import { ShopProvider, useShop } from "./context/ShopContext.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Boot from "./scenes/Boot.jsx";
import IntroScene from "./scenes/IntroScene.jsx";
import ConcourseScene from "./scenes/ConcourseScene.jsx";
import Dealer from "./scenes/Dealer.jsx";
import Bar from "./scenes/Bar.jsx";
import Exchange from "./scenes/Exchange.jsx";
import Computer from "./scenes/Computer.jsx";
import Launch from "./scenes/Launch.jsx";
import { sleep } from "./utils.js";

const ROOMS = ["dealer", "bar", "exchange", "computer"];

// ==============
// komponent odpowiedzialny za to która scena jest teraz widoczna
// ==============
function Game({ onToggleCrt }) {
  const { refresh } = useShop();
  const { showError, isOpen } = useDialog();
  // ?scene=dealer w adresie pomija ładowanie i intro
  const [skipTo] = useState(() => new URLSearchParams(window.location.search).get("scene"));
  const [scene, setScene] = useState(skipTo ? "loading" : "boot");
  const [opts, setOpts] = useState({});
  const [fade, setFade] = useState(false);
  const [backdrop, setBackdrop] = useState(null);
  const sceneRef = useRef(scene);
  const dialogOpen = useRef(false);
  dialogOpen.current = isOpen;

  const show = useCallback(next => { sceneRef.current = next; setScene(next); }, []);

  // ==============
  // funkcja odpowiedzialna za przejście do innego miejsca (z wygaszeniem ekranu)
  // ==============
  const go = useCallback(async (next, o = {}) => {
    if (next === sceneRef.current) return;
    setFade(true);
    if (!["boot", "intro", "loading"].includes(sceneRef.current)) sound.door();
    await sleep(360);
    setOpts(o);
    show(next);
    await sleep(40);
    setFade(false);
  }, [show]);

  const toConcourse = useCallback(() => go("concourse"), [go]);
  const toIntro = useCallback(() => go("intro"), [go]);

  // ==============
  // wybór miejsca na placu
  // ==============
  const enter = useCallback(id => {
    if (id === "guild") return go("computer", { view: "term" });
    if (id === "computer") return go("computer", { view: "stats" });
    go(id);
  }, [go]);

  // ==============
  // start statku z lądowiska
  // ==============
  const launch = useCallback(async snap => {
    setBackdrop(snap);
    setFade(true);
    await sleep(200);
    sound.stopAmbient();
    show("launch");
    setFade(false);
  }, [show]);
  const launchDone = useCallback(() => show("concourse"), [show]);

  // pominięcie intro - najpierw pobieram dane
  useEffect(() => {
    if (!skipTo) return;
    refresh().catch(showError).finally(() => go(ROOMS.includes(skipTo) ? skipTo : "concourse"));
  }, [skipTo, refresh, showError, go]);

  // klawiatura: ESC - powrót, M - dźwięk, C - efekt CRT
  useEffect(() => {
    const onKey = e => {
      if (dialogOpen.current) return;
      const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
      if (typing) return;
      if (e.key === "Escape" && ROOMS.includes(sceneRef.current)) go("concourse");
      if (e.key === "m" || e.key === "M") sound.toggleMute();
      if (e.key === "c" || e.key === "C") onToggleCrt();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onToggleCrt]);

  // dźwięki przy najechaniu na przyciski i odblokowanie dźwięku po pierwszym kliknięciu
  useEffect(() => {
    const over = e => { if (e.target.closest?.(".btn, .tab, .comp-btn, .mini")) sound.hover(); };
    const down = () => { sound.unlock(); if (sceneRef.current === "concourse") sound.startAmbient(); };
    document.addEventListener("mouseover", over);
    window.addEventListener("pointerdown", down);
    return () => { document.removeEventListener("mouseover", over); window.removeEventListener("pointerdown", down); };
  }, []);

  return <>
    <ErrorBoundary key={scene}>
      {scene === "boot" && <Boot onDone={toIntro} />}
      {scene === "intro" && <IntroScene onDone={toConcourse} />}
      {scene === "concourse" && <ConcourseScene onSelect={enter} onLaunch={launch} />}
      {scene === "dealer" && <Dealer onExit={toConcourse} />}
      {scene === "bar" && <Bar onExit={toConcourse} />}
      {scene === "exchange" && <Exchange onExit={toConcourse} />}
      {scene === "computer" && <Computer view={opts.view} onExit={toConcourse} />}
      {scene === "launch" && <Launch backdrop={backdrop} onDone={launchDone} />}
    </ErrorBoundary>
    <div id="fader" className={fade ? "on" : ""} />
  </>;
}

// ==============
// komponent z ekranem - skaluje go do okna przeglądarki
// ==============
export default function App() {
  const screenRef = useRef(null);
  const [crt, setCrt] = useState(true);
  const toggleCrt = useCallback(() => setCrt(c => !c), []);

  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / 1280, (window.innerHeight - 22) / 800);
      screenRef.current.style.transform = `translate(-50%, calc(-50% - 9px)) scale(${s})`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div id="stage">
      <div id="screen" ref={screenRef} className={crt ? "" : "no-crt"}>
        <DialogProvider>
          <ShopProvider>
            <Game onToggleCrt={toggleCrt} />
          </ShopProvider>
        </DialogProvider>
        <div id="crt-overlay" />
      </div>
      <div id="hint">ESC &mdash; powrót &nbsp;&middot;&nbsp; M &mdash; dźwięk &nbsp;&middot;&nbsp; C &mdash; efekt CRT</div>
    </div>
  );
}
