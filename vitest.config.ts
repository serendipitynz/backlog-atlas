import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts, which is tuned for `tauri dev` (fixed port, Rust-side
// watch exclusions) and loads the Svelte plugin. What is tested here is the swimlane's pure
// logic — column placement, cell ordering, filters — so the test run needs neither.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
