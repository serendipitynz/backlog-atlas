<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  // Skeleton placeholder screen. Real screens (swimlanes, task detail) arrive in
  // later tasks. The button now exercises a real command instead of a smoke-test
  // one: `cli_probe` is the boundary's smallest read, and its answer is what
  // decides whether the coming screens may offer edits at all (doc-5 §5 縮退).
  type CliReadiness =
    | { state: "ready"; version: string }
    | { state: "unavailable"; detail: string }
    | { state: "unsupported"; version: string; minimum: string };

  let readiness = $state<CliReadiness | null>(null);

  async function probe(): Promise<void> {
    readiness = await invoke<CliReadiness>("cli_probe");
  }

  function describe(state: CliReadiness): string {
    switch (state.state) {
      case "ready":
        return `backlog ${state.version} — updates available`;
      case "unsupported":
        return `backlog ${state.version} — read-only, ${state.minimum} or newer required`;
      case "unavailable":
        return `no usable backlog CLI — read-only (${state.detail})`;
    }
  }
</script>

<main class="shell">
  <h1>Backlog Atlas</h1>
  <p class="tagline">Tauri + Svelte skeleton</p>

  <button type="button" onclick={probe}>Probe Backlog CLI</button>
  {#if readiness}
    <p class="readiness">{describe(readiness)}</p>
  {/if}
</main>

<style lang="scss">
  .shell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 100vh;
    padding: 2rem;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 2rem;
  }

  .tagline {
    margin: 0;
    opacity: 0.7;
  }

  button {
    padding: 0.5rem 1.25rem;
    font: inherit;
    cursor: pointer;
    border: 1px solid currentColor;
    border-radius: 6px;
    background: transparent;
    color: inherit;
  }

  .readiness {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
