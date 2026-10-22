import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "./" makes every asset URL relative, so the built site works both at
// https://<user>.github.io/ and at https://<user>.github.io/<repo>/.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  worker: { format: "es" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    target: "es2022",
    chunkSizeWarningLimit: 1500,
  },
});
