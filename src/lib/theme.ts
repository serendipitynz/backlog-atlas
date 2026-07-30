/**
 * 表示テーマ (decision-12) as the shell needs it: which colour sets this build records, what to call
 * them on screen, and which one `data-theme` should carry for a given stored choice. The colour
 * *values* are not here — `app.scss` holds every one of them (decision-12: 色値は表示テーマ 1 箇所),
 * and this module only ever names a theme.
 *
 * ## Referent table (doc term → identifier here)
 *
 * | term | here | is |
 * |---|---|---|
 * | decision-12 収録する表示テーマ | [`RECORDED_THEMES`] | the ten sets `app.scss` defines, in the order the 設定画面 lists them |
 * | decision-12 表示テーマの名前 | `RecordedTheme.id` | the value stored in `settings.toml` and written to `data-theme` |
 * | decision-12 既定は OS の明暗に追従 | [`themeAttribute`] returning `null` | no `data-theme` at all, which leaves the media query in `app.scss` in charge |
 * | decision-13 設定が読めないときは既定へ落ちる | [`isRecorded`] | whether a stored name is one this build can honour |
 *
 * The pairing with `app.scss` is checked rather than trusted: `theme.test.ts` compiles the stylesheet
 * and asserts that the recorded ids and the `[data-theme=…]` blocks are the same set. An id offered
 * by the 設定画面 with no block behind it would select a theme that paints nothing.
 */

/** Whether a theme is painted on a light or a dark ground — what its `color-scheme` declares. */
export type ThemeScheme = "light" | "dark";

export interface RecordedTheme {
  /** The stored name (`settings.toml` の `theme`) and the `data-theme` value. */
  id: string;
  /** What the 設定画面 calls it. */
  label: string;
  scheme: ThemeScheme;
}

/**
 * 収録する表示テーマ (decision-12): the ten sets, each of which clears the 収録条件 — every 族 と
 * `--info` at 4.5:1 or more against its own 12% 混色背景, on each surface an 印 sits on. The 検算 for
 * all of them runs in `theme.test.ts` off `app.scss`, so this list stays a list of names.
 *
 * Atlas Light / Atlas Dark come first because they are what 未選択 resolves to (decision-12 の既定);
 * the borrowed eight follow in the order 設計案 05 presents them, light before dark within each pair.
 */
export const RECORDED_THEMES: RecordedTheme[] = [
  { id: "atlas-light", label: "Atlas Light（明・既定）", scheme: "light" },
  { id: "atlas-dark", label: "Atlas Dark（暗・既定）", scheme: "dark" },
  { id: "one-light", label: "One Light（明）", scheme: "light" },
  { id: "one-dark", label: "One Dark（暗）", scheme: "dark" },
  { id: "solarized-light", label: "Solarized Light（明）", scheme: "light" },
  { id: "solarized-dark", label: "Solarized Dark（暗）", scheme: "dark" },
  { id: "catppuccin-latte", label: "Catppuccin Latte（明）", scheme: "light" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha（暗）", scheme: "dark" },
  { id: "rose-pine-dawn", label: "Rosé Pine Dawn（明）", scheme: "light" },
  { id: "rose-pine", label: "Rosé Pine（暗）", scheme: "dark" },
];

export const RECORDED_THEME_IDS: string[] = RECORDED_THEMES.map((theme) => theme.id);

/** 未選択. Named as what it does rather than as an absence: it is a working state, not a gap. */
export const THEME_UNSET_LABEL = "OS の明暗に従う（既定: Atlas Light / Atlas Dark）";

/** Why the 明暗 of the borrowed sets is stated in every label, said once where the list is shown. */
export const THEME_LIST_NOTE =
  "明暗は表示テーマごとに決まっています。OS の明暗に従うのは「未選択」のときだけです（decision-12）。";

/** True when this build has the colour values for `name`. `null` (未選択) is always honourable. */
export function isRecorded(name: string | null): boolean {
  return name === null || RECORDED_THEME_IDS.includes(name);
}

export function themeLabel(name: string): string | null {
  return RECORDED_THEMES.find((theme) => theme.id === name)?.label ?? null;
}

/**
 * The `data-theme` value for a stored choice, or `null` for no attribute at all.
 *
 * `null` in and `null` out is 未選択: the attribute is *removed* rather than set to a resolved
 * "atlas-dark", so that the OS switching light↔dark mid-session is followed by the media query in
 * `app.scss` without the shell watching for it (decision-12 既定は OS の明暗に追従).
 *
 * A name this build does not record also returns `null`. Writing it through would put the page on an
 * attribute no block matches, which paints the same as no attribute — but saying so here is what lets
 * the 設定画面 tell the user their stored theme is not in this build instead of leaving them with a
 * selection that silently does nothing (decision-13 の縮退: 設定が読めないときは既定へ落ちる).
 */
export function themeAttribute(chosen: string | null): string | null {
  return chosen !== null && isRecorded(chosen) ? chosen : null;
}
