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
  // **The size is `1em`.** The icon then follows the font-size of whatever box it sits in — the button
  // for an アイコンのみのボタン, the 帯 or 区画 for an 操作に属さないアイコン (doc-11 §2.4) — which is
  // the knob that already exists. An icon with a size prop of its own is a second knob that can
  // disagree with the text beside it.
  import { ICONS, ICON_STROKE_WIDTH, ICON_VIEWBOX, drawnShape, type IconName } from "./lucide";

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
  <!-- Every shape is drawn by whatever `drawnShape` names, so no kind can be silently skipped here —
       the exhaustiveness lives in that function, where the compiler holds it (see `lucide.ts`). Inside
       an `<svg>` the element is created in the SVG namespace, which is what makes this a real `<path>`. -->
  {#each ICONS[name] as shape}
    {@const drawn = drawnShape(shape)}
    <svelte:element this={drawn.tag} {...drawn.attrs} />
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
