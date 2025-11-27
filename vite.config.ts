import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  build: {
    outDir: "../dist-web",
  },
  server: {
    port: 3000,
    host: true,
  },
  optimizeDeps: {
    exclude: ["ghostty-web"],
  },
});
