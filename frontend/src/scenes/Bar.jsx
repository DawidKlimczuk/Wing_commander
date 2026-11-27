// =======================
// w tym pliku jest bar - lista klientów, akta pilota, dodawanie, edycja i usuwanie klienta
// =======================
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { sound } from "../engine/audio.js";
import { useShop } from "../context/ShopContext.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import Room from "../components/Room.jsx";
import Portrait from "../components/Portrait.jsx";
import FormFields, { checkForm, formToBody } from "../components/FormFields.jsx";
import { fmt, PROF, toStardate } from "../utils.js";

const RUMORS = [
  "„Słyszałem, że Retros znów kręcą się koło Palan. Lepiej mieć coś więcej niż Tarsusa.”",
  "„Kilrathi w Sektorze Gemini? Phi. Ale ja bym jednak wziął Tachyony.”",
  "„Ten facet w kącie przyleciał Orionem. Trzy dni łatali mu pancerz.”",
  "„Mówią, że w Perry płacą podwójnie za eskortę. Mówią też, że nikt nie wraca.”",
  "„Centurion za 150 tysięcy? Za taką cenę powinien sam strzelać.”",
  "„Kup rakiety Friend or Foe. Nie będziesz żałował. Twoi wrogowie - owszem.”",
  "„Ktoś mi wisi trzy skrzynie Brilliance. Jak go zobaczysz, nie mów, że pytałem.”",
];

const EMPTY = { name: "", origin: "", profession: "trader", credits: "25000" };

// ==============
// akta wybranego pilota (szczegóły + flota pobrana z GET /api/clients/<id>)
// ==============
function Dossier({ c, isCurrent, onServe, onEdit, onDelete }) {
  const [fleet, setFleet] = useState(null);

  useEffect(() => {
    if (!c) return;
    let cancelled = false;
    setFleet(null);
    api.client(c.id)
      .then(d => { if (!cancelled) setFleet(d.history.flatMap(t => t.ships.map(s => `${s.hull.name} „${s.callsign}”`))); })
      .catch(() => { if (!cancelled) setFleet([]); });
    return () => { cancelled = true; };
  }, [c?.id, c?.transactions]);

  if (!c) return <div className="crt dossier"><div className="crt-head">AKTA PILOTA</div>Bar jest pusty.</div>;
  return (
    <div className="crt dossier">
      <div className="crt-head">AKTA PILOTA #{c.id}</div>
      <div className="head">
        <Portrait name={c.name} profession={c.profession} />
        <div>
          <h3>{c.name}</h3>
          <dl>
            <dt>Pochodzenie</dt><dd>{c.origin}</dd>
            <dt>Profesja</dt><dd className={`prof ${c.profession}`}>{PROF[c.profession]}</dd>
            <dt>Kredyty</dt><dd style={{ color: "var(--amber)" }}>{fmt(c.credits)}</dd>
            <dt>Transakcje</dt><dd>{c.transactions}</dd>
            <dt>Rejestracja</dt><dd>{toStardate(c.registered_at).split(" ")[0]}</dd>
          </dl>
        </div>
      </div>
      <div className="hist">
        {fleet === null ? "…" : fleet.length ? `Flota: ${fleet.join(", ")}` : "Flota: brak - lata na pożyczonym Tarsusie."}
      </div>
      <div className="btn-row">
        <button className="btn" onClick={onServe} disabled={isCurrent}>{isCurrent ? "OBSŁUGIWANY" : "OBSŁUŻ"}</button>
        <button className="btn" onClick={onEdit}>EDYTUJ</button>
        <button className="btn btn-danger" onClick={onDelete}>USUŃ</button>
      </div>
    </div>
  );
}

export default function Bar({ onExit }) {
  const { clients, clientId, selectClient, meta, refresh } = useShop();
  const { dialog, showError } = useDialog();
  const [selected, setSelected] = useState(clientId);
  const [editing, setEditing] = useState(null);   // null = nowy pilot, liczba = id edytowanego
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const rumor = useMemo(() => RUMORS[Math.floor(Math.random() * RUMORS.length)], []);

  const fields = [
    { name: "name", label: "Imię / ksywa", required: true, span: 2 },
    { name: "origin", label: "Pochodzenie", options: meta.origins, span: 2 },
    { name: "profession", label: "Profesja", options: Object.entries(PROF).map(([value, label]) => ({ value, label })) },
    { name: "credits", label: "Kredyty", type: "number" },
  ];

  // domyślne pochodzenie jak przyjdą dane z /api/meta
  useEffect(() => {
    if (!values.origin && meta.origins.length) setValues(v => ({ ...v, origin: meta.origins[0] }));
  }, [meta.origins, values.origin]);

  // jak wybrany klient został usunięty to zaznaczam obsługiwanego
  useEffect(() => {
    if (!clients.some(c => c.id === selected)) setSelected(clientId);
  }, [clients, selected, clientId]);

  const sel = clients.find(c => c.id === selected) || null;

  function startEdit(c) {
    setEditing(c.id);
    setValues({ name: c.name, origin: c.origin, profession: c.profession, credits: String(c.credits) });
    setErrors({});
    sound.click();
  }

  function cancelEdit() {
    setEditing(null);
    setValues({ ...EMPTY, origin: meta.origins[0] || "" });
    setErrors({});
  }

  // ==============
  // wysłanie formularza: POST (nowy pilot) albo PUT (edycja całego pilota)
  // ==============
  async function submit(e) {
    e.preventDefault();
    const local = checkForm(fields, values);
    setErrors(local);
    if (Object.keys(local).length) { sound.error(); return; }
    const body = formToBody(fields, values);
    setBusy(true);
    try {
      const c = editing ? await api.replace("clients", editing, body) : await api.create("clients", body);
      sound.buy();
      await refresh();
      setSelected(c.id);
      cancelEdit();
    } catch (err) {
      // błędy pól pokazuję przy polach, resztę w okienku
      if (err.details?.fields) { sound.error(); setErrors(err.details.fields); }
      else showError(err);
    } finally {
      setBusy(false);
    }
  }

  // ==============
  // usunięcie pilota (DELETE) - serwer nie pozwoli jak klient ma historię zakupów
  // ==============
  async function remove(c) {
    if (!await dialog("USUNĄĆ PILOTA?", <>Czy na pewno wykreślić <b>{c.name}</b> z rejestru?</>, { confirm: true })) return;
    try {
      await api.remove("clients", c.id);
      sound.door();
      if (editing === c.id) cancelEdit();
      await refresh();
    } catch (err) { showError(err); }
  }

  return (
    <Room id="bar" title="THE BAR" sub="Rejestr klientów · kto dziś pije na kredyt" tint="#7a2a5a" seed={2} onExit={onExit}>
      <div className="bar-rumor">Barman: {rumor}</div>
      <div className="bar-grid">
        <div className="bezel">
          <div className="crt">
            <div className="crt-head">GOŚCIE BARU ({clients.length})</div>
            <div className="patrons">
              {clients.map(c => (
                <div key={c.id} className={`patron ${c.id === selected ? "sel" : ""} ${c.id === clientId ? "current" : ""}`}
                  onClick={() => { setSelected(c.id); sound.click(); }} onMouseEnter={() => sound.hover()}>
                  <Portrait name={c.name} profession={c.profession} />
                  {c.name}<br /><span className={`prof ${c.profession}`}>{PROF[c.profession]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bezel">
          <Dossier c={sel} isCurrent={sel?.id === clientId}
            onServe={() => { selectClient(sel.id); sound.beep(); }}
            onEdit={() => startEdit(sel)}
            onDelete={() => remove(sel)} />
        </div>

        <div className="bezel">
          <form className={`crt ${editing ? "editing" : ""}`} onSubmit={submit} noValidate>
            <div className="crt-head">{editing ? `EDYCJA PILOTA #${editing}` : "NOWY PILOT"}</div>
            <FormFields fields={fields} values={values} errors={errors}
              onChange={(k, v) => setValues(old => ({ ...old, [k]: v }))} />
            <div className="portrait-preview"><Portrait name={values.name} profession={values.profession} /></div>
            <div className="btn-row">
              <button className="btn btn-buy" type="submit" disabled={busy}>{editing ? "ZAPISZ (PUT)" : "ZAREJESTRUJ"}</button>
              {editing && <button className="btn" type="button" onClick={cancelEdit}>ANULUJ</button>}
            </div>
          </form>
        </div>
      </div>
    </Room>
  );
}
