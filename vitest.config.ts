import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Kept separate from vite.config.ts, which is tuned for `tauri dev` (fixed port, Rust-side
// watch exclusions).
//
// Two projects rather than one (TASK-91). The 20 files that were here before test the swimlane's
// pure logic — column placement, cell ordering, filters — and needed neither a DOM nor the Svelte
// compiler; they keep running exactly as they did, in `node`. What TASK-91 adds is a second
// project that mounts components, which needs both. Splitting is what lets the first stay in
// `node`: a DOM given to all 418 of them would change the environment they have been passing in,
// and this task's job is to add a way to test components, not to re-qualify the existing tests.
//
// The two are told apart by filename (`*.component.test.ts`) rather than by directory, so a
// component's mounted test sits beside the component and beside the pure-logic test of the module
// it draws — which is where the next reader looks for it.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.component.test.ts"],
          environment: "node",
        },
      },
      {
        // The plugin only the mounting project needs: `mount` takes a compiled component, so the
        // `.svelte` imports in these tests have to go through the compiler.
        plugins: [svelte()],
        resolve: {
          // Svelte's exports map offers a server build and a client build, and `mount` is the
          // client one. Without this, the resolver takes the server build (Vitest's default is
          // the SSR-ish condition set) and mounting throws `lifecycle_function_unavailable`.
          conditions: ["browser"],
        },
        test: {
          name: "component",
          include: ["src/**/*.component.test.ts"],
          environment: "jsdom",
          // No `testTimeout` here on purpose (TASK-150). The 30s this carried was budget for one
          // test's dynamic import of mermaid, which now happens among that file's imports instead —
          // where no budget applies. With that moved, the slowest test in either project is 411ms,
          // measured on 2026-08-18 under twelve spinning processes on eight cores. CI's own runners
          // have not been measured; what stands in for that is the order of magnitude the 5s default
          // leaves over that reading. Raising it again would only hide a return of the same fault.
        },
      },
    ],
  },
});
