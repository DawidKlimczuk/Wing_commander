// =======================
// w tym pliku jest konfiguracja Vite (serwer deweloperski i budowanie Reacta)
// =======================
// npm run dev        -> http://localhost:5173
// npm run dev:https  -> https://localhost:5173 (certyfikat robiony w locie)
// zapytania na /api są przekazywane do Flaska (proxy), więc nie trzeba wpisywać adresu serwera
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const https = mode === "https";
  // adres Flaska - jak Flask chodzi z --https to trzeba ustawić API_TARGET=https://127.0.0.1:5000
  const target = env.API_TARGET || "http://127.0.0.1:5000";
  return {
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    server: {
      port: 5173,
      proxy: { "/api": { target, changeOrigin: true, secure: false } },
    },
  };
});
