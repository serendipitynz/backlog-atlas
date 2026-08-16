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

import { msg } from "./messages";

/** Whether a theme is painted on a light or a dark ground — what its `color-scheme` declares. */
export type ThemeScheme = "light" | "dark";

export interface RecordedTheme {
  /** The stored name (`settings.toml` の `theme`) and the `data-theme` value. */
  id: string;
  /**
   * The colour set's own name. **Not translated** (decision-35 §5): eight of the ten are the names
   * their upstream projects publish, and the two Atlas wrote are named after the app — a reader
   * comparing this list against those projects reads the same words in either language.
   */
  name: string;
  scheme: ThemeScheme;
  /** One of the two 未選択 resolves to (decision-12 の既定), which its 呼び名 says. */
  isDefault?: true;
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
  { id: "atlas-light", name: "Atlas Light", scheme: "light", isDefault: true },
  { id: "atlas-dark", name: "Atlas Dark", scheme: "dark", isDefault: true },
  { id: "one-light", name: "One Light", scheme: "light" },
  { id: "one-dark", name: "One Dark", scheme: "dark" },
  { id: "solarized-light", name: "Solarized Light", scheme: "light" },
  { id: "solarized-dark", name: "Solarized Dark", scheme: "dark" },
  { id: "catppuccin-latte", name: "Catppuccin Latte", scheme: "light" },
  { id: "catppuccin-mocha", name: "Catppuccin Mocha", scheme: "dark" },
  { id: "rose-pine-dawn", name: "Rosé Pine Dawn", scheme: "light" },
  { id: "rose-pine", name: "Rosé Pine", scheme: "dark" },
];

export const RECORDED_THEME_IDS: string[] = RECORDED_THEMES.map((theme) => theme.id);

/**
 * 未選択. Named as what it does rather than as an absence: it is a working state, not a gap.
 *
 * It names no theme. The two this state resolves to are already marked 既定 in their own 呼び名 a
 * few rows below, and naming them here reads as though picking this option picks one of them — what
 * it picks is the state of following the system, which keeps following it when the system changes.
 */
export function themeUnsetLabel(): string {
  return msg().settings.themeUnset;
}

/** True when this build has the colour values for `name`. `null` (未選択) is always honourable. */
export function isRecorded(name: string | null): boolean {
  return name === null || RECORDED_THEME_IDS.includes(name);
}

/**
 * What the 設定画面 calls one theme: its own name, and its 明暗 in the word a user reads
 * (ライト／ダーク, light/dark). The word is *built* from [`RecordedTheme.scheme`] rather than written
 * beside it, because four of the ten names carry no 明暗 in either language (Catppuccin Latte /
 * Mocha, Rosé Pine Dawn / Rosé Pine) and a hand-written one could disagree with the ground the theme
 * actually paints — which reads correctly in the list and is wrong on screen.
 */
export function themeLabel(name: string): string | null {
  const theme = RECORDED_THEMES.find((recorded) => recorded.id === name);
  if (theme === undefined) {
    return null;
  }
  const text = msg().settings;
  const scheme = theme.scheme === "light" ? text.themeSchemeLight : text.themeSchemeDark;
  return theme.isDefault === true
    ? text.themeNameDefault(theme.name, scheme)
    : text.themeName(theme.name, scheme);
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

/**
 * The 明暗 in effect, given what `data-theme` carries and whether the OS asks for dark.
 *
 * Written as a function over both inputs rather than read from the DOM, so the rule can be asserted
 * without a document — and so it can be read beside `app.scss`, whose behaviour it mirrors exactly:
 * a recorded name selects that theme's ground, and **anything else** (no attribute at all, or a name
 * this build does not record) lands on the media query. The second case is not a fallback bolted on
 * here; it is what the stylesheet already does, because `:root[data-theme=…]` matches nothing for a
 * name it has no block for.
 *
 * The caller is 作図結果 (doc-11 §14.5): mermaid paints its own colours and needs to be told which
 * ground it is painting on, and this is the one thing about a theme that is not a CSS variable.
 */
export function themeScheme(attribute: string | null, prefersDark: boolean): ThemeScheme {
  const recorded = attribute === null ? undefined : RECORDED_THEMES.find((t) => t.id === attribute);
  return recorded?.scheme ?? (prefersDark ? "dark" : "light");
}
