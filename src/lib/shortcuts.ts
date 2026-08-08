/**
 * 割り当て一覧 (doc-7 §2.1, TASK-56) as one module: every key this app answers, what it does, where
 * it is answered, whether it is answered while the caret is in a text field, and whether it stops the
 * key's default. doc-7 §2.1 asks for exactly that list in one place — until now each component decided
 * its own chord (`Editor.svelte`'s ⌘Enter) or declined to have one at all (`LaneCreate.svelte`, whose
 * comment names this list as what was missing), so there was nowhere to see that two surfaces had
 * taken the same chord, and nowhere to check the contract's clauses once instead of per component.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `band.ts` / `project-detail.ts`.
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-7 §2.1 割り当て一覧 | [`SHORTCUTS`] + [`ShortcutBinding`] | the 記録, all five 欄: chord, operation, 適用範囲, whether it fires in a text field, and what default it stops. §2.1 names this side and not the three columns the モーダル prints (TASK-125) |
 * | doc-7 §2.1 使える場所 | [`ShortcutScope`] + [`SCOPE_LABEL`] | 適用範囲: the closed set of 6 places an assignment is answered in |
 * | doc-7 §2.1 入力欄・編集部品の内側では単独キーを発火させない | [`textEntryFocused`] + [`ShortcutBinding.firesInTextEntry`] | 文字入力中: focus is inside an element that takes characters, so a bare key belongs to the text |
 * | doc-7 §2.1 修飾キーは macOS で Command、Windows・Linux で Control | [`Chord.mod`] + [`modifierLabel`] | 共通修飾キー: one modifier on the assignment's side, mapped to this OS's real key for matching, ARIA and spelling alike |
 * | doc-7 §2.1 preventDefault は要るキーだけに限り一覧に明記する | [`ShortcutBinding.preventsDefault`] | the default this key would otherwise take, or `null` when nothing is stopped |
 * | doc-7 §2.1 モーダルはフォーカスを内側に留め、Escape で閉じる | [`"modal"`] and [`"overlay"`] scopes | the trap is the modal's alone; Escape is shared with the menu and the value popover |
 *
 * ## 被せ層 (overlay) — why Escape is one row and not three
 *
 * 被せ層とは、現在の画面の上に開き、開いている間だけ操作を受け取る層 (登録・設定のモーダル、固定
 * ヘッダのメニュー、絞り込みの値一覧ポップオーバー) を指す。All three close on Escape and all three
 * consume the press where they are (`stopPropagation`), so they share one row; what only the modal does
 * is keep focus inside, which is why the Tab row is `"modal"` and not `"overlay"`.
 *
 * ## Why Escape is the one binding that fires in a text field
 *
 * doc-7 §2.1 suppresses bare keys inside text fields so that 文字入力が画面操作に取られない, and in the
 * same section requires a modal to close on Escape. A modal keeps focus inside itself, so its focus is
 * usually *in* a field — suppressing Escape there would leave the modal with no key that closes it and
 * contradict the モーダル clause. Escape types nothing, so answering it costs no character. It is
 * entered here as 入力欄内で発火する: はい, which is what §2.1's list is for.
 *
 * ## What is not decided here
 *
 * Nothing in this module reads the DOM or the platform. [`textEntryFocused`] is handed the focused
 * element, and [`modifierLabel`] the user agent string, so the whole contract is testable without a
 * browser — and the two facts stay one call each rather than being sniffed at every key press.
 */

// --- 適用範囲 (doc-7 §2.1 使える場所) -----------------------------------------------------------

/**
 * Where an assignment is answered. A closed set: a seventh place would need a row in the doc's list
 * before it could have a key, which is what keeps 一覧 = 実装.
 *
 * - `bothScreens` … スイムレーンとプロジェクト詳細画面のどちらでも (the fixed header is on both).
 * - `swimlane` … スイムレーンのみ (the grid and its フィルタ帯 have to be on screen).
 * - `overlay` … 被せ層の内側 (モーダル・メニュー・ポップオーバー).
 * - `modal` … モーダルの内側のみ.
 * - `editPart` … 編集部品の内側 (doc-8 §6.1).
 * - `laneCreate` … 列内新規タスク入力の内側 (doc-7 §4.1).
 */
export type ShortcutScope =
  | "bothScreens"
  | "swimlane"
  | "overlay"
  | "modal"
  | "editPart"
  | "laneCreate";

/**
 * The 使える場所 column, as the on-screen 一覧 words it. `bothScreens` names both screens rather than
 * counting them (TASK-125): 両画面 left *which* two off the screen entirely — the pair was only in the
 * TSDoc above. It is spelled with the same 短縮形 the `swimlane` row below uses, and that the way back
 * from プロジェクト詳細 prints (「← スイムレーン」), so the two rows can be read against each other.
 */
export const SCOPE_LABEL: Record<ShortcutScope, string> = {
  bothScreens: "スイムレーン・プロジェクト詳細",
  swimlane: "スイムレーン",
  overlay: "モーダル・メニュー・ポップオーバーの内側",
  modal: "モーダルの内側",
  editPart: "編集部品の内側",
  laneCreate: "列内新規タスク入力の内側",
};

// --- キーの組 (doc-7 §2.1 修飾キーの OS 対応) --------------------------------------------------

/**
 * One chord. `mod` is the 共通修飾キー: 共通修飾キーとは、macOS では Command、Windows・Linux では
 * Control に対応づく、割り当て側の 1 つの修飾キー指定を指す。doc-7 §2.1 asks for exactly that mapping —
 * one assignment on this side, one real key on the running OS — so the platform reaches matching, ARIA
 * and spelling alike, and the *other* platform's modifier is left alone.
 *
 * Accepting both everywhere was the first attempt and it was wrong (review [P2] on PR #34): on macOS,
 * Control+letter is native cursor movement in a text field, and these chords fire in text fields — so a
 * lenient match would take Control-N away from the editor while the screen only ever printed ⌘N.
 *
 * `shift` is `true` when Shift is part of the chord, absent when Shift must not be held, and
 * `"either"` for the one assignment that answers both (Tab / Shift+Tab, which differ in direction and
 * not in operation).
 */
export interface Chord {
  /** As `KeyboardEvent.key` reports it. Letters are compared case-insensitively. */
  key: string;
  mod?: boolean;
  shift?: boolean | "either";
}

/** Every operation that has a key. Closed, so a new chord cannot be added without a row below. */
export type ShortcutAction =
  | "openRegister"
  | "openSettings"
  | "toggleMenu"
  | "addFilter"
  | "undoFilter"
  | "closeOverlay"
  | "cycleModalFocus"
  | "saveEditSession"
  | "submitLaneCreate";

/** One row of the 割り当て一覧, minus the action that keys it. */
interface Assignment {
  chord: Chord;
  /** 操作: the words the 一覧 and the hint beside the control both use, so the two cannot diverge. */
  operation: string;
  scope: ShortcutScope;
  /** 入力欄内で発火するか (doc-7 §2.1). */
  firesInTextEntry: boolean;
  /**
   * What default this key would otherwise take, or `null` when nothing is stopped. doc-7 §2.1 limits
   * `preventDefault` to the keys that need it and requires the list to say so — a boolean would record
   * that a default is stopped without recording *which*, which is the part that can turn out wrong.
   */
  preventsDefault: string | null;
}

/**
 * The assignments, keyed by action so the compiler asks for one row per operation. The display order
 * is [`SHORTCUT_ORDER`]'s, held apart for the reason `band.ts` holds `BAND_ORDER` apart: an order that
 * lives in the shape of a literal is an order the next edit can change by accident.
 */
const ASSIGNMENTS: Record<ShortcutAction, Assignment> = {
  // The two 共通入口 fire with the caret in a field as well. doc-7 §2.1 withholds *bare* keys there,
  // to keep 文字入力 from being taken as 画面操作 — a modifier chord takes no character, and a 設定 that
  // stopped working while the フィルタ帯's box had focus would be a hole the user cannot see.
  openRegister: {
    chord: { key: "n", mod: true },
    operation: "プロジェクトを登録",
    scope: "bothScreens",
    firesInTextEntry: true,
    preventsDefault: "WebView の新規ウィンドウ",
  },
  openSettings: {
    chord: { key: ",", mod: true },
    operation: "設定",
    scope: "bothScreens",
    firesInTextEntry: true,
    preventsDefault: null,
  },
  toggleMenu: {
    chord: { key: "m" },
    operation: "メニューを開く／閉じる",
    scope: "bothScreens",
    firesInTextEntry: false,
    preventsDefault: null,
  },
  addFilter: {
    chord: { key: "f" },
    operation: "絞り込みを追加（値一覧を開く）",
    scope: "swimlane",
    firesInTextEntry: false,
    preventsDefault: null,
  },
  undoFilter: {
    chord: { key: "Backspace" },
    operation: "直前の絞り込みを 1 件戻す",
    scope: "swimlane",
    firesInTextEntry: false,
    preventsDefault: "履歴の「戻る」",
  },
  closeOverlay: {
    chord: { key: "Escape" },
    operation: "開いている層を閉じる",
    scope: "overlay",
    // See the module header: a modal keeps focus inside itself, so an Escape suppressed in fields
    // would leave it with no key that closes it — and Escape enters no character.
    firesInTextEntry: true,
    preventsDefault: null,
  },
  cycleModalFocus: {
    chord: { key: "Tab", shift: "either" },
    operation: "モーダル内の次／前の操作へ移動",
    scope: "modal",
    firesInTextEntry: true,
    preventsDefault: "フォーカスがモーダルの外へ出る",
  },
  saveEditSession: {
    chord: { key: "Enter", mod: true },
    // One operation with two words for it, because that is what the surface is: the chord confirms the
    // 編集部品 it is pressed in — 明示保存 in an 編集セッション (doc-8 §6.3), 作成 in the 新規タスク区画's
    // description field (doc-10 §7). Naming only 保存 would make the row wrong at the second.
    operation: "編集部品から発行（編集セッションは保存、作成フォームは作成）",
    scope: "editPart",
    firesInTextEntry: true,
    preventsDefault: "改行の入力",
  },
  submitLaneCreate: {
    chord: { key: "Enter", mod: true },
    operation: "列内新規タスクを作成",
    scope: "laneCreate",
    firesInTextEntry: true,
    preventsDefault: "改行の入力",
  },
};

/** The order the 一覧 is read in: 全体に効くもの → 画面のもの → 層の内側 → 入力の内側. */
export const SHORTCUT_ORDER: readonly ShortcutAction[] = [
  "openRegister",
  "openSettings",
  "toggleMenu",
  "addFilter",
  "undoFilter",
  "closeOverlay",
  "cycleModalFocus",
  "saveEditSession",
  "submitLaneCreate",
] as const;

/** One row of the 割り当て一覧 as anything reading the list sees it. */
export interface ShortcutBinding extends Assignment {
  action: ShortcutAction;
}

/** 割り当て一覧 (doc-7 §2.1), in reading order. The only list; nothing assigns a key outside it. */
export const SHORTCUTS: readonly ShortcutBinding[] = SHORTCUT_ORDER.map((action) => ({
  action,
  ...ASSIGNMENTS[action],
}));

/** One assignment by its operation, for the hint that has to sit beside that operation (AC #4). */
export function shortcutOf(action: ShortcutAction): ShortcutBinding {
  return { action, ...ASSIGNMENTS[action] };
}

// --- 表記 (doc-7 §2.1 修飾キーの OS 対応) -------------------------------------------------------

/**
 * Whether this is a macOS user agent, which decides which real modifier the 共通修飾キー maps to — for
 * matching as well as for spelling ([`Chord`]).
 *
 * Read from the user agent rather than through a new production dependency (`@tauri-apps/plugin-os`) or
 * a new boundary command: inside a WebView the string is fixed per platform (`Macintosh; Intel Mac OS X`
 * on WKWebView, `Windows NT` on WebView2, `X11; Linux` on WebKitGTK), and AGENTS.md wants a reason
 * before either alternative. A misread degrades consistently rather than silently: the hints then print
 * `Ctrl`, and `Ctrl` is what the matcher answers — a Mac keyboard has that key too — so the assignment
 * stays reachable and stays as advertised.
 */
export function isMacUserAgent(userAgent: string): boolean {
  return /Mac OS X|Macintosh|iPhone|iPad/.test(userAgent);
}

/** 共通修飾キー as this OS writes it. */
export function modifierLabel(mac: boolean): string {
  return mac ? "⌘" : "Ctrl";
}

function shiftLabel(mac: boolean): string {
  return mac ? "⇧" : "Shift";
}

/** The key's own name, spelled as a keyboard is labelled rather than as the DOM reports it. */
function keyLabel(key: string): string {
  if (key === "Escape") return "Esc";
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

function spell(chord: Chord, mac: boolean, shift: boolean): string {
  const parts: string[] = [];
  if (chord.mod === true) parts.push(modifierLabel(mac));
  if (shift) parts.push(shiftLabel(mac));
  parts.push(keyLabel(chord.key));
  // Apple writes chords without separators (⌘N); the Ctrl platforms write them with a plus (Ctrl+N).
  return mac ? parts.join("") : parts.join("+");
}

/** One chord as it is written beside its control and in the 一覧. */
export function chordLabel(chord: Chord, mac: boolean): string {
  const plain = spell(chord, mac, chord.shift === true);
  // Tab / Shift+Tab is one assignment with two directions, so both spellings are shown (doc-7 §2.1
  // wants the list to say which keys are taken, and Shift+Tab is taken too).
  return chord.shift === "either" ? `${plain} / ${spell(chord, mac, true)}` : plain;
}

/** The hint that goes beside an operation (AC #4 その操作の近くに併記する). */
export function shortcutHint(action: ShortcutAction, mac: boolean): string {
  return chordLabel(ASSIGNMENTS[action].chord, mac);
}

/**
 * The same assignment in `aria-keyshortcuts` form, so the chord reaches assistive technology as data
 * rather than only as the printed hint beside the control — the hint is drawn `aria-hidden`, since read
 * aloud as part of a button's name it would turn「設定」into「設定 ⌘,」.
 *
 * The running platform's modifier only, matching what is answered and what is printed. Listing both
 * would advertise a chord this OS does not take (review [P2] on PR #34).
 */
export function ariaKeyShortcuts(action: ShortcutAction, mac: boolean): string {
  const chord = ASSIGNMENTS[action].chord;
  const key = chord.key.length === 1 ? chord.key.toUpperCase() : chord.key;
  const shifted = chord.shift === true ? [`Shift+${key}`] : [key];
  const forms = chord.shift === "either" ? [key, `Shift+${key}`] : shifted;
  const modifier = mac ? "Meta" : "Control";
  return forms.map((form) => (chord.mod === true ? `${modifier}+${form}` : form)).join(" ");
}

// --- 文字入力中 (doc-7 §2.1) -------------------------------------------------------------------

/**
 * The elements that take characters: doc-7 §2.1's `input`・`textarea`・`contenteditable`, plus `select`
 * (a bare letter there is type-ahead selection) and the 編集部品 (doc-8 §6.1). The 編集部品 needs no
 * entry of its own — Ace edits through a `textarea` inside its host, so the focused element matches
 * `textarea` while the editor has the caret.
 */
export const TEXT_ENTRY_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** Just enough of `Element` to ask the question, so the rule is testable without a DOM. */
export interface FocusProbe {
  closest(selectors: string): unknown;
}

/**
 * 文字入力中 (doc-7 §2.1): whether the focused element is one that takes characters. `closest` rather
 * than `matches`, so focus inside a 編集部品's own furniture counts as being in the editor.
 */
export function textEntryFocused(focused: FocusProbe | null): boolean {
  return focused !== null && focused.closest(TEXT_ENTRY_SELECTOR) !== null;
}

// --- 照合 -------------------------------------------------------------------------------------

/** The parts of a `KeyboardEvent` the contract reads. A structural type, so tests need no DOM. */
export interface ShortcutKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** True for every keystroke of an IME composition (doc-7 §2.1). */
  isComposing: boolean;
  /**
   * The legacy code. Read only for `229`: macOS WebKit can report a composing keydown with
   * `isComposing === false` and this code (`Editor.svelte` has checked both since doc-8 §6.2).
   */
  keyCode: number;
}

/** Where the press happened, and whether the caret is in text. */
export interface ShortcutContext {
  /**
   * The 適用範囲 that are answering right now. The caller lists them because only it knows what is
   * open: the window handler passes `bothScreens` and — while the grid is up — `swimlane`, and passes
   * nothing at all while a modal is open, so a modal cannot be typed through.
   */
  scopes: readonly ShortcutScope[];
  /** [`textEntryFocused`]'s answer for the currently focused element. */
  textEntry: boolean;
  /**
   * Whether the 共通修飾キー is Command here (macOS) rather than Control. Part of *matching*, not only of
   * spelling: the other platform's modifier stays with the platform that uses it for something else —
   * on macOS, Control+letter moves the caret in a text field (review [P2] on PR #34).
   */
  mac: boolean;
}

function chordMatches(chord: Chord, event: ShortcutKeyEvent, mac: boolean): boolean {
  if (chord.key.toLowerCase() !== event.key.toLowerCase()) return false;
  if (chord.mod === true) {
    // 共通修飾キー: this OS's modifier alone. Not the other platform's — on macOS Control+letter moves
    // the caret in a text field, and these chords fire in text fields — and not both at once, which is
    // a chord of its own that this list does not take.
    if (!(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return false;
  } else if (event.metaKey || event.ctrlKey) {
    // A bare-key assignment takes no modifier at all: ⌘F and Ctrl+F belong to whatever else uses them,
    // not to the bare-key 絞り込み.
    return false;
  }
  if (chord.shift !== "either" && (chord.shift === true) !== event.shiftKey) return false;
  // No assignment uses Alt, so holding it is a different chord and not this one. Checked here rather
  // than left out, because ⌥ is how macOS types characters (⌥f is ƒ) and swallowing those presses
  // would take letters away from the very fields §2.1 protects.
  return !event.altKey;
}

/**
 * The assignment this press answers, or `null`. The whole of doc-7 §2.1's contract that is not about
 * modals lives here: IME composition wins over every assignment, a bare key loses to a text field, and
 * the caller's 適用範囲 decide which rows are even considered.
 *
 * The caller does the `preventDefault` itself, from the returned row's [`preventsDefault`]. It cannot be
 * done here: the argument is the structural [`ShortcutKeyEvent`] and not a `KeyboardEvent`, which is what
 * keeps the contract testable without a DOM. A matched press *is* Atlas's, so the caller stops the default
 * whether or not the operation turns out to be available — a chord that both did nothing and inserted a
 * newline would be worse than either.
 */
export function matchShortcut(
  event: ShortcutKeyEvent,
  context: ShortcutContext,
): ShortcutBinding | null {
  // IME の composition 中はいずれのショートカットも発火させない (doc-7 §2.1). First, and for every
  // assignment including the modifier ones: the composition owns the keyboard until it ends.
  if (event.isComposing || event.keyCode === 229) return null;
  for (const binding of SHORTCUTS) {
    if (!context.scopes.includes(binding.scope)) continue;
    if (context.textEntry && !binding.firesInTextEntry) continue;
    if (chordMatches(binding.chord, event, context.mac)) return binding;
  }
  return null;
}
