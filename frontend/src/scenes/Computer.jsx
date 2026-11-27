// =======================
// w tym pliku jest komputer misji - statystyki, historia zakupów i terminal do wysyłania zapytań REST
// =======================
import { useEffect, useRef, useState } from "react";
import { api, request } from "../api.js";
import { sound } from "../engine/audio.js";
import { useShop } from "../context/ShopContext.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import Room from "../components/Room.jsx";
import AnimatedNumber from "../components/AnimatedNumber.jsx";
import { fmt, isSecure, MOUNT, PROF, toStardate } from "../utils.js";

// ==============
// wykres z tekstu (█ i ░)
// ==============
function AsciiBars({ rows, width = 16 }) {
  if (!rows.length) return <div className="ascii-bars">brak</div>;
  const max = Math.max(1, ...rows.map(r => r[1]));
  return (
    <div className="ascii-bars">
      {rows.map(([label, v, txt]) => {
        const n = Math.round((v / max) * width);
        return (
          <div key={label}>
            <span className="lbl">{label.padEnd(15).slice(0, 15)}</span> <span className="bar">{"█".repeat(n)}{"░".repeat(width - n)}</span> <span className="val">{txt ?? v}</span>
          </div>
        );
      })}
    </div>
  );
}

// ==============
// zakładka STATS - dane z GET /api/stats
// ==============
function Stats() {
  const { showError } = useDialog();
  const [s, setS] = useState(null);
  useEffect(() => { api.stats().then(setS).catch(showError); }, [showError]);
  if (!s) return <div>Pobieranie danych…</div>;
  return <>
    <div className="big-nums">
      {[[s.clients, "KLIENCI"], [s.transactions, "TRANSAKCJE"], [s.ships_sold, "SPRZEDANE STATKI"], [s.revenue, "PRZYCHÓD [kr]"]].map(([n, l]) => (
        <div className="big-num" key={l}><div className="n"><AnimatedNumber value={n} from={0} ms={1200} /></div><div className="l">{l}</div></div>
      ))}
    </div>
    <div className="stats-cols">
      <div>
        <div className="crt-head">SPRZEDAŻ KADŁUBÓW</div>
        <AsciiBars rows={s.hull_sales.map(h => [h.hull, h.sold, `${h.sold} szt.`])} />
        <div className="crt-head mt">PROFESJE KLIENTÓW</div>
        <AsciiBars rows={Object.entries(s.clients_by_profession).map(([k, v]) => [PROF[k] || k, v])} />
      </div>
      <div>
        <div className="crt-head">NAJCZĘŚCIEJ MONTOWANA BROŃ</div>
        <AsciiBars rows={s.weapon_sales.slice(0, 7).map(w => [w.weapon, w.units, `${w.units} szt.`])} />
        <div className="crt-head mt">PODSUMOWANIE</div>
        <div>Średnia transakcja: <span style={{ color: "var(--amber)" }}>{fmt(s.average_transaction)} kr</span></div>
        <div>Najlepszy klient: <span style={{ color: "var(--amber)" }}>{s.top_client ? `${s.top_client.name} (${fmt(s.top_client.spent)} kr)` : "—"}</span></div>
      </div>
    </div>
  </>;
}

// ==============
// zakładka LOG - lista zakupów i manifest wybranego zakupu
// ==============
function Log() {
  const { showError } = useDialog();
  const [list, setList] = useState(null);
  const [selId, setSelId] = useState(null);
  useEffect(() => {
    api.purchases().then(l => { setList(l); setSelId(l[0]?.id ?? null); }).catch(showError);
  }, [showError]);

  const t = list?.find(x => x.id === selId);
  let manifest = "";
  if (t) {
    const line = "-".repeat(40);
    const row = (l, r) => `${l.padEnd(30).slice(0, 30)}${String(r).padStart(10)}`;
    const out = [`MANIFEST TRANSAKCJI #${t.id}`, `DATA:   ${toStardate(t.created_at)}`, `KLIENT: ${t.client.name} (${PROF[t.client.profession]})`, line];
    t.ships.forEach((s, i) => {
      out.push(row(`[${i + 1}] ${s.hull.name.toUpperCase()} "${s.callsign}"`, fmt(s.hull.price)));
      s.loadout.forEach(w => out.push(row(`    ${MOUNT[w.mount].padEnd(8)}${w.quantity}x ${w.weapon.name}`, fmt(w.unit_price * w.quantity))));
      out.push(row("", `= ${fmt(s.total_price)}`));
    });
    out.push(line, row("RAZEM", fmt(t.total_price)));
    manifest = out.join("\n");
  }

  return (
    <div className="log-split">
      <ul className="crt-list">
        {list?.map(x => (
          <li key={x.id} className={x.id === selId ? "sel" : ""} onClick={() => { setSelId(x.id); sound.click(); }}>
            <span>#{x.id} {x.client.name}</span><span className="r">{fmt(x.total_price)}</span>
          </li>
        ))}
        {list && !list.length && <li>Brak transakcji.</li>}
      </ul>
      <pre className="manifest">{manifest}</pre>
    </div>
  );
}

// ==============
// kolorowanie JSON-a w terminalu (klucze, teksty, liczby)
// ==============
function JsonView({ value }) {
  const json = JSON.stringify(value, null, 2);
  const parts = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(json))) {
    if (m.index > last) parts.push(json.slice(last, m.index));
    const [, str, colon, lit, num] = m;
    if (str) parts.push(<span key={i++} className={colon ? "j-key" : "j-str"}>{str}</span>, colon || "");
    else if (lit) parts.push(<span key={i++} className="j-lit">{lit}</span>);
    else parts.push(<span key={i++} className="j-num">{num}</span>);
    last = re.lastIndex;
  }
  parts.push(json.slice(last));
  return <div>{parts}</div>;
}

const HELP = `Polecenia:
  GET    /api/...             np. GET /api/hulls, GET /api/stats
  POST   /api/... {json}      np. POST /api/clients {"name":"Brownbeard","origin":"Achilles","profession":"pirate","credits":5000}
  PUT    /api/.../id {json}   podmiana całego obiektu (trzeba podać wszystkie wymagane pola)
  PATCH  /api/.../id {json}   zmiana wybranych pól, np. PATCH /api/hulls/1 {"stock":10}
  DELETE /api/.../id          np. DELETE /api/clients/7
  status                      protokół i nagłówki bezpieczeństwa serwera
  help, clear, demo, credits  demo = przykładowe błędne żądania`;

const DEMO = [
  "GET /api/hulls/999",
  'POST /api/clients {"name":"","profession":"jedi"}',
  "POST /api/purchases {oops",
  'PUT /api/hulls/1 {"stock":1}',
  "PATCH /api/hulls/1 {}",
  'PATCH /api/hulls/1 {"max_velocity":9000}',
  "PUT /api/hulls",
  "GET /api/weapons?kind=banana",
];

// ==============
// zakładka API - terminal Merchants' Guild do ręcznego wysyłania zapytań
// ==============
function Terminal({ onExit }) {
  const { refresh } = useShop();
  const [lines, setLines] = useState([
    { cls: "t-ok", text: "MERCHANTS' GUILD DATALINK · REST/JSON" },
    { cls: "t-dim", text: "Wpisz help po listę poleceń. Strzałki ↑↓ - historia." },
  ]);
  const [input, setInput] = useState("");
  const hist = useRef({ list: [], idx: 0 });
  const outRef = useRef(null);
  const inRef = useRef(null);

  useEffect(() => { setTimeout(() => inRef.current?.focus(), 50); }, []);
  useEffect(() => { if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight; }, [lines]);

  const print = (text, cls = "") => setLines(l => [...l, { text, cls }]);

  // ==============
  // funkcja wykonuje jedno polecenie z terminala
  // ==============
  async function exec(raw) {
    const line = raw.trim();
    if (!line) return;
    hist.current.list.push(line);
    hist.current.idx = hist.current.list.length;
    print(<><span className="prompt">GEMINI&gt;</span> {line}</>);
    if (line === "clear") { setLines([]); return; }
    if (line === "help") { print(HELP, "t-dim"); return; }
    if (line === "credits" || line === "about") {
      print(["GEMINI SHIPYARD v2.0", "Autor: Dawid Klimczuk", "Programowanie Wysokopoziomowe · Laboratorium 2",
        "Flask REST API + React · grafika, modele 3D i dźwięk generowane w kodzie"].join("\n"), "t-ok");
      return;
    }
    if (line === "demo") {
      for (const cmd of DEMO) await exec(cmd);
      return;
    }
    if (line === "status") {
      const r = await request("GET", "/api/").catch(e => ({ error: e }));
      if (r.error) { print(r.error.message, "t-err"); return; }
      const h = name => r.headers.get(name) || "—";
      print([
        `Protokół strony:          ${window.location.protocol.replace(":", "").toUpperCase()} ${isSecure() ? "(szyfrowane TLS)" : "(BEZ SZYFROWANIA)"}`,
        `Strict-Transport-Security: ${h("Strict-Transport-Security")}`,
        `X-Content-Type-Options:    ${h("X-Content-Type-Options")}`,
        `X-Frame-Options:           ${h("X-Frame-Options")}`,
        `Content-Security-Policy:   ${h("Content-Security-Policy")}`,
      ].join("\n"), isSecure() ? "t-ok" : "t-warn");
      return;
    }
    const m = line.match(/^(GET|POST|DELETE|PUT|PATCH)\s+(\S+)\s*(.*)$/i);
    if (!m) { sound.error(); print("Nieznane polecenie. Wpisz help.", "t-err"); return; }
    const [, method, path, body] = m;
    const t0 = performance.now();
    let r;
    try {
      r = await request(method.toUpperCase(), path, body ? body : undefined);
    } catch (e) {
      sound.error(); print(e.message, "t-err"); return;
    }
    const ms = Math.round(performance.now() - t0);
    print(`HTTP ${r.status} ${r.statusText} · ${ms} ms`, r.ok ? "t-ok" : "t-err");
    if (r.data !== null && r.data !== "") print(typeof r.data === "string" ? r.data : <JsonView value={r.data} />);
    if (r.ok) sound.beep(); else sound.error();
    if (r.ok && method.toUpperCase() !== "GET") refresh().catch(() => {});
  }

  function onKey(e) {
    e.stopPropagation();
    const h = hist.current;
    if (e.key === "Escape") { e.target.blur(); onExit(); }
    else if (e.key === "Enter") { const v = input; setInput(""); exec(v); }
    else if (e.key === "ArrowUp") { h.idx = Math.max(0, h.idx - 1); setInput(h.list[h.idx] || ""); e.preventDefault(); }
    else if (e.key === "ArrowDown") { h.idx = Math.min(h.list.length, h.idx + 1); setInput(h.list[h.idx] || ""); e.preventDefault(); }
    else if (e.key.length === 1) sound.type();
  }

  return <>
    <div className="term-out" ref={outRef} onClick={() => inRef.current?.focus()}>
      {lines.map((l, i) => <div key={i} className={l.cls}>{l.text}</div>)}
    </div>
    <div className="term-line">
      <span className="prompt">GEMINI&gt;</span>
      <input ref={inRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} autoComplete="off" spellCheck="false" />
    </div>
  </>;
}

export default function Computer({ view: startView = "stats", onExit }) {
  const [view, setView] = useState(startView);
  return (
    <Room id="computer" title="MISSION COMPUTER" sub="Statystyki · rejestr transakcji · terminal API" tint="#2a4a6a" seed={4} onExit={onExit}>
      <div className="computer-frame">
        <nav className="comp-buttons">
          {[["stats", "STATS"], ["log", "LOG"], ["term", "API"]].map(([v, label]) => (
            <button key={v} className={`comp-btn ${view === v ? "active" : ""}`} onClick={() => { setView(v); sound.click(); }}>{label}</button>
          ))}
        </nav>
        <div className="crt comp-screen">
          {view === "stats" && <Stats />}
          {view === "log" && <Log />}
          {view === "term" && <Terminal onExit={onExit} />}
        </div>
      </div>
    </Room>
  );
}
