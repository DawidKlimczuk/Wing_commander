// =======================
// w tym pliku jest sklep ze statkami - wybór kadłuba, podgląd 3D, uzbrojenie i zakup
// =======================
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { sound } from "../engine/audio.js";
import { Rasterizer, shipMesh, modelRadius } from "../engine/ships3d.js";
import { viewportBackground } from "../engine/rooms.js";
import { useShop } from "../context/ShopContext.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import Room from "../components/Room.jsx";
import Meter from "../components/Meter.jsx";
import AnimatedNumber from "../components/AnimatedNumber.jsx";
import { fmt, MOUNT } from "../utils.js";

// ==============
// funkcja zwraca listę slotów statku, np. [["gun",0],["gun",1],["missile",0]]
// ==============
function slotKeys(h) {
  const keys = [];
  for (const m of ["gun", "turret", "missile"]) for (let i = 0; i < h.slots[m]; i++) keys.push([m, i]);
  return keys;
}

// ==============
// funkcja zamienia wybrane bronie na dane do wysłania (te same bronie w tym samym typie slotu łączę)
// ==============
function loadoutFrom(slots) {
  const agg = new Map();
  for (const [key, wid] of Object.entries(slots)) {
    const mount = key.split("-")[0], k = `${wid}|${mount}`;
    agg.set(k, { weapon_id: wid, mount, quantity: (agg.get(k)?.quantity || 0) + 1 });
  }
  return [...agg.values()];
}

// ==============
// podgląd 3D statku - osobny komponent, bo ma własną pętlę animacji
// ==============
function ShipViewport({ hull }) {
  const canvasRef = useRef(null);
  const rotRef = useRef(null);
  const view = useRef({ yaw: 2.2, drag: null });
  const hullRef = useRef(hull);
  hullRef.current = hull;

  // nowy statek - obracam go od początku
  useEffect(() => { view.current.yaw = 2.2; }, [hull?.id]);

  useEffect(() => {
    const r = new Rasterizer(256, 150);
    const bg = viewportBackground();
    const ctx = canvasRef.current.getContext("2d");
    const v = view.current;
    let raf;
    const frame = () => {
      const h = hullRef.current;
      r.buf.set(bg);
      if (h) {
        if (!v.drag) v.yaw += 0.012;
        const mesh = shipMesh(h);
        r.drawMesh(mesh, {
          cx: 128, cy: 72 + Math.sin(performance.now() / 900) * 2, scale: 66 / modelRadius(mesh),
          yaw: v.yaw, pitch: 0.38, flame: 1 + Math.sin(performance.now() / 70) * 0.15,
        });
        // linia skanera przesuwająca się po ekranie
        const sy = Math.floor((performance.now() / 18) % 150);
        for (let x = 0; x < 256; x += 2) r.buf[sy * 256 + x] = 0xff50ff7a;
      }
      r.blit(ctx);
      if (rotRef.current) rotRef.current.textContent = String(Math.round(((v.yaw * 180) / Math.PI) % 360 + 360) % 360).padStart(3, "0");
      raf = requestAnimationFrame(frame);
    };
    frame();

    // obracanie statku myszką
    const move = e => { if (v.drag) v.yaw = v.drag.yaw + (e.clientX - v.drag.x) * 0.012; };
    const up = () => { v.drag = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  return (
    <div className="crt viewport">
      <canvas ref={canvasRef} width="256" height="150" className="pix"
        onMouseDown={e => { view.current.drag = { x: e.clientX, yaw: view.current.yaw }; }} />
      <div className="vp-overlay tl">{hull ? hull.name.toUpperCase() : "—"}</div>
      <div className="vp-overlay tr">{hull?.ship_class}</div>
      <div className="vp-overlay bl">ROT <span ref={rotRef}>000</span>&deg;</div>
      <div className="vp-overlay br">{hull ? `${fmt(hull.price)} kr` : ""}</div>
    </div>
  );
}

// ==============
// statystyki wybranego kadłuba
// ==============
function HullStats({ h }) {
  if (!h) return <div className="crt stats">Wybierz kadłub z listy.</div>;
  const Stat = ({ k, v, m }) => <div className="stat"><span className="k">{k}</span>{m}<span className="v">{v}</span></div>;
  return (
    <div className="crt stats">
      <div className="stat-grid">
        <Stat k="Pancerz P" v={`${h.armor.front} cm`} m={<Meter value={h.armor.front} max={50} />} />
        <Stat k="Prędkość" v={`${h.engine.max_velocity} kps`} m={<Meter value={h.engine.max_velocity} max={500} />} />
        <Stat k="Pancerz T" v={`${h.armor.rear} cm`} m={<Meter value={h.armor.rear} max={50} />} />
        <Stat k="Dopalacz" v={`${h.engine.afterburner_velocity} kps`} m={<Meter value={h.engine.afterburner_velocity} max={1000} />} />
        <Stat k="Pancerz B" v={`${h.armor.side} cm`} m={<Meter value={h.armor.side} max={50} />} />
        <Stat k="Ładownia" v={`${h.cargo} j.`} m={<Meter value={h.cargo} max={150} />} />
        <Stat k="Dz/Wż/Rak" v={`${h.slots.gun}/${h.slots.turret}/${h.slots.missile}`} />
        <Stat k="Przysp." v={h.engine.acceleration} />
        <Stat k="Na stanie" v={h.stock ? `${h.stock} szt.` : <span style={{ color: "var(--red)" }}>BRAK</span>} />
      </div>
      <div className="desc">{h.description}</div>
    </div>
  );
}

export default function Dealer({ onExit }) {
  const { hulls, weapons, clients, clientId, currentClient, selectClient, refresh } = useShop();
  const { dialog, showError } = useDialog();
  const [hullId, setHullId] = useState(null);
  const [slots, setSlots] = useState({});      // "gun-0" -> weapon_id
  const [cart, setCart] = useState([]);
  const [callsign, setCallsign] = useState("");
  const [busy, setBusy] = useState(false);

  // jak wybrany kadłub zniknął (np. zezłomowany) to biorę pierwszy z listy
  useEffect(() => {
    if (!hulls.some(h => h.id === hullId)) { setHullId(hulls[0]?.id ?? null); setSlots({}); }
  }, [hulls, hullId]);

  const hull = hulls.find(h => h.id === hullId) || null;

  // ==============
  // funkcja liczy cenę statku z broniami
  // ==============
  const configPrice = (hId, s) => {
    const h = hulls.find(x => x.id === hId);
    if (!h) return 0;
    return h.price + Object.values(s).reduce((a, wid) => a + (weapons.find(w => w.id === wid)?.price || 0), 0);
  };

  // podsumowanie cen (bieżący statek, koszyk, saldo po zakupie)
  const cur = configPrice(hullId, slots);
  const inCart = cart.reduce((a, s) => a + configPrice(s.hullId, s.slots), 0);
  const total = cart.length ? inCart : cur;
  const sums = { cur, inCart, total, after: (currentClient?.credits || 0) - total };

  function pickHull(id) {
    setHullId(id);
    setSlots({});
    sound.click();
  }

  function setSlot(key, value) {
    setSlots(s => {
      const next = { ...s };
      if (value) next[key] = Number(value); else delete next[key];
      return next;
    });
    sound.click();
  }

  function addToCart() {
    if (!hull) return;
    setCart(c => [...c, { hullId, slots: { ...slots }, callsign: callsign.trim() }]);
    setCallsign("");
    sound.beep();
  }

  // ==============
  // kliknięcie KUP - wysyła zakup do serwera (POST /api/purchases)
  // ==============
  async function buy() {
    if (!currentClient) return dialog("BRAK KLIENTA", "Najpierw zarejestruj pilota w barze.", { error: true });
    if (!hull && !cart.length) return dialog("BRAK STATKU", "Wybierz kadłub z listy.", { error: true });
    const items = cart.length ? cart : [{ hullId, slots, callsign: callsign.trim() }];
    const order = {
      client_id: currentClient.id,
      ships: items.map(s => ({ hull_id: s.hullId, callsign: s.callsign, loadout: loadoutFrom(s.slots) })),
    };
    setBusy(true);
    try {
      const tx = await api.buy(order);
      sound.buy();
      setCart([]); setSlots({}); setCallsign("");
      await refresh();
      setBusy(false);
      dialog("DZIĘKUJEMY ZA ZAKUP", <>
        <div style={{ textAlign: "center" }}><span className="stamp">SOLD</span></div>
        Transakcja #{tx.id} dla: {tx.client.name}
        <ul>{tx.ships.map(s => <li key={s.id}>{s.hull.name} „{s.callsign}” — {fmt(s.total_price)} kr</li>)}</ul>
        <span className="code">Razem: {fmt(tx.total_price)} kr · pozostało {fmt(tx.client_credits_left)} kr</span>
      </>);
    } catch (e) {
      await showError(e);
    } finally {
      setBusy(false);
    }
  }

  const clientPicker = <>
    <label>KLIENT</label>
    <select className="crt-select" value={clientId ?? ""} onChange={e => { selectClient(Number(e.target.value)); sound.click(); }}>
      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
    <span className="credits-pill"><AnimatedNumber value={currentClient?.credits || 0} /> kr</span>
  </>;

  return (
    <Room id="dealer" title="SHIP DEALER" sub="Salon statków · konfiguracja i zakup" tint="#4a6a9a" seed={1}
      right={clientPicker} onExit={onExit}>
      <div className="dealer-grid">
        <div className="bezel">
          <div className="crt">
            <div className="crt-head">KADŁUBY W OFERCIE</div>
            <ul className="crt-list">
              {hulls.map(h => (
                <li key={h.id} className={`${h.id === hullId ? "sel" : ""} ${h.stock ? "" : "dim"}`}
                  onClick={() => pickHull(h.id)} onMouseEnter={() => sound.hover()}>
                  <span>{h.name}</span><span className="r">{fmt(h.price)}</span>
                </li>
              ))}
              {!hulls.length && <li>Brak kadłubów w ofercie.</li>}
            </ul>
          </div>
        </div>

        <div className="bezel viewport-bezel">
          <ShipViewport hull={hull} />
          <HullStats h={hull} />
        </div>

        <div className="bezel">
          <div className="crt loadout">
            <div className="crt-head">KONFIGURACJA</div>
            <label className="field">Znak wywoławczy
              <input className="crt-input" maxLength={64} placeholder="np. Szara Eminencja" value={callsign} onChange={e => setCallsign(e.target.value)} />
            </label>
            {hull && slotKeys(hull).map(([m, i]) => {
              const kind = m === "missile" ? "missile" : "energy";
              const key = `${m}-${i}`;
              return (
                <div className="slot-row" key={key}>
                  <span className="tag">{MOUNT[m]} {i + 1}</span>
                  <select className="crt-select" value={slots[key] ?? ""} onChange={e => setSlot(key, e.target.value)}>
                    <option value="">— pusty —</option>
                    {weapons.filter(w => w.kind === kind).map(w => (
                      <option key={w.id} value={w.id} disabled={!w.stock}>
                        {kind === "missile" ? `${w.name} x${w.ammo}` : w.name} · {fmt(w.price)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            {hull && !slotKeys(hull).length && <div className="slot-row none">Ten kadłub nie ma slotów uzbrojenia.</div>}

            <div className="crt-head mt">ZAMÓWIENIE {cart.length > 0 && `(${cart.length})`}</div>
            <ul className="cart">
              {cart.map((s, i) => (
                <li key={i}>
                  {hulls.find(x => x.id === s.hullId)?.name || "?"} <span style={{ color: "#8fdc9e" }}>{s.callsign}</span> · {fmt(configPrice(s.hullId, s.slots))}
                  <span className="x" onClick={() => { setCart(c => c.filter((_, j) => j !== i)); sound.click(); }}>X</span>
                </li>
              ))}
              {!cart.length && <li style={{ color: "#2f6b3c" }}>pusto - KUP kupi bieżący statek</li>}
            </ul>
            <table className="sum">
              <tbody>
                <tr><td>Bieżący statek</td><td>{fmt(sums.cur)}</td></tr>
                <tr><td>W zamówieniu</td><td>{fmt(sums.inCart)}</td></tr>
                <tr className="total"><td>RAZEM</td><td>{fmt(sums.total)}</td></tr>
                <tr><td>Saldo po zakupie</td><td className={sums.after < 0 ? "neg" : ""}>{fmt(sums.after)}</td></tr>
              </tbody>
            </table>
            <div className="btn-row">
              <button className="btn" onClick={addToCart}>+ DO ZAMÓWIENIA</button>
              <button className="btn btn-buy" onClick={buy} disabled={busy}>{busy ? "..." : cart.length ? `KUP (${cart.length})` : "KUP"}</button>
            </div>
          </div>
        </div>
      </div>
    </Room>
  );
}
