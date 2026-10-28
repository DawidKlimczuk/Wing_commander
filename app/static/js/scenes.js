// Sceny "kinowe": boot DOS-a, intro z gwiazdami, start z lądowiska.
import { Pix, rng } from "./pixel.js";
import { Rasterizer, shipMesh, modelRadius } from "./ships3d.js";
import { PAD } from "./concourse.js";
import { sound } from "./audio.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ BOOT
export async function runBoot(el, statsPromise) {
  const lines = [
    ["Phoenix BIOS 4.0 Release 6.0", 30],
    ["Copyright 1985-1993 Phoenix Technologies Ltd.", 30],
    ["Licensed to: <hl>DAWID KLIMCZUK</hl>", 60],
    ["", 120],
    ["CPU = Intel 80486DX2-66", 60],
    ["Memory Test: <MEM>", 0],
    ["", 80],
    ["Detecting IDE drives ... Primary Master: 340MB", 300],
    ["", 50],
    ["Starting MS-DOS...", 500],
    ["", 50],
    ["HIMEM is testing extended memory...<ok>done.</ok>", 200],
    ["EMM386 4.45  [ 3072K EMS ]", 120],
    ["Sound Blaster Pro detected at <hl>A220 I5 D1</hl>", 200],
    ["", 50],
    ["C:\\>CD GEMINI", 250],
    ["C:\\GEMINI>SHIPYARD.EXE", 400],
    ["", 50],
    ["Gemini Sector Navigation &amp; Trade System  v1.0", 80],
    ["(C) 2669 Dawid Klimczuk. All rights reserved.", 80],
    ["Connecting to shipyard database (SQLAlchemy/SQLite) ...", 400],
    ["<STATS>", 0],
    ["", 60],
    ["<hl>Ready.</hl>", 300],
  ];
  el.innerHTML = "";
  const add = html => { el.innerHTML += html + "\n"; };
  for (const [text, delay] of lines) {
    if (text === "Memory Test: <MEM>") {
      const span = document.createElement("span");
      el.append("Memory Test: ", span, "\n");
      for (let k = 0; k <= 8192; k += 256) {
        span.textContent = `${k}K`;
        sound.type();
        await sleep(18);
      }
      span.innerHTML = "8192K <span class='ok'>OK</span>";
      continue;
    }
    if (text === "<STATS>") {
      try {
        const s = await statsPromise;
        add(`  ${s.hulls} hull types, ${s.weapons} weapon systems, ${s.clients} registered pilots, ${s.transactions} transactions <span class="ok">OK</span>`);
      } catch {
        add(`  <span style="color:#ff5555">DATABASE OFFLINE - check Flask server</span>`);
      }
      continue;
    }
    add(text.replace("<ok>", "<span class='ok'>").replace("</ok>", "</span>")
      .replace("<hl>", "<span class='hl'>").replace("</hl>", "</span>"));
    if (text) sound.type();
    await sleep(delay);
  }
  el.classList.add("cursor-blink");
}

// ------------------------------------------------------------------ GWIAZDY
export class Starfield {
  constructor(n = 220, seed = 7) {
    const r = rng(seed);
    this.stars = Array.from({ length: n }, () => ({ x: (r() - 0.5) * 2, y: (r() - 0.5) * 2, z: r() }));
  }

  // speed: 0 = statyczne, >0 = lot do przodu; streak = smugi (warp)
  draw(p, speed, streak = 0) {
    for (const s of this.stars) {
      const pz = s.z;
      s.z -= speed;
      if (s.z <= 0.02) { s.z += 1; s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; continue; }
      const sx = 160 + (s.x / s.z) * 160, sy = 100 + (s.y / s.z) * 100;
      if (sx < 0 || sx >= 320 || sy < 0 || sy >= 200) continue;
      const b = 1 - s.z;
      const c = b > 0.75 ? "#ffffff" : b > 0.45 ? "#a8b4d8" : "#4a5280";
      if (streak > 0) {
        const ox = 160 + (s.x / (pz + streak)) * 160, oy = 100 + (s.y / (pz + streak)) * 100;
        p.line(ox, oy, sx, sy, c);
      } else {
        p.px(sx, sy, c);
      }
    }
  }
}

// ------------------------------------------------------------------ INTRO
export class Intro {
  constructor(canvas) {
    this.ctx = canvas.getContext("2d");
    this.p = new Pix(this.ctx);
    this.stars = new Starfield(260, 11);
    this.r = new Rasterizer(320, 200);
    this.t = 0;
  }

  start() {
    const loop = () => {
      this.t++;
      this.r.clear(0xff000000);
      this.r.blit(this.ctx);
      this.stars.draw(this.p, 0.0025);
      // Centurion przelatujący pod tytułem
      const k = (this.t % 900) / 900;
      const img = this.ctx.getImageData(0, 0, 320, 200);
      this.r.buf.set(new Uint32Array(img.data.buffer));
      this.r.drawMesh(shipMesh({ name: "Centurion" }), {
        cx: -60 + k * 440, cy: 150 - k * 30, scale: 3.2,
        yaw: -1.2 + k * 0.5, pitch: 0.35, roll: -0.25, flame: 1 + Math.sin(this.t * 0.6) * 0.2,
      });
      this.r.blit(this.ctx);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() { cancelAnimationFrame(this.raf); }
}

// ------------------------------------------------------------------ START Z LĄDOWISKA
export function runLaunch(canvas, commEl, backdrop, hull) {
  const ctx = canvas.getContext("2d");
  const p = new Pix(ctx);
  const r = new Rasterizer(320, 200);
  const mesh = shipMesh(hull);
  const padScale = 22 / modelRadius(mesh);
  const stars = new Starfield(240, 3);
  const comms = [
    [0, "Wieża New Detroit: zezwolenie na start udzielone."],
    [2600, "Autopilot: kurs na Nav Point 1."],
    [4300, "Komunikat: Retros w sektorze. Zachowaj ostrożność, pilocie."],
    [6400, "Wieża New Detroit: zezwolenie na lądowanie. Witamy z powrotem."],
  ];
  const T_LIFT = 2600, T_SPACE = 6400, T_END = 8200;
  let skip = false, landed = false, t0 = performance.now(), last = -1;

  sound.launch();
  return new Promise(resolve => {
    const onSkip = () => { skip = true; };
    canvas.addEventListener("click", onSkip, { once: true });
    window.addEventListener("keydown", onSkip, { once: true });

    const frame = now => {
      const t = now - t0;
      const msg = comms.filter(([at]) => t >= at).pop();
      if (msg && msg[0] !== last) { last = msg[0]; commEl.textContent = msg[1]; sound.beep(); }

      if (t < T_LIFT) {
        const k = t / T_LIFT, ease = k * k;
        const shake = k > 0.15 ? (Math.random() - 0.5) * 2 * (1 - k) : 0;
        ctx.drawImage(backdrop, shake, shake);
        const c = ctx.getImageData(0, 0, 320, 200);
        r.buf.set(new Uint32Array(c.data.buffer));
        r.drawMesh(mesh, {
          cx: PAD.x, cy: PAD.y - 12 - ease * 150, scale: padScale + ease * 10,
          yaw: 1.95 + ease * 1.2, pitch: 0.34 - ease * 0.6, flame: 1 + k * 2,
        });
        r.blit(ctx);
        // kurz z lądowiska
        if (k < 0.5) {
          const dust = rng(Math.floor(t / 50));
          for (let i = 0; i < 60 * (1 - k * 2); i++) {
            const a = dust() * Math.PI, d = dust() * 50 * k * 2 + 10;
            p.px(PAD.x + Math.cos(a) * d * (dust() > 0.5 ? 1 : -1), PAD.y + 8 - Math.sin(a) * d * 0.15, "#8a7a6a");
          }
        }
      } else if (t < T_SPACE) {
        const k = (t - T_LIFT) / (T_SPACE - T_LIFT);
        const warp = k > 0.55 ? (k - 0.55) / 0.45 : 0;
        r.clear(0xff050208);
        r.blit(ctx);
        stars.draw(p, 0.004 + warp * 0.05, warp * 0.25);
        const c = ctx.getImageData(0, 0, 320, 200);
        r.buf.set(new Uint32Array(c.data.buffer));
        r.drawMesh(mesh, {
          cx: 160 + Math.sin(t / 500) * 8, cy: 118 + Math.cos(t / 700) * 4, scale: 8 - warp * 5,
          yaw: Math.PI + Math.sin(t / 900) * 0.25, pitch: 0.25, roll: Math.sin(t / 600) * 0.3,
          flame: 1.5 + warp * 2 + Math.random() * 0.3,
        });
        r.blit(ctx);
        if (warp > 0.85) {
          ctx.fillStyle = `rgba(255,255,255,${(warp - 0.85) / 0.15})`;
          ctx.fillRect(0, 0, 320, 200);
        }
      } else {
        const k = (t - T_SPACE) / (T_END - T_SPACE);
        if (!landed) { landed = true; sound.land(); }
        ctx.drawImage(backdrop, 0, 0);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - k * 2.5)})`;
        ctx.fillRect(0, 0, 320, 200);
      }

      if (t >= T_END || skip) {
        canvas.removeEventListener("click", onSkip);
        window.removeEventListener("keydown", onSkip);
        commEl.textContent = "";
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
