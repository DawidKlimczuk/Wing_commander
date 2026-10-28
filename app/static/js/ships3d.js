// Płasko cieniowane modele statków + programowy rasteryzator (jak w 1993:
// algorytm malarza, bez Z-bufora, cieniowanie z ditheringiem do palety).
import { BAYER4, rgb, rng, hashString } from "./pixel.js";

const RAMPS = {
  hull:  ["#141722", "#262b3c", "#3e4459", "#5f6782", "#8b93ad", "#c3c9dc", "#eef1f8"],
  tan:   ["#22160e", "#3e2919", "#62422a", "#8a603b", "#b48451", "#dcb37c", "#f6dfb4"],
  olive: ["#161b10", "#262f1b", "#3c4729", "#56643a", "#788752", "#a2b07a", "#d0dbad"],
  blue:  ["#0e1526", "#1a2744", "#283e68", "#3a5b8e", "#5c84b6", "#93b6dc", "#d2e4f6"],
  red:   ["#220606", "#430c0c", "#6c1512", "#99231a", "#c63c28", "#ec7044", "#ffb07a"],
  glass: ["#0a1430", "#14285a", "#1e3c7c", "#2e5aa4", "#4a82cc", "#7eb4ee", "#d0ecff"],
  dark:  ["#0a0b0f", "#13151b", "#1d2028", "#2a2e38", "#3b404c", "#535967", "#727a8a"],
  yellow:["#2a2006", "#4d3a0a", "#7a5c10", "#a88018", "#d4a826", "#f4d050", "#fff09a"],
};
const RAMP_RGB = Object.fromEntries(
  Object.entries(RAMPS).map(([k, v]) => [k, v.map(c => {
    const [r, g, b] = rgb(c);
    return (255 << 24) | (b << 16) | (g << 8) | r;   // little-endian ABGR
  })])
);

// ------------------------------------------------------------------ budowa siatki
class Mesh {
  constructor() { this.faces = []; this.glows = []; }

  // bryła rozpięta między pierścieniami (każdy pierścień = lista punktów [x,y,z])
  loftRings(rings, mat) {
    const pts = rings.flat();
    const center = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0])
      .map(v => v / pts.length);
    const add = face => this.faces.push({ pts: orient(face, center), mat });
    for (let r = 0; r + 1 < rings.length; r++) {
      const A = rings[r], B = rings[r + 1], n = A.length;
      for (let i = 0; i < n; i++) add([A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]]);
    }
    add(rings[0]);
    add(rings[rings.length - 1]);
    return this;
  }

  // kadłub wzdłuż osi Z; sekcje: {z, w, h, y, x, bevel}
  fuselage(sections, mat) {
    return this.loftRings(sections.map(s => ring(s)), mat);
  }

  // skrzydło od nasady (x=root) do końcówki (x=tip), lustrzanie
  wing({ root, tip, rootZ, tipZ, y = 0, tipY = y, t = 0.15, mat, mirror = true }) {
    const make = sgn => [
      [[sgn * root, y - t, rootZ[0]], [sgn * root, y - t, rootZ[1]], [sgn * root, y + t, rootZ[1]], [sgn * root, y + t, rootZ[0]]],
      [[sgn * tip, tipY - t * 0.6, tipZ[0]], [sgn * tip, tipY - t * 0.6, tipZ[1]], [sgn * tip, tipY + t * 0.6, tipZ[1]], [sgn * tip, tipY + t * 0.6, tipZ[0]]],
    ];
    this.loftRings(make(1), mat);
    if (mirror) this.loftRings(make(-1), mat);
    return this;
  }

  // pionowy statecznik
  fin({ x = 0, y0, y1, rootZ, tipZ, t = 0.12, mat, mirror = false }) {
    const make = sgn => [
      [[sgn * x - t, y0, rootZ[0]], [sgn * x - t, y0, rootZ[1]], [sgn * x + t, y0, rootZ[1]], [sgn * x + t, y0, rootZ[0]]],
      [[sgn * x - t * 0.5, y1, tipZ[0]], [sgn * x - t * 0.5, y1, tipZ[1]], [sgn * x + t * 0.5, y1, tipZ[1]], [sgn * x + t * 0.5, y1, tipZ[0]]],
    ];
    this.loftRings(make(1), mat);
    if (mirror) this.loftRings(make(-1), mat);
    return this;
  }

  box(x, y, z, w, h, d, mat, mirror = false) {
    const one = X => this.fuselage([{ x: X, y, z: z - d / 2, w, h }, { x: X, y, z: z + d / 2, w, h }], mat);
    one(x);
    if (mirror) one(-x);
    return this;
  }

  glow(x, y, z, size, color = "#ffb050", mirror = false) {
    this.glows.push({ p: [x, y, z], size, color });
    if (mirror) this.glows.push({ p: [-x, y, z], size, color });
    return this;
  }
}

function ring({ z, w, h, x = 0, y = 0, bevel = 0.3 }) {
  const hw = w / 2, hh = h / 2, c = Math.min(hw, hh) * bevel;
  return [
    [x - hw + c, y - hh, z], [x + hw - c, y - hh, z], [x + hw, y - hh + c, z], [x + hw, y + hh - c, z],
    [x + hw - c, y + hh, z], [x - hw + c, y + hh, z], [x - hw, y + hh - c, z], [x - hw, y - hh + c, z],
  ];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function faceNormal(pts) {
  // metoda Newella - odporna na zdegenerowane wierzchołki (np. czubek nosa)
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(...n);
  return l < 1e-9 ? null : n.map(v => v / l);
}

function orient(face, center) {
  const n = faceNormal(face);
  if (!n) return face;
  const c = face.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map(v => v / face.length);
  return dot(n, sub(c, center)) < 0 ? [...face].reverse() : face;
}

// ------------------------------------------------------------------ modele
const MODELS = {
  tarsus() {
    const m = new Mesh();
    m.fuselage([
      { z: -4.5, w: 2.6, h: 1.7 }, { z: -1, w: 3.0, h: 2.0 }, { z: 2.2, w: 2.4, h: 1.6 },
      { z: 4.2, w: 1.2, h: 0.9, y: -0.1 }, { z: 4.9, w: 0.4, h: 0.3, y: -0.15 },
    ], "tan");
    m.fuselage([{ z: 0.6, w: 1.2, h: 0.5, y: 0.95 }, { z: 2.2, w: 1.0, h: 0.6, y: 0.9 }, { z: 3.0, w: 0.4, h: 0.2, y: 0.7 }], "glass");
    m.wing({ root: 1.3, tip: 2.3, rootZ: [-3.6, -0.6], tipZ: [-3.4, -1.4], y: -0.2, t: 0.18, mat: "dark" });
    m.box(2.7, -0.2, -2.6, 1.1, 1.1, 3.6, "tan", true);
    m.box(2.7, -0.2, -0.6, 0.7, 0.7, 0.6, "dark", true);
    m.fuselage([{ z: -4.9, w: 1.8, h: 1.2 }, { z: -4.4, w: 2.2, h: 1.4 }], "dark");
    m.glow(2.7, -0.2, -4.5, 3, "#ffb050", true);
    m.glow(0, 0, -5.0, 3, "#ffb050");
    return m;
  },
  galaxy() {
    const m = new Mesh();
    m.fuselage([
      { z: -5.5, w: 3.6, h: 2.0 }, { z: -2.5, w: 4.6, h: 2.8, bevel: 0.45 }, { z: 1.5, w: 4.2, h: 2.6, bevel: 0.45 },
      { z: 4.0, w: 2.2, h: 1.6, y: -0.2 }, { z: 5.6, w: 0.9, h: 0.7, y: -0.3 },
    ], "blue");
    m.fuselage([{ z: 2.6, w: 1.6, h: 0.5, y: 1.15 }, { z: 4.0, w: 1.2, h: 0.6, y: 0.8 }, { z: 4.6, w: 0.5, h: 0.2, y: 0.55 }], "glass");
    m.box(0, 1.6, -3.0, 1.2, 0.6, 1.4, "dark");                       // wieżyczka
    m.box(0, 1.65, -2.0, 0.15, 0.15, 1.2, "hull");                   // lufa
    m.box(2.2, -1.2, -1.0, 1.0, 0.8, 4.5, "hull", true);            // zasobniki ładunkowe
    m.fin({ y0: 1.0, y1: 2.6, rootZ: [-5.3, -2.8], tipZ: [-5.6, -4.6], mat: "blue" });
    m.box(1.2, -0.2, -5.8, 1.0, 1.0, 0.8, "dark", true);
    m.glow(1.2, -0.2, -6.25, 3, "#ffb050", true);
    return m;
  },
  orion() {
    const m = new Mesh();
    m.fuselage([
      { z: -4.6, w: 6.2, h: 1.9, bevel: 0.5 }, { z: -1.0, w: 6.0, h: 2.1, bevel: 0.5 }, { z: 2.4, w: 3.6, h: 1.6 },
      { z: 4.6, w: 1.4, h: 0.9 }, { z: 5.4, w: 0.5, h: 0.4 },
    ], "olive");
    m.fuselage([{ z: 1.6, w: 1.4, h: 0.5, y: 1.0 }, { z: 3.0, w: 1.1, h: 0.5, y: 0.75 }, { z: 3.6, w: 0.4, h: 0.2, y: 0.5 }], "glass");
    m.box(2.6, 0, -1.5, 0.9, 2.5, 5.0, "dark", true);                 // płyty pancerza
    m.box(0, 1.35, -2.2, 1.3, 0.6, 1.3, "hull");                     // wieżyczka górna
    m.box(0, -1.35, -2.2, 1.3, 0.6, 1.3, "hull");                    // wieżyczka dolna
    m.box(0.25, 1.4, -1.2, 0.12, 0.12, 1.4, "dark", true);
    m.box(1.4, 0.1, 2.6, 0.2, 0.2, 2.0, "dark", true);               // działa
    m.box(0, 0, -4.9, 2.4, 1.2, 0.6, "dark");
    m.glow(0.8, 0, -5.25, 3, "#ffb050", true);
    m.glow(2.6, 0, -4.1, 2, "#ffb050", true);
    return m;
  },
  centurion() {
    const m = new Mesh();
    m.fuselage([
      { z: -5.0, w: 1.6, h: 1.2 }, { z: -1.0, w: 1.8, h: 1.4 }, { z: 2.6, w: 1.1, h: 0.9 },
      { z: 5.6, w: 0.35, h: 0.3, y: -0.1 }, { z: 6.6, w: 0.05, h: 0.05, y: -0.15 },
    ], "hull");
    m.fuselage([{ z: 0.0, w: 0.8, h: 0.4, y: 0.75 }, { z: 1.8, w: 0.7, h: 0.5, y: 0.7 }, { z: 3.0, w: 0.2, h: 0.1, y: 0.45 }], "glass");
    m.wing({ root: 0.8, tip: 4.6, rootZ: [-4.2, 0.4], tipZ: [-4.6, -3.2], y: -0.1, tipY: -0.3, t: 0.14, mat: "hull" });
    m.wing({ root: 1.5, tip: 4.2, rootZ: [-3.0, -1.6], tipZ: [-4.3, -3.6], y: -0.07, tipY: -0.27, t: 0.16, mat: "red" });
    m.fin({ x: 4.5, y0: -0.3, y1: 1.2, rootZ: [-4.6, -3.0], tipZ: [-4.8, -4.0], mat: "hull", mirror: true });
    m.box(4.6, -0.3, -2.2, 0.18, 0.18, 2.4, "dark", true);          // działa na końcach skrzydeł
    m.box(0.6, -0.1, -5.2, 0.6, 0.6, 0.6, "dark", true);
    m.glow(0.6, -0.1, -5.55, 3, "#7ab8ff", true);
    return m;
  },
};

// Kadłuby dodane przez użytkownika: model generowany z nazwy i parametrów
function proceduralModel(hull) {
  const r = rng(hashString(hull.name));
  const bulk = Math.min(1.8, 0.7 + (hull.cargo || 50) / 150);
  const sleek = Math.min(1.5, (hull.engine?.max_velocity || 300) / 350);
  const len = 4 + sleek * 2;
  const mats = ["hull", "tan", "olive", "blue"];
  const mat = mats[Math.floor(r() * mats.length)];
  const m = new Mesh();
  m.fuselage([
    { z: -len * 0.8, w: 2 * bulk, h: 1.4 * bulk }, { z: -len * 0.2, w: 2.6 * bulk, h: 1.7 * bulk, bevel: r() * 0.5 },
    { z: len * 0.5, w: 1.6 * bulk / sleek, h: 1.1 * bulk }, { z: len, w: 0.3, h: 0.3 },
  ], mat);
  m.fuselage([{ z: 0, w: 0.9, h: 0.4, y: 0.75 * bulk }, { z: len * 0.4, w: 0.7, h: 0.4, y: 0.6 * bulk }, { z: len * 0.6, w: 0.2, h: 0.1, y: 0.4 * bulk }], "glass");
  const span = 1.5 + (hull.slots?.gun || 2) * 0.6 + r() * 1.5;
  m.wing({ root: bulk, tip: span + bulk, rootZ: [-len * 0.6, len * 0.1], tipZ: [-len * 0.7 - r(), -len * 0.4], y: -0.2, t: 0.15, mat: r() > 0.5 ? "red" : "dark" });
  if (r() > 0.4) m.fin({ y0: 0.6 * bulk, y1: 1.6 * bulk + r(), rootZ: [-len * 0.8, -len * 0.4], tipZ: [-len * 0.85, -len * 0.7], mat });
  m.glow(0, 0, -len * 0.8 - 0.3, 3, r() > 0.5 ? "#7ab8ff" : "#ffb050");
  return m;
}

const cache = new Map();
export function shipMesh(hull) {
  const key = hull.name;
  if (!cache.has(key)) {
    const builder = MODELS[key.toLowerCase()];
    cache.set(key, builder ? builder() : proceduralModel(hull));
  }
  return cache.get(key);
}

export function modelRadius(mesh) {
  let r = 0;
  for (const f of mesh.faces) for (const p of f.pts) r = Math.max(r, Math.hypot(...p));
  return r;
}

// ------------------------------------------------------------------ rasteryzator
export class Rasterizer {
  constructor(width, height) {
    this.w = width; this.h = height;
    this.image = new ImageData(width, height);
    this.buf = new Uint32Array(this.image.data.buffer);
  }

  clear(color = 0) { this.buf.fill(color); }

  // wypukły wielokąt, kolor cieniowany: ramp + jasność (0..1) z ditheringiem
  fill(pts, ramp, light) {
    const { w, h, buf } = this;
    const steps = ramp.length - 1;
    const lv = Math.max(0, Math.min(steps, light * steps));
    const lo = Math.floor(lv), frac = lv - lo;
    const cLo = ramp[lo], cHi = ramp[Math.min(steps, lo + 1)];
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    y0 = Math.max(0, Math.ceil(y0 - 0.5)); y1 = Math.min(h - 1, Math.floor(y1 - 0.5));
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      let xa = Infinity, xb = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          const x = a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
          if (x < xa) xa = x;
          if (x > xb) xb = x;
        }
      }
      if (xa === Infinity) continue;
      const from = Math.max(0, Math.round(xa)), to = Math.min(w, Math.round(xb));
      const row = BAYER4[y & 3], off = y * w;
      for (let x = from; x < to; x++) buf[off + x] = row[x & 3] < frac ? cHi : cLo;
    }
  }

  glow(x, y, size, color) {
    const [r, g, b] = rgb(color);
    const core = (255 << 24) | (Math.min(255, b + 120) << 16) | (Math.min(255, g + 120) << 8) | Math.min(255, r + 120);
    const mid = (255 << 24) | (b << 16) | (g << 8) | r;
    for (let j = -size; j <= size; j++) {
      for (let i = -size; i <= size; i++) {
        const d = Math.hypot(i, j) / size, X = Math.round(x + i), Y = Math.round(y + j);
        if (X < 0 || Y < 0 || X >= this.w || Y >= this.h || d > 1) continue;
        if (d < 0.35) this.buf[Y * this.w + X] = core;
        else if (d < 0.7 || BAYER4[Y & 3][X & 3] > d) this.buf[Y * this.w + X] = mid;
      }
    }
  }

  // yaw/pitch/roll w radianach; scale = piksele na jednostkę modelu przy z=dist
  drawMesh(mesh, { yaw = 0, pitch = 0, roll = 0, cx, cy, scale, dist = 22, light = [-0.45, 0.65, -0.6], ambient = 0.18, flame = 1 }) {
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const xf = ([x, y, z]) => {
      // roll (Z), yaw (Y), pitch (X)
      let X = x * cr - y * sr, Y = x * sr + y * cr, Z = z;
      let X2 = X * cyw + Z * syw, Z2 = -X * syw + Z * cyw;
      let Y2 = Y * cp - Z2 * sp, Z3 = Y * sp + Z2 * cp;
      return [X2, Y2, Z3 + dist];
    };
    const f = scale * dist;
    const proj = ([x, y, z]) => [cx + (x * f) / z, cy - (y * f) / z];
    const L = (() => { const l = Math.hypot(...light); return light.map(v => v / l); })();

    const items = [];
    for (const face of mesh.faces) {
      const v = face.pts.map(xf);
      const n = faceNormal(v);
      if (!n) continue;
      const c = v.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map(q => q / v.length);
      if (dot(n, c) >= 0) continue; // ściana tylna
      const lambert = Math.max(0, dot(n, L));
      const spec = Math.pow(Math.max(0, dot(n, [0, 0, -1])), 12) * 0.25;
      items.push({ depth: Math.max(...v.map(p => p[2])) * 0.3 + c[2] * 0.7, pts: v.map(proj), ramp: RAMP_RGB[face.mat], light: ambient + (1 - ambient) * lambert + spec });
    }
    for (const g of mesh.glows) {
      const p = xf(g.p);
      items.push({ depth: p[2] - 0.4, glow: g, at: proj(p), size: Math.max(1, Math.round(g.size * scale / 6 * flame)) });
    }
    items.sort((a, b) => b.depth - a.depth);
    for (const it of items) {
      if (it.glow) this.glow(it.at[0], it.at[1], it.size, it.glow.color);
      else this.fill(it.pts, it.ramp, it.light);
    }
  }

  blit(ctx, x = 0, y = 0) { ctx.putImageData(this.image, x, y); }
}

export const PALETTE = RAMPS;
