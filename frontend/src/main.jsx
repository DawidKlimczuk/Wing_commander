// =======================
// w tym pliku startuje aplikacja React - wczytuję czcionki, style i główny komponent
// =======================
import { createRoot } from "react-dom/client";
import "@fontsource/vt323";
import "@fontsource/press-start-2p";
import "./styles/privateer.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
