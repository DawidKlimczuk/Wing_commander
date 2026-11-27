// =======================
// w tym pliku jest magazyn - stan towaru, nowe dostawy (POST), edycja (PUT), dokładanie sztuk (PATCH) i złom (DELETE)
// =======================
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { sound } from "../engine/audio.js";
import { useShop } from "../context/ShopContext.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import Room from "../components/Room.jsx";
import FormFields, { checkForm, formToBody } from "../components/FormFields.jsx";
import { fmt } from "../utils.js";

// pola formularza dla każdej zakładki
const HULL_FIELDS = [
  { name: "name", label: "Nazwa", required: true, span: 2 }, { name: "ship_class", label: "Klasa", span: 2 },
  { name: "armor_front", label: "Pancerz przód", type: "number", required: true }, { name: "armor_rear", label: "Pancerz tył", type: "number", required: true },
  { name: "armor_side", label: "Pancerz bok", type: "number", required: true }, { name: "cargo", label: "Ładownia", type: "number", required: true },
  { name: "max_velocity", label: "Prędkość [kps]", type: "number", required: true }, { name: "afterburner_velocity", label: "Dopalacz [kps]", type: "number", required: true },
  { name: "gun_slots", label: "Sloty dział", type: "number", required: true }, { name: "turret_slots", label: "Sloty wież", type: "number" },
  { name: "missile_slots", label: "Sloty rakiet", type: "number", required: true }, { name: "acceleration", label: "Przyspieszenie", options: ["Poor", "Average", "Good", "Excellent"] },
  { name: "price", label: "Cena", type: "number", required: true }, { name: "stock", label: "Ilość", type: "number" },
  { name: "description", label: "Opis", span: 2 },
];
const ENERGY_FIELDS = [
  { name: "name", label: "Nazwa", required: true, span: 2 }, { name: "damage", label: "Obrażenia [cm]", type: "number", required: true },
  { name: "energy", label: "Energia [GJ]", type: "number" }, { name: "refire", label: "Refire [s]", type: "number" },
  { name: "speed", label: "Prędkość [m/s]", type: "number" }, { name: "price", label: "Cena", type: "number", required: true },
  { name: "stock", label: "Ilość", type: "number" },
];
const MISSILE_FIELDS = [
  { name: "name", label: "Nazwa", required: true, span: 2 }, { name: "damage", label: "Obrażenia [cm]", type: "number", required: true },
  { name: "ammo", label: "Amunicja / pakiet", type: "number", required: true }, { name: "price", label: "Cena", type: "number", required: true },
  { name: "stock", label: "Ilość", type: "number" },
];

const TABS = {
  hulls: { label: "KADŁUBY", what: "KADŁUB", fields: HULL_FIELDS, kind: "hulls" },
  energy: { label: "DZIAŁA", what: "DZIAŁO", fields: ENERGY_FIELDS, kind: "weapons" },
  missile: { label: "RAKIETY", what: "RAKIETY", fields: MISSILE_FIELDS, kind: "weapons" },
};

const emptyValues = tab => (tab === "hulls" ? { acceleration: "Average" } : {});

// ==============
// funkcja zamienia kadłub z API (zagnieżdżony) na płaskie pola formularza
// ==============
function hullToForm(h) {
  return {
    name: h.name, ship_class: h.ship_class, armor_front: h.armor.front, armor_rear: h.armor.rear, armor_side: h.armor.side,
    cargo: h.cargo, max_velocity: h.engine.max_velocity, afterburner_velocity: h.engine.afterburner_velocity,
    acceleration: h.engine.acceleration, gun_slots: h.slots.gun, turret_slots: h.slots.turret, missile_slots: h.slots.missile,
    price: h.price, stock: h.stock, description: h.description,
  };
}

export default function Exchange({ onExit }) {
  const { hulls, weapons, refresh } = useShop();
  const { dialog, showError } = useDialog();
  const [tab, setTab] = useState("hulls");
  const [inv, setInv] = useState(null);
  const [editing, setEditing] = useState(null);   // id edytowanego towaru albo null
  const [values, setValues] = useState(emptyValues("hulls"));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const cfg = TABS[tab];

  // stan magazynu pobieram od nowa za każdym razem jak zmienią się dane w sklepie
  useEffect(() => {
    let cancelled = false;
    api.inventory().then(d => { if (!cancelled) setInv(d); }).catch(showError);
    return () => { cancelled = true; };
  }, [hulls, weapons, showError]);

  function switchTab(t) {
    setTab(t);
    setEditing(null);
    setValues(emptyValues(t));
    setErrors({});
    sound.click();
  }

  function startEdit(id) {
    const obj = cfg.kind === "hulls" ? hulls.find(h => h.id === id) : weapons.find(w => w.id === id);
    if (!obj) return;
    const v = cfg.kind === "hulls" ? hullToForm(obj) : obj;
    // do formularza idą tylko pola z listy, wszystko jako tekst
    setValues(Object.fromEntries(cfg.fields.map(f => [f.name, v[f.name] ?? ""]).map(([k, x]) => [k, String(x)])));
    setEditing(id);
    setErrors({});
    sound.click();
  }

  function cancelEdit() {
    setEditing(null);
    setValues(emptyValues(tab));
    setErrors({});
  }

  // ==============
  // szybka dostawa jednej sztuki - PATCH zmienia tylko pole stock
  // ==============
  async function addOne(row) {
    try {
      await api.patch(cfg.kind, row.id, { stock: row.stock + 1 });
      sound.beep();
      await refresh();
    } catch (e) { showError(e); }
  }

  // ==============
  // złomowanie towaru (DELETE) - serwer nie pozwoli jak towar był już sprzedany
  // ==============
  async function scrap(row) {
    if (!await dialog("ZEZŁOMOWAĆ?", <>Usunąć <b>{row.name}</b> z oferty?</>, { confirm: true })) return;
    try {
      await api.remove(cfg.kind, row.id);
      sound.door();
      if (editing === row.id) cancelEdit();
      await refresh();
    } catch (e) { showError(e); }
  }

  // ==============
  // wysłanie formularza: POST (nowa dostawa) albo PUT (podmiana całego towaru)
  // ==============
  async function submit(e) {
    e.preventDefault();
    const local = checkForm(cfg.fields, values);
    setErrors(local);
    if (Object.keys(local).length) { sound.error(); return; }
    const body = formToBody(cfg.fields, values);
    if (cfg.kind === "weapons") body.kind = tab;
    setBusy(true);
    try {
      if (editing) await api.replace(cfg.kind, editing, body);
      else await api.create(cfg.kind, body);
      sound.buy();
      cancelEdit();
      await refresh();
    } catch (err) {
      if (err.details?.fields) { sound.error(); setErrors(err.details.fields); }
      else showError(err);
    } finally {
      setBusy(false);
    }
  }

  const rows = !inv ? [] : tab === "hulls" ? inv.hulls : inv.weapons.filter(w => w.kind === tab);
  const s = inv?.summary;
  const editedName = editing && rows.find(r => r.id === editing)?.name;

  return (
    <Room id="exchange" title="COMMODITY EXCHANGE" sub="Oferta magazynowa · dostawy · złom" tint="#3a7a4a" seed={3} onExit={onExit}>
      <div className="exchange-grid">
        <div className="bezel">
          <div className="crt">
            <div className="tabs">
              {Object.entries(TABS).map(([key, t]) => (
                <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => switchTab(key)}>{t.label}</button>
              ))}
            </div>
            <table className="ex-table">
              <thead><tr><th>TOWAR</th><th className="num">CENA</th><th className="num">STAN</th><th className="num">WARTOŚĆ</th><th></th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={editing === r.id ? "sel" : ""}>
                    <td>{r.name}</td>
                    <td className="num">{fmt(r.price)}</td>
                    <td className={`num st-${r.status}`}>{r.stock}{r.status !== "OK" && ` ${r.status}`}</td>
                    <td className="num">{fmt(r.value)}</td>
                    <td className="num actions">
                      <button className="mini" title="PATCH: +1 sztuka" onClick={() => addOne(r)}>+1</button>
                      <button className="mini" title="PUT: edycja" onClick={() => startEdit(r.id)}>EDYTUJ</button>
                      <button className="scrap" title="DELETE" onClick={() => scrap(r)}>ZŁOM</button>
                    </td>
                  </tr>
                ))}
                {inv && !rows.length && <tr><td colSpan="5">Pusto.</td></tr>}
                {!inv && <tr><td colSpan="5">Łączenie z magazynem…</td></tr>}
              </tbody>
            </table>
            {s && (
              <div className="ex-summary">
                Wartość magazynu: <b>{fmt(s.total_value)} kr</b> · kadłuby: <b>{s.hull_units}</b> · broń: <b>{s.weapon_units}</b><br />
                Brak na stanie: <b>{s.out_of_stock.join(", ") || "—"}</b> · Kończy się: <b>{s.low_stock.join(", ") || "—"}</b>
              </div>
            )}
          </div>
        </div>

        <div className="bezel">
          <form className={`crt ${editing ? "editing" : ""}`} onSubmit={submit} noValidate>
            <div className="crt-head">{editing ? `EDYCJA · ${editedName || cfg.what}` : `NOWA DOSTAWA · ${cfg.what}`}</div>
            <FormFields fields={cfg.fields} values={values} errors={errors}
              onChange={(k, v) => setValues(old => ({ ...old, [k]: v }))} />
            <div className="btn-row">
              <button className="btn btn-buy" type="submit" disabled={busy}>{editing ? "ZAPISZ (PUT)" : "PRZYJMIJ DOSTAWĘ"}</button>
              {editing && <button className="btn" type="button" onClick={cancelEdit}>ANULUJ</button>}
            </div>
          </form>
        </div>
      </div>
    </Room>
  );
}
