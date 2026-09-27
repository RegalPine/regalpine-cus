import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/cus/",
  root: "apps/designer",
  // @ts-ignore — @tailwindcss/vite ships its own Vite plugin types that conflict with vite@7
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      ...Object.fromEntries(
        ["core", "color", "palette", "theme", "validation", "export", "semantic"].map(
          (name) => [
            `@cus/${name}`,
            fileURLToPath(
              new URL(`./packages/${name}/src/index.ts`, import.meta.url),
            ),
          ],
        ),
      ),
      "@cus/ui": fileURLToPath(
        new URL("./packages/ui/src/index.tsx", import.meta.url),
      ),
    },
  },
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { port: 5173, strictPort: true },
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
