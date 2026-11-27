// =======================
// w tym pliku jest liczba która "dobija" do nowej wartości (np. kredyty po zakupie)
// =======================
import { useEffect, useRef } from "react";
import { fmt } from "../utils.js";

export default function AnimatedNumber({ value, from, ms = 900 }) {
  const ref = useRef(null);
  const last = useRef(from ?? value);

  useEffect(() => {
    const start = last.current, t0 = performance.now();
    let raf;
    const step = now => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      const v = start + (value - start) * (1 - Math.pow(1 - k, 3));
      if (ref.current) ref.current.textContent = fmt(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    last.current = value;
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  // tekst wpisuje tylko efekt wyżej, żeby React nie przerywał animacji
  return <span ref={ref} />;
}
