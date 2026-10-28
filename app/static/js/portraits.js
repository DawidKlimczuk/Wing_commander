// Pikselowe portrety pilotów 32x40 - deterministyczne z imienia i profesji.
import { Pix, rng, hashString, mix } from "./pixel.js";

const SKIN = ["#f1c7a0", "#e0a882", "#c68a62", "#a06a48", "#7a4e34", "#d8b090"];
const HAIR = ["#1a1210", "#3a2416", "#6a4020", "#a87838", "#d8c070", "#8a8a8a", "#c03020", "#e8e8e8"];
const BG = {
  trader: ["#0e2240", "#1d3c6a"],
  pirate: ["#2a0808", "#5a1414"],
  mercenary: ["#16220e", "#30461c"],
  bounty_hunter: ["#2a1c06", "#5a3c0e"],
  smuggler: ["#22082a", "#461454"],
};
const SUIT = {
  trader: "#3c5a8a", pirate: "#3a3a3a", mercenary: "#4a5a2c", bounty_hunter: "#6a4a24", smuggler: "#4a2a5a",
};

export function drawPortrait(canvas, name, profession) {
  const ctx = canvas.getContext("2d");
  const p = new Pix(ctx);
  const r = rng(hashString(name + "|" + profession));
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const [bgA, bgB] = BG[profession] || BG.trader;

  p.vgrad(0, 0, 32, 40, [bgB, bgA, "#05060a"]);
  for (let y = 0; y < 40; y += 2) p.rect(0, y, 32, 1, mix(bgA, "#000000", 0.3));

  const skin = pick(SKIN), skinDk = mix(skin, "#000000", 0.32), skinLt = mix(skin, "#ffffff", 0.2);
  const hair = pick(HAIR), hairDk = mix(hair, "#000000", 0.35);
  const long = r() > 0.65, bald = !long && r() > 0.82;
  const suit = SUIT[profession] || "#555", suitDk = mix(suit, "#000000", 0.4);

  // ramiona i kombinezon
  p.poly([[2, 40], [4, 33], [11, 29], [21, 29], [28, 33], [30, 40]], suit);
  p.poly([[2, 40], [4, 33], [9, 30], [8, 40]], suitDk);
  p.poly([[12, 29], [16, 34], [20, 29]], mix(suit, "#ffffff", 0.25));
  if (r() > 0.5) p.rect(21, 33, 4, 2, "#c8a020");                    // naszywka
  // szyja
  p.rect(13, 25, 6, 5, skinDk);

  if (long) p.poly([[8, 12], [24, 12], [26, 30], [22, 30], [16, 22], [10, 30], [6, 30]], hairDk);

  // głowa
  for (let y = 0; y < 18; y++) {
    const t = (y - 8) / 9, half = Math.round(7 * Math.sqrt(Math.max(0, 1 - t * t * (t > 0 ? 0.55 : 1))));
    for (let x = -half; x < half; x++) {
      p.px(16 + x, 8 + y, x > half - 3 ? skinDk : x < -half + 2 ? skinLt : skin);
    }
  }
  // oczy, brwi, nos, usta
  const eyeY = 16;
  p.rect(12, eyeY, 2, 1, "#f0f0f0"); p.rect(18, eyeY, 2, 1, "#f0f0f0");
  p.px(13, eyeY, "#141418"); p.px(19, eyeY, "#141418");
  p.rect(11, eyeY - 2, 4, 1, hairDk); p.rect(17, eyeY - 2, 4, 1, hairDk);
  p.rect(16, eyeY + 2, 1, 3, skinDk); p.px(15, eyeY + 4, skinDk);
  p.rect(13, eyeY + 7, 6, 1, mix(skinDk, "#601010", 0.4));
  if (r() > 0.5) p.px(r() > 0.5 ? 13 : 18, eyeY + 7, skinDk);       // krzywy uśmieszek

  // włosy
  if (!bald) {
    p.poly([[8, 14], [9, 9], [12, 6], [20, 6], [23, 9], [24, 14], [22, 11], [10, 11]], hair);
    p.rect(11, 7, 10, 1, mix(hair, "#ffffff", 0.25));
    if (profession === "pirate" && r() > 0.5) p.rect(14, 3, 4, 4, hair);   // irokez
  }

  // dodatki zależne od profesji
  if (profession === "pirate" && r() > 0.35) {
    p.rect(17, eyeY - 1, 4, 3, "#0a0a0a");
    p.line(9, 12, 22, 16, "#0a0a0a");
  }
  if ((profession === "mercenary" || profession === "bounty_hunter") && r() > 0.5) {
    p.rect(11, eyeY - 1, 10, 3, "#1a2a2a");
    p.rect(12, eyeY, 3, 1, profession === "mercenary" ? "#ff3030" : "#40ff80");
    p.rect(17, eyeY, 3, 1, profession === "mercenary" ? "#ff3030" : "#40ff80");
  }
  if (r() > 0.6) {                                                    // zarost
    for (let y = eyeY + 5; y < 26; y++) {
      for (let x = 11; x < 21; x++) if ((x + y) % 2 === 0 && r() > 0.3) p.px(x, y, hairDk);
    }
    p.rect(13, eyeY + 7, 6, 1, "#3a1a14");
  }
  if (r() > 0.8) p.line(20, 19, 22, 23, mix(skin, "#a03030", 0.5));   // blizna
  if (profession === "smuggler" && r() > 0.4) {                      // kaptur
    p.poly([[6, 30], [7, 10], [12, 4], [20, 4], [25, 10], [26, 30], [23, 30], [23, 12], [9, 12], [9, 30]], "#2a1a32");
  }
  if (profession === "trader" && r() > 0.5) {                        // słuchawka
    p.rect(7, 15, 2, 5, "#c0c0c0"); p.line(8, 20, 12, 23, "#c0c0c0");
  }
}
