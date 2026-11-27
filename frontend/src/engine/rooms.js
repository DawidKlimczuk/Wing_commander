// =======================
// w tym pliku są funkcje rysujące tła pomieszczeń i tło podglądu statku
// =======================
import { Pix, rng, mix } from "./pixel.js";

// ==============
// funkcja rysuje tło pomieszczenia (metalowe panele) i zwraca je jako url do CSS
// ==============
export function roomBackground(tint, seed) {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 200;
  const p = new Pix(c.getContext("2d"));
  const r = rng(seed);
  p.vgrad(0, 0, 320, 200, [mix("#1c2134", tint, 0.25), mix("#121624", tint, 0.15), "#080a12"]);
  for (let x = 0; x < 320; x += 40) {
    p.rect(x, 0, 1, 200, "#05060a");
    p.rect(x + 1, 0, 1, 200, mix("#2c3248", tint, 0.2));
  }
  for (let y = 0; y < 200; y += 50) {
    p.rect(0, y, 320, 1, "#05060a");
    p.rect(0, y + 1, 320, 1, mix("#2c3248", tint, 0.2));
    for (let x = 4; x < 320; x += 40) { p.px(x, y + 4, "#3a4158"); p.px(x + 32, y + 4, "#3a4158"); }
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * 320), y = Math.floor(r() * 200);
    p.dither(x, y, 6 + Math.floor(r() * 20), 2 + Math.floor(r() * 6), "#0a0c14", mix("#20263a", tint, 0.3), 0.3);
  }
  return `url(${c.toDataURL()})`;
}

// ==============
// funkcja rysuje zieloną siatkę za obracającym się statkiem w sklepie
// ==============
export function viewportBackground(w = 256, h = 150) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const p = new Pix(c.getContext("2d"));
  p.vgrad(0, 0, w, h, ["#020a06", "#03140a", "#06200f"]);
  for (let k = 1; k < 9; k++) {
    const y = Math.round(100 + 50 * (1 - 1 / (1 + k * k * 0.08)));
    p.rect(0, y, w, 1, "#0c3a1a");
  }
  for (let x = -400; x <= 656; x += 32) p.line(128 + (x - 128) * 0.15, 100, x, 150, "#0c3a1a");
  p.rect(0, 100, w, 1, "#1e9c3c");
  return new Uint32Array(c.getContext("2d").getImageData(0, 0, w, h).data.buffer);
}
