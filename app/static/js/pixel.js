// Prymitywy "VGA": dithering Bayera, wypełnianie wielokątów co do piksela,
// czcionka 3x5 - wszystko rysowane fillRectem, bez antyaliasingu.

export const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map(r => r.map(v => (v + 0.5) / 16));

export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hex([r, g, b]) {
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return hex(A.map((v, i) => Math.round(v + (B[i] - v) * t)));
}

// Deterministyczny generator liczb pseudolosowych (mulberry32)
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

export class Pix {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
  }

  px(x, y, c) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x | 0, y | 0, 1, 1);
  }

  rect(x, y, w, h, c) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  }

  // prostokąt wypełniony mieszanką dwóch kolorów (t = udział koloru b)
  dither(x, y, w, h, a, b, t) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const X = x + i, Y = y + j;
        this.px(X, Y, BAYER4[Y & 3][X & 3] < t ? b : a);
      }
    }
  }

  // pionowy gradient przez listę kolorów, z ditheringiem między nimi
  vgrad(x, y, w, h, colors) {
    const n = colors.length - 1;
    for (let j = 0; j < h; j++) {
      const f = (j / Math.max(1, h - 1)) * n;
      const i = Math.min(n - 1, Math.floor(f));
      const t = f - i;
      for (let k = 0; k < w; k++) {
        const X = x + k, Y = y + j;
        this.px(X, Y, BAYER4[Y & 3][X & 3] < t ? colors[i + 1] : colors[i]);
      }
    }
  }

  // wypukły lub wklęsły wielokąt - scanline, reguła even-odd
  poly(points, c) {
    const ys = points.map(p => p[1]);
    const y0 = Math.max(0, Math.ceil(Math.min(...ys))), y1 = Math.floor(Math.max(...ys));
    this.ctx.fillStyle = c;
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5, xs = [];
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
          xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
        if (xb > xa) this.ctx.fillRect(xa, y, xb - xa, 1);
      }
    }
  }

  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    this.ctx.fillStyle = c;
    for (;;) {
      this.ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  circle(cx, cy, r, c) {
    this.ctx.fillStyle = c;
    for (let y = -r; y <= r; y++) {
      const w = Math.round(Math.sqrt(r * r - y * y));
      this.ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }

  text(str, x, y, c, shadow) {
    if (shadow) this.text(str, x + 1, y + 1, shadow);
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = FONT[ch];
      if (g) {
        for (let i = 0; i < 15; i++) {
          if (g & (1 << (14 - i))) this.px(cx + (i % 3), y + ((i / 3) | 0), c);
        }
      }
      cx += 4;
    }
    return cx - x;
  }
}

export function textWidth(str) {
  return str.length * 4 - 1;
}

// Czcionka 3x5, każdy znak to 15 bitów (wiersz po wierszu)
const G = s => parseInt(s.replace(/ /g, ""), 2);
const FONT = {
  A: G("010 101 111 101 101"), B: G("110 101 110 101 110"), C: G("011 100 100 100 011"),
  D: G("110 101 101 101 110"), E: G("111 100 110 100 111"), F: G("111 100 110 100 100"),
  G: G("011 100 101 101 011"), H: G("101 101 111 101 101"), I: G("111 010 010 010 111"),
  J: G("001 001 001 101 010"), K: G("101 101 110 101 101"), L: G("100 100 100 100 111"),
  M: G("101 111 111 101 101"), N: G("110 101 101 101 101"), O: G("010 101 101 101 010"),
  P: G("110 101 110 100 100"), Q: G("010 101 101 110 011"), R: G("110 101 110 101 101"),
  S: G("011 100 010 001 110"), T: G("111 010 010 010 010"), U: G("101 101 101 101 111"),
  V: G("101 101 101 101 010"), W: G("101 101 111 111 101"), X: G("101 101 010 101 101"),
  Y: G("101 101 010 010 010"), Z: G("111 001 010 100 111"),
  0: G("111 101 101 101 111"), 1: G("010 110 010 010 111"), 2: G("110 001 010 100 111"),
  3: G("110 001 010 001 110"), 4: G("101 101 111 001 001"), 5: G("111 100 110 001 110"),
  6: G("011 100 111 101 111"), 7: G("111 001 010 010 010"), 8: G("111 101 111 101 111"),
  9: G("111 101 111 001 110"), ".": G("000 000 000 000 010"), ":": G("000 010 000 010 000"),
  "-": G("000 000 111 000 000"), "'": G("010 010 000 000 000"), "/": G("001 001 010 100 100"),
  " ": 0, "+": G("000 010 111 010 000"),
};
