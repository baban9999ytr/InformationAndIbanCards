import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-spa-fallback",
      apply: "build",
      closeBundle() {
        const outputDir = resolve(process.cwd(), "dist");
        copyFileSync(resolve(outputDir, "index.html"), resolve(outputDir, "404.html"));
      },
    },
  ],
  server: { port: 5174 },
  base: "/",
  build: { outDir: "dist" },
});
 