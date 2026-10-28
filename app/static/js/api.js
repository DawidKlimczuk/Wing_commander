// Cienka warstwa nad fetch - każdy błąd API zamieniany na ApiError z treścią z serwera.
export class ApiError extends Error {
  constructor(status, body) {
    const err = body?.error || {};
    super(err.message || `HTTP ${status}`);
    this.status = status;
    this.code = err.code || "HTTP_ERROR";
    this.details = err.details || {};
  }
}

export async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new ApiError(0, { error: { code: "NETWORK", message: "Brak łączności z bazą (serwer Flask nie odpowiada)." } });
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, statusText: res.statusText, data };
}

async function call(method, path, body) {
  const r = await request(method, path, body);
  if (!r.ok) throw new ApiError(r.status, r.data);
  return r.data;
}

export const api = {
  hulls: () => call("GET", "/api/hulls"),
  weapons: () => call("GET", "/api/weapons"),
  clients: () => call("GET", "/api/clients"),
  client: id => call("GET", `/api/clients/${id}`),
  purchases: () => call("GET", "/api/purchases"),
  inventory: () => call("GET", "/api/inventory"),
  stats: () => call("GET", "/api/stats"),
  create: (kind, body) => call("POST", `/api/${kind}`, body),
  remove: (kind, id) => call("DELETE", `/api/${kind}/${id}`),
  buy: order => call("POST", "/api/purchases", order),
};
