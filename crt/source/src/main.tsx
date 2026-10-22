import { createRoot } from "react-dom/client";

// Self-hosted fonts (bundled into assets/ at build time; no font CDN).
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "@fontsource/bebas-neue/latin-400.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/vt323/latin-400.css";

import "./index.css";
import Home from "./pages/Home";

createRoot(document.getElementById("root")!).render(<Home />);
