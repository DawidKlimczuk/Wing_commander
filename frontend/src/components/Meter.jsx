// =======================
// w tym pliku jest pasek z kratek (do statystyk statku)
// =======================
export default function Meter({ value, max, cells = 10 }) {
  const on = Math.round(Math.min(1, value / max) * cells);
  return (
    <span className="meter">
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} className={`${i < on ? "on" : ""} ${i < on && i >= cells - 3 ? "hot" : ""}`} />
      ))}
    </span>
  );
}
