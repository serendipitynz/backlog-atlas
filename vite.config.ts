import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// @ts-expect-error process is a Node.js global available at config-eval time
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],

  // Vite options tailored for Tauri development, applied during `tauri dev`/`build`.
  clearScreen: false, // 1. keep Rust errors from being cleared away
  server: {
    // 2. Tauri expects a fixed port and fails if it is unavailable
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. don't watch the Rust side from Vite
      ignored: ["**/src-tauri/**"],
    },
  },
});
