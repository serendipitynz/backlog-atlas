<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  // Skeleton placeholder screen. Real screens (swimlanes, task detail) arrive in
  // later tasks; the Ping button is a smoke test of the frontend<->Rust bridge.
  let greeting = $state("");

  async function ping(): Promise<void> {
    greeting = await invoke<string>("greet", { name: "Atlas" });
  }
</script>

<main class="shell">
  <h1>Backlog Atlas</h1>
  <p class="tagline">Tauri + Svelte skeleton</p>

  <button type="button" onclick={ping}>Ping Rust</button>
  {#if greeting}
    <p class="greeting">{greeting}</p>
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

  .greeting {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
