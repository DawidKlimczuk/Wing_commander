// =======================
// w tym pliku znajdują się funkcje odpowiedzialne za wysyłanie zapytań do API (backendu Flask)
// =======================
// adres serwera biorę z .env (VITE_API_URL), jak go nie ma to pytam ten sam serwer co strona
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const TIMEOUT_MS = 10000;

// ==============
// klasa błędu, gdy serwer zwróci błąd albo nie odpowie
// ==============
export class ApiError extends Error {
  constructor(status, body) {
    const err = body?.error || {};
    super(err.message || `HTTP ${status}`);
    this.status = status;
    this.code = err.code || "HTTP_ERROR";
    this.details = err.details || {};
  }
}

// błędy które robię sam, jak serwer w ogóle nie odpowiedział po ludzku
const networkError = message => new ApiError(0, { error: { code: "NETWORK", message } });

// ==============
// funkcja odpowiedzialna za wysłanie zapytania do serwera
// zwraca status i dane, nie rzuca błędu przy 4xx/5xx (to robi call niżej)
// ==============
export async function request(method, path, body) {
  const opts = { method, headers: { Accept: "application/json" } };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  // jak serwer za długo myśli to przerywam zapytanie
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  opts.signal = ctrl.signal;

  let res;
  try {
    res = await fetch(BASE + path, opts);
  } catch (e) {
    if (e.name === "AbortError") throw networkError(`Serwer nie odpowiedział w ${TIMEOUT_MS / 1000} s.`);
    throw networkError("Brak łączności z bazą (serwer Flask nie odpowiada).");
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, statusText: res.statusText, data, headers: res.headers };
}

// ==============
// funkcja wysyła zapytanie i rzuca ApiError jak coś poszło nie tak
// ==============
async function call(method, path, body) {
  const r = await request(method, path, body);
  if (!r.ok) {
    // np. strona błędu z proxy w HTML zamiast JSON-a
    if (typeof r.data === "string" || r.data === null) {
      throw new ApiError(r.status, { error: { code: "BAD_RESPONSE", message: `Serwer zwrócił nieoczekiwaną odpowiedź (HTTP ${r.status}).` } });
    }
    throw new ApiError(r.status, r.data);
  }
  return r.data;
}

// ==============
// skróty do wszystkich zapytań (GET, POST, PUT, PATCH, DELETE)
// kind to "hulls", "weapons" albo "clients"
// ==============
export const api = {
  hulls: () => call("GET", "/api/hulls"),
  weapons: () => call("GET", "/api/weapons"),
  clients: () => call("GET", "/api/clients"),
  client: id => call("GET", `/api/clients/${id}`),
  purchases: () => call("GET", "/api/purchases"),
  inventory: () => call("GET", "/api/inventory"),
  stats: () => call("GET", "/api/stats"),
  meta: () => call("GET", "/api/meta"),
  create: (kind, body) => call("POST", `/api/${kind}`, body),
  replace: (kind, id, body) => call("PUT", `/api/${kind}/${id}`, body),
  patch: (kind, id, body) => call("PATCH", `/api/${kind}/${id}`, body),
  remove: (kind, id) => call("DELETE", `/api/${kind}/${id}`),
  buy: order => call("POST", "/api/purchases", order),
};
