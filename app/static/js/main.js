import { api, request, ApiError } from "./api.js";
import { sound } from "./audio.js";
import { Concourse, shipSprite } from "./concourse.js";
import { Pix, rng, mix } from "./pixel.js";
import { drawPortrait } from "./portraits.js";
import { Rasterizer, shipMesh, modelRadius } from "./ships3d.js";
import { runBoot, Intro, runLaunch } from "./scenes.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* brak storage */ } },
};

const PROF = { trader: "Handlarz", pirate: "Pirat", mercenary: "Najemnik", bounty_hunter: "Łowca nagród", smuggler: "Przemytnik" };
const MOUNT = { gun: "DZIAŁO", turret: "WIEŻA", missile: "RAKIETY" };

const state = {
  hulls: [], weapons: [], clients: [],
  clientId: Number(store.get("gemini.client")) || null,
  hullId: null,
  slots: {},          // "gun-0" -> weapon_id
  cart: [],
  exTab: "hulls",
  scene: "boot",
};

// ====================================================================== SKALOWANIE
function fit() {
  const s = Math.min(innerWidth / 1280, (innerHeight - 22) / 800);
  $("#screen").style.transform = `translate(-50%, calc(-50% - 9px)) scale(${s})`;
}
addEventListener("resize", fit);
fit();

// ====================================================================== DANE
async function refresh() {
  const [hulls, weapons, clients] = await Promise.all([api.hulls(), api.weapons(), api.clients()]);
  Object.assign(state, { hulls, weapons, clients });
  if (!clients.some(c => c.id === state.clientId)) state.clientId = clients[0]?.id ?? null;
  updateHud();
}

const currentClient = () => state.clients.find(c => c.id === state.clientId) || null;

function setClient(id) {
  state.clientId = id;
  store.set("gemini.client", String(id));
  updateHud();
  updatePadShip();
}

function updateHud() {
  const c = currentClient();
  $("#hud-pilot").textContent = c ? c.name : "—";
  $("#hud-credits").textContent = c ? fmt(c.credits) : "0";
}

// ====================================================================== SCENY
const concourse = new Concourse($("#concourse-canvas"), {
  onHover(h) {
    $("#hotspot-label").innerHTML = h ? `${esc(h.label)}<small>${esc(h.sub)}</small>` : "";
    if (h) sound.hover();
  },
  onSelect(h) {
    sound.click();
    if (h.id === "launch") return launch();
    if (h.id === "guild") return go("computer", { view: "term" });
    if (h.id === "computer") return go("computer", { view: "stats" });
    go(h.id);
  },
  getTicker() {
    const items = [...state.hulls, ...state.weapons.filter(w => w.kind === "energy")];
    return items.map(i => `${i.name} ${i.price}`).join("  +  ") || "LOADING";
  },
});

async function updatePadShip() {
  const c = currentClient();
  let hull = { name: "Tarsus" };
  if (c && c.transactions) {
    try {
      const detail = await api.client(c.id);
      const last = detail.history.at(-1)?.ships.at(-1)?.hull;
      if (last) hull = state.hulls.find(h => h.id === last.id) || { name: last.name };
    } catch { /* zostaje Tarsus */ }
  }
  state.padHull = hull;
  concourse.padShip = shipSprite(hull, 72, 40, { yaw: 1.95, pitch: 0.34, scale: 22 / modelRadius(shipMesh(hull)) });
}

const ENTER = {
  concourse: () => { concourse.start(); sound.startAmbient(); },
  dealer: () => { renderDealer(); startViewport(); },
  bar: () => renderBar(),
  exchange: () => renderExchange(),
  computer: opts => showComputerView(opts?.view || "stats"),
};
const LEAVE = {
  concourse: () => concourse.stop(),
  dealer: () => stopViewport(),
};

async function go(scene, opts) {
  if (scene === state.scene) return;
  $("#fader").classList.add("on");
  if (state.scene !== "boot" && state.scene !== "intro") sound.door();
  await sleep(360);
  LEAVE[state.scene]?.();
  $$(".scene").forEach(s => s.classList.toggle("active", s.id === scene));
  state.scene = scene;
  try { await ENTER[scene]?.(opts); } catch (e) { showError(e); }
  $("#fader").classList.remove("on");
}

async function launch() {
  concourse.hover = null;
  $("#hotspot-label").innerHTML = "";
  concourse.shipOnPad = false;
  concourse.draw();
  const backdrop = concourse.snapshot();
  $("#fader").classList.add("on");
  await sleep(200);
  concourse.stop();
  sound.stopAmbient();
  $$(".scene").forEach(s => s.classList.toggle("active", s.id === "launch"));
  state.scene = "launch";
  $("#fader").classList.remove("on");
  await runLaunch($("#launch-canvas"), $("#launch-comm"), backdrop, state.padHull || { name: "Tarsus" });
  concourse.shipOnPad = true;
  $$(".scene").forEach(s => s.classList.toggle("active", s.id === "concourse"));
  state.scene = "concourse";
  ENTER.concourse();
}

// ====================================================================== DIALOGI
function dialog(title, html, { error = false, confirm = false } = {}) {
  const box = $("#dialog");
  $("#dialog-title").textContent = title;
  $("#dialog-title").classList.toggle("err", error);
  $("#dialog-body").innerHTML = html;
  box.classList.remove("hidden");
  const ok = $("#dialog-ok");
  let cancel = box.querySelector(".cancel");
  if (confirm && !cancel) {
    cancel = document.createElement("button");
    cancel.className = "btn cancel";
    cancel.textContent = "ANULUJ";
    ok.after(cancel);
  } else if (!confirm && cancel) {
    cancel.remove();
    cancel = null;
  }
  ok.focus();
  return new Promise(resolve => {
    const done = v => {
      box.classList.add("hidden");
      ok.onclick = null;
      if (cancel) cancel.onclick = null;
      sound.click();
      resolve(v);
    };
    ok.onclick = () => done(true);
    if (cancel) cancel.onclick = () => done(false);
  });
}

function showError(e) {
  sound.error();
  if (!(e instanceof ApiError)) {
    console.error(e);
    return dialog("AWARIA SYSTEMU", esc(e.message), { error: true });
  }
  const d = e.details || {};
  let extra = "";
  if (d.fields) extra = `<ul>${Object.entries(d.fields).map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`).join("")}</ul>`;
  if (d.shortages) extra = `<ul>${d.shortages.map(s => `<li>${esc(s.name)}: potrzeba ${s.requested}, na stanie ${s.in_stock}</li>`).join("")}</ul>`;
  if (d.missing) extra = `<ul><li>Brakuje: ${fmt(d.missing)} kr</li></ul>`;
  return dialog("TRANSMISJA ODRZUCONA", `${esc(e.message)}${extra}<span class="code">HTTP ${e.status} · ${esc(e.code)}</span>`, { error: true });
}

function animateNumber(el, from, to, ms = 900) {
  const t0 = performance.now();
  const step = now => {
    const k = Math.max(0, Math.min(1, (now - t0) / ms));
    el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ====================================================================== TŁA POMIESZCZEŃ
function roomBackground(tint, seed) {
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
$("#dealer").style.setProperty("--room-bg", roomBackground("#4a6a9a", 1));
$("#bar").style.setProperty("--room-bg", roomBackground("#7a2a5a", 2));
$("#exchange").style.setProperty("--room-bg", roomBackground("#3a7a4a", 3));
$("#computer").style.setProperty("--room-bg", roomBackground("#2a4a6a", 4));

// ====================================================================== SHIP DEALER
const view = { r: new Rasterizer(256, 150), bg: null, yaw: 2.2, drag: null, raf: 0, spin: true };

(function buildViewportBg() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 150;
  const p = new Pix(c.getContext("2d"));
  p.vgrad(0, 0, 256, 150, ["#020a06", "#03140a", "#06200f"]);
  for (let k = 1; k < 9; k++) {
    const y = Math.round(100 + 50 * (1 - 1 / (1 + k * k * 0.08)));
    p.rect(0, y, 256, 1, "#0c3a1a");
  }
  for (let x = -400; x <= 656; x += 32) p.line(128 + (x - 128) * 0.15, 100, x, 150, "#0c3a1a");
  p.rect(0, 100, 256, 1, "#1e9c3c");
  view.bg = new Uint32Array(c.getContext("2d").getImageData(0, 0, 256, 150).data.buffer);
})();

function startViewport() {
  const canvas = $("#ship-view"), ctx = canvas.getContext("2d");
  const frame = () => {
    const hull = state.hulls.find(h => h.id === state.hullId);
    view.r.buf.set(view.bg);
    if (hull) {
      if (view.spin && !view.drag) view.yaw += 0.012;
      const mesh = shipMesh(hull), rad = modelRadius(mesh);
      view.r.drawMesh(mesh, {
        cx: 128, cy: 72 + Math.sin(performance.now() / 900) * 2, scale: 66 / rad,
        yaw: view.yaw, pitch: 0.38, flame: 1 + Math.sin(performance.now() / 70) * 0.15,
      });
      // linia skanera
      const sy = Math.floor((performance.now() / 18) % 150);
      for (let x = 0; x < 256; x += 2) view.r.buf[sy * 256 + x] = 0xff50ff7a;
    }
    view.r.blit(ctx);
    $("#vp-rot").textContent = String(Math.round(((view.yaw * 180) / Math.PI) % 360 + 360) % 360).padStart(3, "0");
    view.raf = requestAnimationFrame(frame);
  };
  cancelAnimationFrame(view.raf);
  frame();
}
function stopViewport() { cancelAnimationFrame(view.raf); }

$("#ship-view").addEventListener("mousedown", e => { view.drag = { x: e.clientX, yaw: view.yaw }; });
addEventListener("mousemove", e => { if (view.drag) view.yaw = view.drag.yaw + (e.clientX - view.drag.x) * 0.012; });
addEventListener("mouseup", () => { view.drag = null; });

function renderDealer() {
  const sel = $("#dealer-client");
  sel.innerHTML = state.clients.map(c => `<option value="${c.id}" ${c.id === state.clientId ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  $("#dealer-credits").textContent = fmt(currentClient()?.credits || 0);
  if (!state.hulls.some(h => h.id === state.hullId)) selectHull(state.hulls[0]?.id, false);
  renderHullList();
  renderHullStats();
  renderSlots();
  renderCart();
}

function renderHullList() {
  $("#hull-list").innerHTML = state.hulls.map(h => `
    <li data-id="${h.id}" class="${h.id === state.hullId ? "sel" : ""} ${h.stock ? "" : "dim"}">
      <span>${esc(h.name)}</span><span class="r">${fmt(h.price)}</span>
    </li>`).join("") || "<li>Brak kadłubów w ofercie.</li>";
}

function selectHull(id, sfx = true) {
  if (id == null) { state.hullId = null; return; }
  state.hullId = id;
  state.slots = {};
  view.yaw = 2.2;
  if (sfx) sound.click();
  renderHullList();
  renderHullStats();
  renderSlots();
}

$("#hull-list").addEventListener("click", e => {
  const li = e.target.closest("li[data-id]");
  if (li) selectHull(Number(li.dataset.id));
});
$("#hull-list").addEventListener("mouseover", e => { if (e.target.closest("li[data-id]")) sound.hover(); });
$("#dealer-client").addEventListener("change", e => { setClient(Number(e.target.value)); renderDealer(); sound.click(); });

function meter(value, max, cells = 14) {
  const on = Math.round(Math.min(1, value / max) * cells);
  return `<span class="meter">${Array.from({ length: cells }, (_, i) => `<i class="${i < on ? "on" : ""} ${i < on && i >= cells - 3 ? "hot" : ""}"></i>`).join("")}</span>`;
}

function renderHullStats() {
  const h = state.hulls.find(x => x.id === state.hullId);
  if (!h) { $("#hull-stats").innerHTML = "Wybierz kadłub z listy."; $("#vp-name").textContent = "—"; return; }
  $("#vp-name").textContent = h.name.toUpperCase();
  $("#vp-class").textContent = h.ship_class;
  $("#vp-price").textContent = `${fmt(h.price)} kr`;
  const s = (k, v, m) => `<div class="stat"><span class="k">${k}</span>${m || ""}<span class="v">${v}</span></div>`;
  $("#hull-stats").innerHTML = `
    <div class="stat-grid">
      ${s("Pancerz P", `${h.armor.front} cm`, meter(h.armor.front, 50, 10))}
      ${s("Prędkość", `${h.engine.max_velocity} kps`, meter(h.engine.max_velocity, 500, 10))}
      ${s("Pancerz T", `${h.armor.rear} cm`, meter(h.armor.rear, 50, 10))}
      ${s("Dopalacz", `${h.engine.afterburner_velocity} kps`, meter(h.engine.afterburner_velocity, 1000, 10))}
      ${s("Pancerz B", `${h.armor.side} cm`, meter(h.armor.side, 50, 10))}
      ${s("Ładownia", `${h.cargo} j.`, meter(h.cargo, 150, 10))}
      ${s("Dz/Wż/Rak", `${h.slots.gun}/${h.slots.turret}/${h.slots.missile}`)}
      ${s("Przysp.", esc(h.engine.acceleration))}
      ${s("Na stanie", h.stock ? `${h.stock} szt.` : `<span style="color:var(--red)">BRAK</span>`)}
    </div>
    <div class="desc">${esc(h.description)}</div>`;
}

function slotKeys(h) {
  const keys = [];
  for (const m of ["gun", "turret", "missile"]) for (let i = 0; i < h.slots[m]; i++) keys.push([m, i]);
  return keys;
}

function renderSlots() {
  const h = state.hulls.find(x => x.id === state.hullId);
  if (!h) { $("#slots").innerHTML = ""; return; }
  const keys = slotKeys(h);
  $("#slots").innerHTML = keys.map(([m, i]) => {
    const kind = m === "missile" ? "missile" : "energy";
    const opts = state.weapons.filter(w => w.kind === kind).map(w => {
      const label = kind === "missile" ? `${w.name} x${w.ammo}` : w.name;
      return `<option value="${w.id}" ${state.slots[`${m}-${i}`] === w.id ? "selected" : ""} ${w.stock ? "" : "disabled"}>${esc(label)} · ${fmt(w.price)}</option>`;
    }).join("");
    return `<div class="slot-row"><span class="tag">${MOUNT[m]} ${i + 1}</span>
      <select class="crt-select" data-slot="${m}-${i}"><option value="">— pusty —</option>${opts}</select></div>`;
  }).join("") || `<div class="slot-row none">Ten kadłub nie ma slotów uzbrojenia.</div>`;
  updateSums();
}

$("#slots").addEventListener("change", e => {
  const key = e.target.dataset.slot;
  if (!key) return;
  if (e.target.value) state.slots[key] = Number(e.target.value); else delete state.slots[key];
  sound.click();
  updateSums();
});

function loadoutFrom(slots) {
  const agg = new Map();
  for (const [key, wid] of Object.entries(slots)) {
    const mount = key.split("-")[0], k = `${wid}|${mount}`;
    agg.set(k, { weapon_id: wid, mount, quantity: (agg.get(k)?.quantity || 0) + 1 });
  }
  return [...agg.values()];
}

function configPrice(hullId, slots) {
  const h = state.hulls.find(x => x.id === hullId);
  if (!h) return 0;
  return h.price + Object.values(slots).reduce((a, wid) => a + (state.weapons.find(w => w.id === wid)?.price || 0), 0);
}

function updateSums() {
  const cur = configPrice(state.hullId, state.slots);
  const cart = state.cart.reduce((a, s) => a + configPrice(s.hullId, s.slots), 0);
  const total = state.cart.length ? cart : cur;
  const after = (currentClient()?.credits || 0) - total;
  $("#sum-current").textContent = fmt(cur);
  $("#sum-cart").textContent = fmt(cart);
  $("#sum-total").textContent = fmt(total);
  $("#sum-after").textContent = fmt(after);
  $("#sum-after").className = after < 0 ? "neg" : "";
  $("#btn-buy").textContent = state.cart.length ? `KUP (${state.cart.length})` : "KUP";
}

function renderCart() {
  $("#cart").innerHTML = state.cart.map((s, i) => {
    const h = state.hulls.find(x => x.id === s.hullId);
    return `<li>${esc(h?.name || "?")} <span style="color:#8fdc9e">${esc(s.callsign || "")}</span> · ${fmt(configPrice(s.hullId, s.slots))}<span class="x" data-i="${i}">X</span></li>`;
  }).join("") || `<li style="color:#2f6b3c">pusto - KUP kupi bieżący statek</li>`;
  $("#cart-count").textContent = state.cart.length ? `(${state.cart.length})` : "";
  updateSums();
}

$("#cart").addEventListener("click", e => {
  const x = e.target.closest(".x");
  if (!x) return;
  state.cart.splice(Number(x.dataset.i), 1);
  sound.click();
  renderCart();
});

$("#btn-add").addEventListener("click", () => {
  if (!state.hullId) return;
  state.cart.push({ hullId: state.hullId, slots: { ...state.slots }, callsign: $("#callsign").value.trim() });
  $("#callsign").value = "";
  sound.beep();
  renderCart();
});

$("#btn-buy").addEventListener("click", async () => {
  const client = currentClient();
  if (!client) return dialog("BRAK KLIENTA", "Najpierw zarejestruj pilota w barze.", { error: true });
  const items = state.cart.length ? state.cart : [{ hullId: state.hullId, slots: state.slots, callsign: $("#callsign").value.trim() }];
  const order = {
    client_id: client.id,
    ships: items.map(s => ({ hull_id: s.hullId, callsign: s.callsign, loadout: loadoutFrom(s.slots) })),
  };
  const btn = $("#btn-buy");
  btn.disabled = true;
  try {
    const tx = await api.buy(order);
    sound.buy();
    const before = client.credits;
    state.cart = [];
    state.slots = {};
    $("#callsign").value = "";
    await refresh();
    renderDealer();
    animateNumber($("#dealer-credits"), before, tx.client_credits_left);
    updatePadShip();
    const ships = tx.ships.map(s => `<li>${esc(s.hull.name)} „${esc(s.callsign)}” — ${fmt(s.total_price)} kr</li>`).join("");
    await dialog("DZIĘKUJEMY ZA ZAKUP",
      `<div style="text-align:center"><span class="stamp">SOLD</span></div>
       Transakcja #${tx.id} dla: ${esc(tx.client.name)}<ul>${ships}</ul>
       <span class="code">Razem: ${fmt(tx.total_price)} kr · pozostało ${fmt(tx.client_credits_left)} kr</span>`);
  } catch (e) {
    await showError(e);
  } finally {
    btn.disabled = false;
  }
});

// ====================================================================== BAR
const RUMORS = [
  "„Słyszałem, że Retros znów kręcą się koło Palan. Lepiej mieć coś więcej niż Tarsusa.”",
  "„Kilrathi w Sektorze Gemini? Phi. Ale ja bym jednak wziął Tachyony.”",
  "„Ten facet w kącie przyleciał Orionem. Trzy dni łatali mu pancerz.”",
  "„Mówią, że w Perry płacą podwójnie za eskortę. Mówią też, że nikt nie wraca.”",
  "„Centurion za 150 tysięcy? Za taką cenę powinien sam strzelać.”",
  "„Kup rakiety Friend or Foe. Nie będziesz żałował. Twoi wrogowie - owszem.”",
  "„Ktoś mi wisi trzy skrzynie Brilliance. Jak go zobaczysz, nie mów, że pytałem.”",
];
let barSel = null;

function renderBar() {
  $("#bar-rumor").textContent = `Barman: ${RUMORS[Math.floor(Math.random() * RUMORS.length)]}`;
  if (!state.clients.some(c => c.id === barSel)) barSel = state.clientId;
  $("#patrons").innerHTML = state.clients.map(c => `
    <div class="patron ${c.id === barSel ? "sel" : ""} ${c.id === state.clientId ? "current" : ""}" data-id="${c.id}">
      <canvas width="32" height="40" class="pix"></canvas>
      ${esc(c.name)}<br><span class="prof ${c.profession}">${PROF[c.profession]}</span>
    </div>`).join("");
  $$("#patrons .patron").forEach(el => {
    const c = state.clients.find(x => x.id === Number(el.dataset.id));
    drawPortrait(el.querySelector("canvas"), c.name, c.profession);
  });
  renderDossier();
  previewPortrait();
}

$("#patrons").addEventListener("click", e => {
  const el = e.target.closest(".patron");
  if (!el) return;
  barSel = Number(el.dataset.id);
  sound.click();
  renderBar();
});
$("#patrons").addEventListener("mouseover", e => { if (e.target.closest(".patron")) sound.hover(); });

async function renderDossier() {
  const c = state.clients.find(x => x.id === barSel);
  const el = $("#dossier");
  if (!c) { el.innerHTML = "<div class='crt-head'>AKTA PILOTA</div>Bar jest pusty."; return; }
  el.innerHTML = `
    <div class="crt-head">AKTA PILOTA #${c.id}</div>
    <div class="head">
      <canvas width="32" height="40" class="pix"></canvas>
      <div>
        <h3>${esc(c.name)}</h3>
        <dl>
          <dt>Pochodzenie</dt><dd>${esc(c.origin)}</dd>
          <dt>Profesja</dt><dd class="prof ${c.profession}">${PROF[c.profession]}</dd>
          <dt>Kredyty</dt><dd style="color:var(--amber)">${fmt(c.credits)}</dd>
          <dt>Transakcje</dt><dd>${c.transactions}</dd>
          <dt>Rejestracja</dt><dd>${toStardate(c.registered_at)}</dd>
        </dl>
      </div>
    </div>
    <div class="hist" id="dossier-hist">…</div>
    <div class="btn-row">
      <button class="btn" id="btn-serve" ${c.id === state.clientId ? "disabled" : ""}>${c.id === state.clientId ? "OBSŁUGIWANY" : "OBSŁUŻ KLIENTA"}</button>
      <button class="btn btn-danger" id="btn-del-client">USUŃ</button>
    </div>`;
  drawPortrait(el.querySelector("canvas"), c.name, c.profession);
  $("#btn-serve").onclick = () => { setClient(c.id); sound.beep(); renderBar(); };
  $("#btn-del-client").onclick = async () => {
    if (!await dialog("USUNĄĆ PILOTA?", `Czy na pewno wykreślić <b>${esc(c.name)}</b> z rejestru?`, { confirm: true })) return;
    try {
      await api.remove("clients", c.id);
      await refresh();
      barSel = state.clientId;
      renderBar();
    } catch (e) { showError(e); }
  };
  try {
    const d = await api.client(c.id);
    const ships = d.history.flatMap(t => t.ships.map(s => `${esc(s.hull.name)} „${esc(s.callsign)}”`));
    const hist = $("#dossier-hist");
    if (hist) hist.innerHTML = ships.length ? `Flota: ${ships.join(", ")}` : "Flota: brak - lata na pożyczonym Tarsusie.";
  } catch { /* akta bez historii */ }
}

function previewPortrait() {
  const f = $("#client-form");
  drawPortrait($("#new-portrait"), f.name.value || "?", f.profession.value);
}
$("#client-form").addEventListener("input", previewPortrait);

function clearFieldErrors(form) {
  form.querySelectorAll(".field").forEach(l => { l.classList.remove("err"); l.querySelector(".msg")?.remove(); });
}
function showFieldErrors(form, e) {
  const fields = e.details?.fields;
  if (!fields) return showError(e);
  sound.error();
  for (const [name, msg] of Object.entries(fields)) {
    const input = form.querySelector(`[name="${name}"]`);
    const label = input?.closest(".field");
    if (label) {
      label.classList.add("err");
      label.insertAdjacentHTML("beforeend", `<span class="msg">${esc(msg)}</span>`);
    }
  }
}

$("#client-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  clearFieldErrors(f);
  const body = { name: f.name.value, origin: f.origin.value, profession: f.profession.value, credits: f.credits.value === "" ? null : Number(f.credits.value) };
  try {
    const c = await api.create("clients", body);
    sound.buy();
    f.name.value = "";
    await refresh();
    barSel = c.id;
    renderBar();
  } catch (err) { showFieldErrors(f, err); }
});

// ====================================================================== COMMODITY EXCHANGE
const HULL_FIELDS = [
  ["name", "Nazwa", "text", 2], ["ship_class", "Klasa", "text", 2],
  ["armor_front", "Pancerz przód", "number"], ["armor_rear", "Pancerz tył", "number"],
  ["armor_side", "Pancerz bok", "number"], ["cargo", "Ładownia", "number"],
  ["max_velocity", "Prędkość [kps]", "number"], ["afterburner_velocity", "Dopalacz [kps]", "number"],
  ["gun_slots", "Sloty dział", "number"], ["turret_slots", "Sloty wież", "number"],
  ["missile_slots", "Sloty rakiet", "number"], ["acceleration", "Przyspieszenie", ["Poor", "Average", "Good", "Excellent"]],
  ["price", "Cena", "number"], ["stock", "Ilość", "number"],
  ["description", "Opis", "text", 2],
];
const ENERGY_FIELDS = [
  ["name", "Nazwa", "text", 2], ["damage", "Obrażenia [cm]", "number"], ["energy", "Energia [GJ]", "number"],
  ["refire", "Refire [s]", "number"], ["speed", "Prędkość [m/s]", "number"],
  ["price", "Cena", "number"], ["stock", "Ilość", "number"],
];
const MISSILE_FIELDS = [
  ["name", "Nazwa", "text", 2], ["damage", "Obrażenia [cm]", "number"], ["ammo", "Amunicja / pakiet", "number"],
  ["price", "Cena", "number"], ["stock", "Ilość", "number"],
];

async function renderExchange() {
  const inv = await api.inventory();
  $$("#ex-tabs .tab").forEach(t => t.classList.toggle("active", t.dataset.tab === state.exTab));
  const rows = state.exTab === "hulls" ? inv.hulls : inv.weapons.filter(w => w.kind === state.exTab);
  const kind = state.exTab === "hulls" ? "hulls" : "weapons";
  $("#ex-rows").innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.name)}</td><td class="num">${fmt(r.price)}</td>
      <td class="num st-${r.status}">${r.stock}${r.status === "OK" ? "" : ` ${r.status}`}</td>
      <td class="num">${fmt(r.value)}</td>
      <td class="num"><button class="scrap" data-kind="${kind}" data-id="${r.id}" data-name="${esc(r.name)}">ZŁOM</button></td>
    </tr>`).join("") || `<tr><td colspan="5">Pusto.</td></tr>`;
  const s = inv.summary;
  $("#ex-summary").innerHTML = `Wartość magazynu: <b>${fmt(s.total_value)} kr</b> · kadłuby: <b>${s.hull_units}</b> · broń: <b>${s.weapon_units}</b><br>
    Brak na stanie: <b>${s.out_of_stock.map(esc).join(", ") || "—"}</b> · Kończy się: <b>${s.low_stock.map(esc).join(", ") || "—"}</b>`;
  renderDeliveryForm();
}

function renderDeliveryForm() {
  const fields = state.exTab === "hulls" ? HULL_FIELDS : state.exTab === "energy" ? ENERGY_FIELDS : MISSILE_FIELDS;
  $("#delivery-title").textContent = `NOWA DOSTAWA · ${state.exTab === "hulls" ? "KADŁUB" : state.exTab === "energy" ? "DZIAŁO" : "RAKIETY"}`;
  $("#delivery-fields").innerHTML = `<div class="form-2">${fields.map(([name, label, type, span]) => `
    <label class="field" style="${span ? "grid-column: span 2" : ""}">${label}
      ${Array.isArray(type)
        ? `<select name="${name}" class="crt-select">${type.map(o => `<option ${o === "Average" ? "selected" : ""}>${o}</option>`).join("")}</select>`
        : `<input name="${name}" class="crt-input" type="${type}" step="any">`}
    </label>`).join("")}</div>`;
}

$("#ex-tabs").addEventListener("click", e => {
  const t = e.target.closest(".tab");
  if (!t) return;
  state.exTab = t.dataset.tab;
  sound.click();
  renderExchange().catch(showError);
});

$("#ex-rows").addEventListener("click", async e => {
  const b = e.target.closest(".scrap");
  if (!b) return;
  if (!await dialog("ZEZŁOMOWAĆ?", `Usunąć <b>${esc(b.dataset.name)}</b> z oferty?`, { confirm: true })) return;
  try {
    await api.remove(b.dataset.kind, Number(b.dataset.id));
    sound.door();
    await refresh();
    await renderExchange();
  } catch (err) { showError(err); }
});

$("#delivery-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  clearFieldErrors(f);
  const body = {};
  f.querySelectorAll("[name]").forEach(inp => {
    const v = inp.value.trim();
    if (v === "") return;
    body[inp.name] = inp.type === "number" ? Number(v) : v;
  });
  const kind = state.exTab === "hulls" ? "hulls" : "weapons";
  if (kind === "weapons") body.kind = state.exTab;
  try {
    await api.create(kind, body);
    sound.buy();
    await refresh();
    await renderExchange();
  } catch (err) { showFieldErrors(f, err); }
});

// ====================================================================== MISSION COMPUTER
function toStardate(iso) {
  const d = new Date(iso);
  const y = d.getUTCFullYear() + 643;   // 2026 -> 2669
  return `${y}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
$("#stardate").textContent = toStardate(new Date().toISOString()).split(" ")[0];

function asciiBars(rows, width = 16) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return rows.map(([label, v, txt]) => {
    const n = Math.round((v / max) * width);
    return `<span class="lbl">${esc(label.padEnd(15).slice(0, 15))}</span> <span class="bar">${"█".repeat(n)}${"░".repeat(width - n)}</span> <span class="val">${txt ?? v}</span>`;
  }).join("\n");
}

async function renderStats() {
  const s = await api.stats();
  $("#view-stats").innerHTML = `
    <div class="big-nums">
      <div class="big-num"><div class="n" data-n="${s.clients}">0</div><div class="l">KLIENCI</div></div>
      <div class="big-num"><div class="n" data-n="${s.transactions}">0</div><div class="l">TRANSAKCJE</div></div>
      <div class="big-num"><div class="n" data-n="${s.ships_sold}">0</div><div class="l">SPRZEDANE STATKI</div></div>
      <div class="big-num"><div class="n" data-n="${s.revenue}">0</div><div class="l">PRZYCHÓD [kr]</div></div>
    </div>
    <div class="stats-cols">
      <div>
        <div class="crt-head">SPRZEDAŻ KADŁUBÓW</div>
        <div class="ascii-bars">${asciiBars(s.hull_sales.map(h => [h.hull, h.sold, `${h.sold} szt.`])) || "brak"}</div>
        <div class="crt-head mt">PROFESJE KLIENTÓW</div>
        <div class="ascii-bars">${asciiBars(Object.entries(s.clients_by_profession).map(([k, v]) => [PROF[k] || k, v]))}</div>
      </div>
      <div>
        <div class="crt-head">NAJCZĘŚCIEJ MONTOWANA BROŃ</div>
        <div class="ascii-bars">${asciiBars(s.weapon_sales.slice(0, 7).map(w => [w.weapon, w.units, `${w.units} szt.`])) || "brak"}</div>
        <div class="crt-head mt">PODSUMOWANIE</div>
        <div>Średnia transakcja: <span style="color:var(--amber)">${fmt(s.average_transaction)} kr</span></div>
        <div>Najlepszy klient: <span style="color:var(--amber)">${s.top_client ? `${esc(s.top_client.name)} (${fmt(s.top_client.spent)} kr)` : "—"}</span></div>
      </div>
    </div>`;
  $$("#view-stats .n").forEach(el => animateNumber(el, 0, Number(el.dataset.n), 1200));
}

let txCache = [];
async function renderLog() {
  txCache = await api.purchases();
  $("#tx-list").innerHTML = txCache.map(t => `
    <li data-id="${t.id}"><span>#${t.id} ${esc(t.client.name)}</span><span class="r">${fmt(t.total_price)}</span></li>`).join("") || "<li>Brak transakcji.</li>";
  if (txCache[0]) showTx(txCache[0].id);
  else $("#tx-detail").textContent = "";
}

function showTx(id) {
  const t = txCache.find(x => x.id === id);
  if (!t) return;
  $$("#tx-list li").forEach(li => li.classList.toggle("sel", Number(li.dataset.id) === id));
  const line = "-".repeat(40);
  const row = (l, r) => `${l.padEnd(30).slice(0, 30)}${String(r).padStart(10)}`;
  const out = [
    `MANIFEST TRANSAKCJI #${t.id}`,
    `DATA:   ${toStardate(t.created_at)}`,
    `KLIENT: ${t.client.name} (${PROF[t.client.profession]})`,
    line,
  ];
  t.ships.forEach((s, i) => {
    out.push(row(`[${i + 1}] ${s.hull.name.toUpperCase()} "${s.callsign}"`, fmt(s.hull.price)));
    s.loadout.forEach(w => out.push(row(`    ${MOUNT[w.mount].padEnd(8)}${w.quantity}x ${w.weapon.name}`, fmt(w.unit_price * w.quantity))));
    out.push(row("", `= ${fmt(s.total_price)}`));
  });
  out.push(line, row("RAZEM", fmt(t.total_price)));
  $("#tx-detail").textContent = out.join("\n");
}

$("#tx-list").addEventListener("click", e => {
  const li = e.target.closest("li[data-id]");
  if (li) { sound.click(); showTx(Number(li.dataset.id)); }
});

function showComputerView(v) {
  $$(".comp-btn").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $$(".comp-view").forEach(el => el.classList.toggle("active", el.id === `view-${v}`));
  if (v === "stats") return renderStats();
  if (v === "log") return renderLog();
  if (v === "term") { termWelcome(); setTimeout(() => $("#term-in").focus(), 50); }
}
$$(".comp-btn").forEach(b => b.addEventListener("click", () => { sound.click(); Promise.resolve(showComputerView(b.dataset.view)).catch(showError); }));

// ---------------------------------------------------------------------- terminal API
const term = { history: [], idx: 0, greeted: false };
const termOut = $("#term-out");

function termPrint(html, cls = "") {
  termOut.insertAdjacentHTML("beforeend", `<div class="${cls}">${html}</div>`);
  termOut.scrollTop = termOut.scrollHeight;
}

function highlightJson(value) {
  const json = esc(JSON.stringify(value, null, 2));
  return json.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g,
    (m, str, colon, lit, num) => {
      if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`;
      if (lit) return `<span class="j-lit">${lit}</span>`;
      return `<span class="j-num">${num}</span>`;
    });
}

function termWelcome() {
  if (term.greeted) return;
  term.greeted = true;
  termPrint("MERCHANTS' GUILD DATALINK · REST/JSON", "t-ok");
  termPrint("Wpisz <span class='j-key'>help</span> po listę poleceń. Strzałki ↑↓ - historia.", "t-dim");
}

const HELP = `Polecenia:
  GET    /api/...             np. GET /api/hulls, GET /api/stats
  POST   /api/... {json}      np. POST /api/clients {"name":"Brownbeard","origin":"Achilles","profession":"pirate","credits":5000}
  DELETE /api/.../id          np. DELETE /api/clients/7
  PUT / PATCH ...             (sprawdź obsługę 405)
  help, clear, demo, credits  demo = przykładowe błędne żądania`;

async function termExec(raw) {
  const line = raw.trim();
  if (!line) return;
  term.history.push(line);
  term.idx = term.history.length;
  termPrint(`<span class="prompt">GEMINI&gt;</span> ${esc(line)}`);
  if (line === "clear") { termOut.innerHTML = ""; return; }
  if (line === "help") { termPrint(esc(HELP), "t-dim"); return; }
  if (line === "credits" || line === "about") {
    termPrint([
      "GEMINI SHIPYARD v1.0",
      "Autor: Dawid Klimczuk",
      "Programowanie Wysokopoziomowe · Laboratorium 1",
      "Flask + SQLAlchemy · grafika, modele 3D i dźwięk generowane w kodzie",
    ].join("\n"), "t-ok");
    return;
  }
  if (line === "demo") {
    for (const cmd of ["GET /api/hulls/999", 'POST /api/clients {"name":"","profession":"jedi"}', "POST /api/purchases {oops", "PUT /api/hulls", "GET /api/weapons?kind=banana"]) {
      await termExec(cmd);
    }
    return;
  }
  const m = line.match(/^(GET|POST|DELETE|PUT|PATCH)\s+(\S+)\s*(.*)$/i);
  if (!m) { sound.error(); termPrint("Nieznane polecenie. Wpisz help.", "t-err"); return; }
  const [, method, path, body] = m;
  const t0 = performance.now();
  const r = await request(method.toUpperCase(), path, body ? body : undefined);
  const ms = Math.round(performance.now() - t0);
  termPrint(`HTTP ${r.status} ${esc(r.statusText)} · ${ms} ms`, r.ok ? "t-ok" : "t-err");
  if (r.data !== null && r.data !== "") termPrint(typeof r.data === "string" ? esc(r.data) : highlightJson(r.data));
  if (r.ok) sound.beep(); else sound.error();
  if (r.ok && method.toUpperCase() !== "GET") refresh().catch(() => {});
}

$("#term-in").addEventListener("keydown", async e => {
  e.stopPropagation();
  if (e.key === "Escape") { e.target.blur(); go("concourse"); return; }
  if (e.key === "Enter") {
    const v = e.target.value;
    e.target.value = "";
    await termExec(v);
  } else if (e.key === "ArrowUp") {
    term.idx = Math.max(0, term.idx - 1);
    e.target.value = term.history[term.idx] || "";
    e.preventDefault();
  } else if (e.key === "ArrowDown") {
    term.idx = Math.min(term.history.length, term.idx + 1);
    e.target.value = term.history[term.idx] || "";
    e.preventDefault();
  } else if (e.key.length === 1) {
    sound.type();
  }
});

// ====================================================================== KLAWIATURA, WYJŚCIA
$$("[data-exit]").forEach(b => b.addEventListener("click", () => { sound.click(); go("concourse"); }));
document.addEventListener("mouseover", e => { if (e.target.closest(".btn, .tab, .comp-btn")) sound.hover(); });

addEventListener("keydown", e => {
  const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
  if (e.key === "Escape" && !$("#dialog").classList.contains("hidden")) { ($("#dialog .cancel") || $("#dialog-ok")).click(); return; }
  if (typing) return;
  if (e.key === "Escape" && ["dealer", "bar", "exchange", "computer"].includes(state.scene)) go("concourse");
  if (e.key === "m" || e.key === "M") sound.toggleMute();
  if (e.key === "c" || e.key === "C") $("#screen").classList.toggle("no-crt");
});

// ====================================================================== START
addEventListener("pointerdown", () => {
  sound.unlock();
  if (state.scene === "concourse") sound.startAmbient();
});

async function boot() {
  const skipTo = new URLSearchParams(location.search).get("scene");
  if (skipTo) {
    await refresh();
    await updatePadShip();
    return go(["dealer", "bar", "exchange", "computer"].includes(skipTo) ? skipTo : "concourse");
  }
  const bootEl = $("#boot");
  bootEl.insertAdjacentHTML("beforeend", `<div class="power"><button id="power-btn" title="Włącz">⏻</button><span class="led"></span>POWER</div>`);
  await new Promise(res => $("#power-btn").addEventListener("click", res, { once: true }));
  sound.unlock();
  bootEl.querySelector(".power").remove();
  bootEl.classList.add("powered");

  const data = refresh();
  const statsP = data.then(() => api.stats()).then(s => ({
    hulls: state.hulls.length, weapons: state.weapons.length, clients: s.clients, transactions: s.transactions,
  }));
  await sleep(500);
  await runBoot($("#boot-log"), statsP);
  try { await data; } catch (e) { showError(e); }
  await updatePadShip();
  await sleep(700);

  await go("intro");
  const intro = new Intro($("#intro-canvas"));
  intro.start();
  sound.startAmbient();
  requestAnimationFrame(() => $("#intro").classList.add("show"));
  await sleep(1200);
  await new Promise(res => {
    const next = () => { removeEventListener("keydown", next); $("#intro").removeEventListener("click", next); res(); };
    addEventListener("keydown", next);
    $("#intro").addEventListener("click", next);
  });
  sound.click();
  await go("concourse");
  intro.stop();
}

boot();
