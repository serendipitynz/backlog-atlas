<script lang="ts">
  // アイコン 1 個の描画 (doc-11 §2.4, TASK-67). One component for every icon rather than one file per
  // icon: the frame, the stroke, the colour and the `aria-hidden` are the same for all of them, and a
  // per-icon component would be ten copies of that agreement — the tenth of which could disagree.
  //
  // **The icon is always decorative** (`aria-hidden`), so it never contributes to a control's
  // accessible name. doc-11 §2.4 puts that name on the button (`aria-label`), because a figure has no
  // words: a screen reader given the `<svg>` to announce would read the button as unnamed, and the one
  // thing an アイコンのみのボタン must not be is unlabelled.
  //
  // **The size is `1em`.** The icon then follows the font-size of the button it sits in, which is the
  // knob that already exists — an icon with a size prop of its own is a second knob that can disagree
  // with the text beside it.
  import { ICONS, ICON_STROKE_WIDTH, ICON_VIEWBOX, type IconName } from "./lucide";

  interface Props {
    name: IconName;
  }

  let { name }: Props = $props();
</script>

<!-- Unkeyed: the figure of one icon is a fixed list that never reorders, and a key derived from the
     shape would be the very thing `header.ts` warns about (a key made from data that can repeat). -->
<svg
  viewBox={ICON_VIEWBOX}
  fill="none"
  stroke="currentColor"
  stroke-width={ICON_STROKE_WIDTH}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each ICONS[name] as shape}
    {#if shape.shape === "path"}
      <path d={shape.d} />
    {/if}
  {/each}
</svg>

<style lang="scss">
  svg {
    // 1em (doc-11 §2.4): the button's font-size decides how big the figure is.
    width: 1em;
    height: 1em;
    // `block` so the line box around an inline SVG cannot add height the button did not ask for.
    display: block;
  }
</style>
