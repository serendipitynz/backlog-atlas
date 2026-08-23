<script lang="ts">
  import DetailSection from "../DetailSection.svelte";
  import GitHistory from "../GitHistory.svelte";
  import type { HistoryState } from "../../lib/detail";
  import { messages } from "../../lib/messages-context";
  import type { PlacementLayout } from "../../lib/placement";
  import type { DetailPlacement, ProjectEntry } from "../../lib/wire";

  interface Props {
    history: HistoryState;
    entry: ProjectEntry | null;
    layout: PlacementLayout;
    placement: DetailPlacement;
    onplacement: (placement: DetailPlacement) => void;
    onreloadHistory: () => void;
  }

  let { history, entry, layout, placement, onplacement, onreloadHistory }: Props = $props();

  const t = messages();
</script>

<DetailSection title={t().taskDetail.gitHistoryHeading} section="gitHistory" {layout}>
  <GitHistory
    {history}
    {entry}
    detail={layout.history}
    onexpand={placement === "full" ? null : () => onplacement("full")}
    onreload={onreloadHistory}
  />
</DetailSection>
