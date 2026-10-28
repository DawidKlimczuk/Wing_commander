// Concourse bazy New Detroit - malowany proceduralnie w 320x200, z hotspotami.
import { Pix, rng, mix, textWidth } from "./pixel.js";
import { Rasterizer, shipMesh } from "./ships3d.js";

export const W = 320, H = 200, HORIZON = 100;
export const PAD = { x: 176, y: 116 };

export const HOTSPOTS = [
  { id: "computer", rect: [104, 145, 42, 54], label: "Mission Computer", sub: "statystyki · rejestr transakcji" },
  { id: "dealer", rect: [0, 36, 99, 116], label: "Ship Dealer", sub: "salon statków · zakup i konfiguracja" },
  { id: "bar", rect: [92, 78, 46, 64], label: "Bar", sub: "rejestr klientów" },
  { id: "launch", rect: [138, 94, 76, 38], label: "Launch", sub: "start z lądowiska" },
  { id: "guild", rect: [212, 12, 42, 130], label: "Merchants' Guild", sub: "terminal API" },
  { id: "exchange", rect: [252, 40, 68, 112], label: "Commodity Exchange", sub: "oferta magazynowa · dostawy" },
];

const SKY = ["#07041a", "#120a30", "#22104a", "#3a1858", "#5c2160", "#83305c", "#ab4350", "#cf6240", "#ee9446"];

// sprite statku 3D renderowany do przezroczystego canvasu
export function shipSprite(hull, w, h, opts) {
  const r = new Rasterizer(w, h);
  r.clear(0);
  r.drawMesh(shipMesh(hull), { cx: w / 2, cy: h / 2, ...opts });
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  r.blit(c.getContext("2d"));
  return c;
}

function drawSky(p, rand) {
  p.vgrad(0, 0, W, HORIZON, SKY);
  for (let i = 0; i < 90; i++) {
    const y = Math.floor(rand() * rand() * 64);
    p.px(Math.floor(rand() * W), y, rand() > 0.7 ? "#ffffff" : rand() > 0.5 ? "#9fb0d8" : "#5f6a98");
  }
  // gazowy olbrzym z pierścieniem
  const cx = 176, cy = 34, R = 20;
  const bands = ["#6a3f8f", "#8a5aa8", "#5a3a7e", "#a07ab8", "#7a4c96", "#5e3c84", "#9068ac"];
  const ringPx = (back) => {
    for (let a = 0; a < Math.PI * 2; a += 0.004) {
      const x = cx + Math.cos(a) * 34, y = cy + Math.sin(a) * 6 - Math.cos(a) * 3;
      const behind = Math.sin(a) < 0;
      if (behind !== back) continue;
      if (back && Math.hypot(x - cx, y - cy) < R) continue;
      p.px(x, y, Math.cos(a) < -0.2 ? "#c9a8e0" : "#8f72aa");
    }
  };
  ringPx(true);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, y);
      if (d > R) continue;
      const bi = Math.floor(((y + R) / (2 * R)) * bands.length + Math.sin(x * 0.3) * 0.4);
      const band = bands[Math.max(0, Math.min(bands.length - 1, bi))];
      const shade = (x + y * 0.4) / R;                        // światło od lewej-góry
      const X = cx + x, Y = cy + y;
      let col = band;
      if (shade > 0.15) col = mix(band, "#120a30", Math.min(0.85, (shade - 0.15) * 1.4));
      if (d > R - 1.2) col = mix(col, "#ffd0a0", shade < 0 ? 0.35 : 0);
      p.px(X, Y, col);
    }
  }
  ringPx(false);
}

function drawSkyline(p, rand, antennas) {
  let x = 0;
  while (x < W) {
    const w = 4 + Math.floor(rand() * 12), h = 6 + Math.floor(rand() * rand() * 30);
    const top = HORIZON - h;
    p.rect(x, top, w, h, rand() > 0.5 ? "#1e0f2a" : "#261433");
    p.rect(x, top, w, 1, "#3a1c44");
    for (let wy = top + 2; wy < HORIZON - 1; wy += 3) {
      for (let wx = x + 1; wx < x + w - 1; wx += 2) {
        if (rand() < 0.16) p.px(wx, wy, rand() > 0.3 ? "#f7c35a" : "#ff8a4a");
      }
    }
    if (h > 22 && rand() > 0.4) {
      p.line(x + (w >> 1), top, x + (w >> 1), top - 5, "#2d1638");
      antennas.push([x + (w >> 1), top - 6]);
    }
    x += w + (rand() > 0.7 ? 1 : 0);
  }
  // mgła nad horyzontem
  for (let y = 0; y < 6; y++) {
    const t = (y + 1) / 10;
    for (let x2 = 0; x2 < W; x2++) {
      if ((x2 + y * 2) % Math.max(2, 8 - y) === 0) p.px(x2, HORIZON - 6 + y, mix("#2a1534", "#cf6240", t));
    }
  }
}

function drawGround(p) {
  p.vgrad(0, HORIZON, W, H - HORIZON, ["#1a1c28", "#232634", "#2d3142", "#363b4e"]);
  const vx = 176;
  for (let x = -600; x <= 900; x += 36) p.line(vx + (x - vx) * 0.12, HORIZON + 4, x, H, "#2b2f40");
  for (let k = 1; k < 12; k++) {
    const y = Math.round(HORIZON + 100 * (1 - 1 / (1 + k * k * 0.06)));
    p.rect(0, y, W, 1, "#2f3446");
  }
}

function drawDealer(p, insideShip) {
  // ściana boczna (widoczna w perspektywie)
  p.poly([[92, 62], [100, 67], [100, 146], [92, 152]], "#232838");
  p.vgrad(0, 62, 92, 90, ["#4a5269", "#3c4358", "#2e3446"]);
  const arch = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    arch.push([46 - 48 * Math.cos(a), 62 - 24 * Math.sin(a)]);
  }
  p.poly(arch, "#5a6480");
  for (let x = 6; x < 92; x += 8) {
    const t = (x - 46) / 48, top = 62 - 24 * Math.sqrt(Math.max(0, 1 - t * t));
    p.line(x, top + 1, x, 61, "#4b546d");
  }
  for (let i = 0; i < arch.length - 1; i++) p.line(arch[i][0], arch[i][1], arch[i + 1][0], arch[i + 1][1], "#97a1bb");
  p.rect(0, 61, 92, 2, "#262b3a");
  // otwór hangaru
  p.rect(14, 82, 66, 70, "#0a0c12");
  p.vgrad(16, 98, 62, 54, ["#0d1018", "#1a1f2c", "#2a3144"]);
  for (let x = 18; x < 78; x += 10) p.rect(x, 99, 4, 1, "#ffe9b0");
  p.dither(16, 100, 62, 50, "#1a1f2c", "#3a4258", 0.25);
  p.ctx.drawImage(insideShip, 47 - insideShip.width / 2, 102);
  // roleta drzwi - podniesiona do 1/4
  for (let y = 82; y < 98; y++) p.rect(14, y, 66, 1, y % 2 ? "#3a4154" : "#2a3040");
  p.rect(14, 97, 66, 1, "#11141c");
  // pasy ostrzegawcze
  for (let x = 14; x < 80; x++) p.px(x, 150, ((x >> 2) & 1) ? "#e8c020" : "#141414");
  for (let x = 14; x < 80; x++) p.px(x, 151, (((x + 2) >> 2) & 1) ? "#e8c020" : "#141414");
  // tablica szyldu
  p.rect(12, 66, 70, 11, "#0b0d14");
  p.rect(12, 66, 70, 1, "#6e7894");
  p.line(70, 38, 70, 26, "#59627a");
}

function drawBar(p) {
  p.poly([[136, 86], [140, 89], [140, 138], [136, 140]], "#24151e");
  p.vgrad(94, 86, 42, 54, ["#3e2836", "#2f1d29", "#26171f"]);
  p.rect(92, 82, 46, 5, "#563447");
  p.rect(92, 82, 46, 1, "#80566c");
  // okna i drzwi z ciepłym światłem
  p.vgrad(97, 100, 9, 10, ["#ffb35a", "#c9602a"]);
  p.vgrad(124, 100, 9, 10, ["#ffb35a", "#c9602a"]);
  p.rect(101, 100, 1, 10, "#3e2836"); p.rect(128, 100, 1, 10, "#3e2836");
  p.vgrad(108, 114, 14, 26, ["#ffd28a", "#ff9a48", "#c9602a"]);
  p.rect(112, 120, 3, 12, "#2a1418");                     // sylwetka w drzwiach
  p.rect(112, 118, 3, 2, "#2a1418");
  // poświata na ziemi
  for (let y = 140; y < 152; y++) {
    const spread = (y - 140) * 1.2;
    for (let x = Math.floor(106 - spread); x < 124 + spread; x++) {
      if (((x + y) & 1) === 0 && (y - 140) < 10) p.px(x, y, "#5a3a32");
    }
  }
  p.rect(96, 88, 38, 9, "#120a10");
}

function drawGuild(p, rand) {
  p.poly([[214, 33], [218, 30], [218, 142], [214, 139]], "#1c2232");
  p.vgrad(218, 30, 32, 112, ["#40506e", "#2e384f", "#20283a"]);
  p.poly([[214, 30], [252, 30], [244, 21], [222, 21]], "#56688c");
  p.line(222, 21, 244, 21, "#8fa4c8");
  p.line(233, 21, 233, 12, "#59627a");
  for (let y = 46; y < 134; y += 5) {
    for (let x = 221; x < 247; x += 3) {
      p.rect(x, y, 2, 2, rand() > 0.45 ? "#9fd8ff" : "#24324c");
    }
  }
  p.rect(220, 34, 28, 9, "#0b0d14");
  p.rect(226, 128, 12, 14, "#0b0e16");
  p.rect(227, 129, 10, 13, "#2b4a70");
}

function drawExchange(p) {
  p.poly([[252, 66], [256, 62], [256, 150], [252, 147]], "#1e212c");
  p.vgrad(256, 62, 64, 88, ["#4d5262", "#3a3e4c", "#2b2e3a"]);
  // kopuła
  for (let y = -18; y <= 0; y++) {
    const w = Math.round(Math.sqrt(18 * 18 - y * y));
    for (let x = -w; x <= w; x++) {
      const shade = (x + y) / 18;
      p.px(288 + x, 62 + y, shade < -0.5 ? "#8fb0bc" : shade < 0 ? "#5f7c88" : shade < 0.5 ? "#475f6a" : "#34474f");
    }
  }
  p.rect(256, 61, 64, 2, "#6c7184");
  p.rect(260, 66, 56, 9, "#0b0d14");
  // ekran z notowaniami
  p.rect(260, 78, 56, 16, "#111");
  p.rect(262, 80, 52, 12, "#021006");
  // wejście
  p.rect(274, 116, 28, 34, "#0b0e14");
  for (let x = 276; x < 300; x += 4) p.rect(x, 118, 2, 32, "#173a20");
  p.rect(270, 114, 36, 2, "#6c7184");
  for (let y = 100; y < 112; y += 4) for (let x = 260; x < 318; x += 6) p.rect(x, y, 4, 2, "#7a6a3a");
}

function drawPad(p) {
  p.rect(166, 124, 20, 14, "#1a1d29");
  p.rect(166, 124, 20, 1, "#2c3142");
  const ring = [[148, 106], [204, 106], [213, 111], [213, 118], [204, 124], [148, 124], [139, 118], [139, 111]];
  p.poly(ring.map(([x, y]) => [x, y + 3]), "#2a2e3c");
  p.poly(ring, "#4d5367");
  p.poly([[153, 108], [199, 108], [206, 112], [206, 117], [199, 121], [153, 121], [146, 117], [146, 112]], "#3d4254");
  // okrąg i H
  for (let a = 0; a < Math.PI * 2; a += 0.05) p.px(176 + Math.cos(a) * 18, 114.5 + Math.sin(a) * 4.5, "#c9a520");
  for (let x = 148; x < 205; x++) p.px(x, 125, ((x >> 1) & 1) ? "#e8c020" : "#141414");
  for (let x = 148; x < 205; x++) p.px(x, 126, (((x + 1) >> 1) & 1) ? "#e8c020" : "#141414");
}

function drawKiosk(p) {
  p.rect(120, 172, 12, 27, "#353c50");
  p.rect(120, 172, 1, 27, "#6c7894");
  p.rect(116, 196, 20, 4, "#232838");
  p.poly([[109, 147], [143, 147], [146, 173], [106, 173]], "#4a5370");
  p.line(109, 147, 143, 147, "#9aa6c4");
  p.poly([[112, 150], [140, 150], [142, 169], [110, 169]], "#041a0b");
  p.rect(108, 173, 36, 2, "#2a3044");
}

export class Concourse {
  constructor(canvas, { onHover, onSelect, getTicker }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.p = new Pix(this.ctx);
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.getTicker = getTicker;
    this.hover = null;
    this.frame = 0;
    this.shipOnPad = true;
    this.antennas = [];
    this.walkers = [];
    this.traffic = null;
    this.buildLayers();
    this.bindMouse();
  }

  buildLayers() {
    const rand = rng(2669);
    const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
    this.bg = mk();
    const p = new Pix(this.bg.getContext("2d"));
    drawSky(p, rand);
    drawSkyline(p, rand, this.antennas);
    drawGround(p);
    drawPad(p);
    const inside = shipSprite({ name: "Centurion" }, 70, 44, { yaw: Math.PI + 0.55, pitch: 0.3, scale: 4.6, ambient: 0.4 });
    drawDealer(p, inside);
    drawBar(p);
    drawGuild(p, rand);
    drawExchange(p);

    this.padShip = shipSprite({ name: "Tarsus" }, 72, 40, { yaw: 1.95, pitch: 0.34, scale: 4.2 });

    this.fg = mk();
    drawKiosk(new Pix(this.fg.getContext("2d")));

    for (let i = 0; i < 5; i++) {
      this.walkers.push({
        x: rand() * W, y: 154 + Math.floor(rand() * 36), v: (rand() > 0.5 ? 1 : -1) * (0.15 + rand() * 0.35),
        c: ["#c96a2a", "#4f7fc8", "#8a8a8a", "#7aa04a", "#b04a6a"][i],
      });
    }
  }

  bindMouse() {
    const pos = e => {
      const r = this.canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    };
    const hit = ([x, y]) => HOTSPOTS.find(h => {
      const [hx, hy, hw, hh] = h.rect;
      return x >= hx && x < hx + hw && y >= hy && y < hy + hh;
    }) || null;
    this.canvas.addEventListener("mousemove", e => {
      const h = hit(pos(e));
      if (h !== this.hover) { this.hover = h; this.onHover(h); }
    });
    this.canvas.addEventListener("mouseleave", () => { this.hover = null; this.onHover(null); });
    this.canvas.addEventListener("click", e => { const h = hit(pos(e)); if (h) this.onSelect(h); });
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.draw(), 1000 / 20);
    this.draw();
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  draw() {
    const f = ++this.frame, p = this.p, ctx = this.ctx;
    ctx.drawImage(this.bg, 0, 0);

    // migające gwiazdy i światła anten
    const tw = rng(Math.floor(f / 6));
    for (let i = 0; i < 6; i++) p.px(Math.floor(tw() * W), Math.floor(tw() * 50), "#ffffff");
    this.antennas.forEach(([x, y], i) => { if ((f + i * 7) % 30 < 12) p.px(x, y, "#ff3030"); });

    // ruch na niebie
    if (!this.traffic && f % 120 === 0) {
      const dir = Math.random() > 0.5 ? 1 : -1;
      this.traffic = { x: dir > 0 ? -6 : W + 6, y: 8 + Math.random() * 50, v: dir * (0.8 + Math.random()) };
    }
    if (this.traffic) {
      const t = this.traffic;
      t.x += t.v;
      p.rect(t.x, t.y, 3, 1, "#c8d0e8");
      p.px(t.x + (t.v > 0 ? -1 : 3), t.y, f % 2 ? "#ffd070" : "#ff8040");
      if (t.x < -10 || t.x > W + 10) this.traffic = null;
    }

    // neony (z okazjonalnym mrugnięciem)
    const flick = n => (f + n) % 97 < 3;
    p.text("SHIP DEALER", 47 - (textWidth("SHIP DEALER") >> 1), 69, flick(0) ? "#1a4a50" : "#5ff0ff", "#0b3036");
    p.text("BAR", 115 - (textWidth("BAR") >> 1), 90, flick(31) ? "#4a1040" : "#ff4fd8", "#3a0a30");
    p.text("GUILD", 234 - (textWidth("GUILD") >> 1), 36, "#ffb43c", "#3a2808");
    p.text("EXCHANGE", 288 - (textWidth("EXCHANGE") >> 1), 68, flick(55) ? "#1e5020" : "#7dff6a", "#103a14");
    if ((f >> 3) % 2) p.px(70, 25, "#ff3030");
    if ((f >> 4) % 2) p.px(233, 11, "#ff3030");

    // notowania na ekranie giełdy
    const ticker = this.getTicker();
    ctx.save();
    ctx.beginPath(); ctx.rect(262, 80, 52, 12); ctx.clip();
    const tw2 = textWidth(ticker) + 40, off = (f * 0.7) % tw2;
    p.text(ticker, 314 - off, 82, "#7dff6a");
    p.text(ticker, 314 - off + tw2, 82, "#7dff6a");
    ctx.restore();

    // lądowisko: światła i statek
    const corners = [[139, 111], [213, 111], [148, 124], [204, 124], [148, 106], [204, 106]];
    corners.forEach(([x, y], i) => { if ((f >> 2) % corners.length === i) p.px(x, y, "#ffef80"); else p.px(x, y, "#806a20"); });
    if (this.shipOnPad) ctx.drawImage(this.padShip, PAD.x - 36, PAD.y - 26);

    // światła ścieżki - "biegnący" sygnał w stronę lądowiska
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const x = Math.round(176 + side * (54 - 34 * t)), y = Math.round(199 - 69 * t);
        p.px(x, y, (f >> 1) % 9 === 8 - i ? "#9fffb0" : "#2e6a3a");
      }
    }

    // przechodnie
    for (const w of this.walkers) {
      w.x += w.v;
      if (w.x < -4) w.x = W + 2; else if (w.x > W + 4) w.x = -2;
      const step = (Math.floor(w.x * 2) & 1);
      p.rect(w.x, w.y - 6, 2, 1, "#d8a888");
      p.rect(w.x, w.y - 5, 2, 3, w.c);
      p.px(w.x + step, w.y - 2, "#1a1a22");
      p.px(w.x + 1 - step, w.y - 1, "#1a1a22");
    }

    ctx.drawImage(this.fg, 0, 0);
    // ekran kiosku
    for (let i = 0; i < 5; i++) {
      const len = 4 + ((f >> 2) * 7 + i * 13) % 16;
      p.rect(114, 152 + i * 3, len, 1, i === ((f >> 3) % 5) ? "#9fffb0" : "#2ea84a");
    }
    if ((f >> 3) % 2) p.rect(114 + 2, 167, 2, 1, "#9fffb0");

    // nawiasy celownicze wokół wskazanego miejsca
    if (this.hover) {
      const [x, y, w, h] = this.hover.rect, c = (f >> 2) % 2 ? "#46ff6e" : "#9fffb0", L = 5;
      const x1 = x + w - 1, y1 = y + h - 1;
      p.rect(x, y, L, 1, c); p.rect(x, y, 1, L, c);
      p.rect(x1 - L + 1, y, L, 1, c); p.rect(x1, y, 1, L, c);
      p.rect(x, y1, L, 1, c); p.rect(x, y1 - L + 1, 1, L, c);
      p.rect(x1 - L + 1, y1, L, 1, c); p.rect(x1, y1 - L + 1, 1, L, c);
    }
  }

  snapshot() {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    c.getContext("2d").drawImage(this.canvas, 0, 0);
    return c;
  }
}
