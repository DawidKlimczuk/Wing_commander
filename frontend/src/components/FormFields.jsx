// =======================
// w tym pliku jest formularz budowany z listy pól (używam go w barze i w magazynie)
// pola z błędami z serwera dostają czerwoną ramkę i komunikat pod spodem
// =======================
export default function FormFields({ fields, values, errors, onChange }) {
  return (
    <div className="form-2">
      {fields.map(f => (
        <label key={f.name} className={`field ${errors[f.name] ? "err" : ""}`} style={f.span ? { gridColumn: "span 2" } : undefined}>
          <span>{f.label}{f.required && <span className="req">*</span>}</span>
          {f.options ? (
            <select name={f.name} className="crt-select" value={values[f.name] ?? ""} onChange={e => onChange(f.name, e.target.value)}>
              {f.options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
            </select>
          ) : (
            <input name={f.name} className="crt-input" type={f.type || "text"} step="any" min={f.type === "number" ? 0 : undefined}
              maxLength={f.type === "number" ? undefined : 64} value={values[f.name] ?? ""} onChange={e => onChange(f.name, e.target.value)} />
          )}
          {errors[f.name] && <span className="msg">{errors[f.name]}</span>}
        </label>
      ))}
    </div>
  );
}

// ==============
// funkcja sprawdza formularz zanim wyślę go do serwera (puste wymagane pola i ujemne liczby)
// ==============
export function checkForm(fields, values) {
  const errors = {};
  for (const f of fields) {
    const v = String(values[f.name] ?? "").trim();
    if (f.required && v === "") errors[f.name] = "Pole wymagane.";
    else if (f.type === "number" && v !== "" && (isNaN(Number(v)) || Number(v) < 0)) errors[f.name] = "Podaj liczbę >= 0.";
  }
  return errors;
}

// ==============
// funkcja zamienia wartości z formularza na obiekt JSON (liczby jako liczby, puste pola pomijam)
// ==============
export function formToBody(fields, values) {
  const body = {};
  for (const f of fields) {
    const v = String(values[f.name] ?? "").trim();
    if (v === "") continue;
    body[f.name] = f.type === "number" ? Number(v) : v;
  }
  return body;
}
