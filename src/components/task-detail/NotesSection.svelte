<script lang="ts">
  import Body from "../Body.svelte";
  import DetailSection from "../DetailSection.svelte";
  import Editor from "../Editor.svelte";
  import type { EditSession } from "../../lib/edit";
  import { setNotesMode } from "../../lib/edit";
  import type { ImageReader } from "../../lib/markdown-image";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";

  interface Props {
    implementationNotes: string | null;
    session: EditSession | null;
    setSession: (next: EditSession) => void;
    onchange: (value: string) => void;
    onsave: () => void;
    layout: PlacementLayout;
    onopenlink: (url: string) => void;
    readimage: ImageReader;
  }

  let {
    implementationNotes,
    session,
    setSession,
    onchange,
    onsave,
    layout,
    onopenlink,
    readimage,
  }: Props = $props();

  const t = messages();
</script>

<DetailSection title={t().taskDetail.notesHeading} section="notes" {layout}>
  {#if session === null}
    {#if implementationNotes}
      <Body source={implementationNotes} {onopenlink} {readimage} />
    {:else}
      <p class="neutral">{t().state.none}</p>
    {/if}
  {:else}
    <div class="modes">
      <button
        type="button"
        class="mini"
        class:on={session.draft.notesMode === "set"}
        onclick={() => setSession(setNotesMode(session, "set"))}
      >
        {t().taskDetail.notesReplace}
      </button>
      <button
        type="button"
        class="mini"
        class:on={session.draft.notesMode === "append"}
        onclick={() => setSession(setNotesMode(session, "append"))}
      >
        {t().taskDetail.notesAppend}
      </button>
    </div>
    <Editor
      label={session.draft.notesMode === "append" ? t().taskDetail.notesAppendLabel : t().taskDetail.notesHeading}
      value={session.draft.notes}
      {onchange}
      {onsave}
    />
  {/if}
</DetailSection>

<style lang="scss">
  @use "./shared" as shared;

  .modes {
    @include shared.control-group;

    button {
      @include shared.control-group-button;
    }
  }

  button {
    @include shared.button;
  }

  button.mini {
    @include shared.button-mini;
  }

  button.mini.on {
    @include shared.button-mini-on;
  }

  p {
    @include shared.paragraph;
  }

  .neutral {
    @include shared.neutral;
  }
</style>
