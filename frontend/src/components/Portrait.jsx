// =======================
// w tym pliku jest komponent rysujący pikselowy portret pilota
// =======================
import { useEffect, useRef } from "react";
import { drawPortrait } from "../engine/portraits.js";

export default function Portrait({ name, profession }) {
  const ref = useRef(null);
  // rysuję portret od nowa jak zmieni się imię albo profesja
  useEffect(() => { drawPortrait(ref.current, name || "?", profession); }, [name, profession]);
  return <canvas ref={ref} width="32" height="40" className="pix" />;
}
