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
 * | doc-7 §2.1 割り当て一覧 | [`shortcuts`] + [`ShortcutBinding`] | the 記録, all five 欄: chord, operation, 適用範囲, whether it fires in a text field, and what default it stops. §2.1 names this side and not the three columns the モーダル prints (TASK-125) |
 * | doc-7 §2.1 使える場所 | [`ShortcutScope`] + [`scopeLabel`] | 適用範囲: the closed set of 6 places an assignment is answered in |
 * | doc-7 §2.1 入力欄・編集部品の内側では単独キーを発火させない | [`textEntryFocused`] + [`ShortcutBinding.firesInTextEntry`] | 文字入力中: focus is inside an element that takes characters, so a bare key belongs to the text |
 * | doc-7 §2.1 修飾キーは macOS で Command、Windows・Linux で Control | [`Chord.mod`] + [`modifierLabel`] | 共通修飾キー: one modifier on the assignment's side, mapped to this OS's real key for matching, ARIA and spelling alike |
 * | doc-7 §2.1 preventDefault は要るキーだけに限り一覧に明記する | [`ShortcutBinding.preventsDefault`] | the default this key would otherwise take, or `null` when nothing is stopped |
 * | doc-7 §2.1 モーダルはフォーカスを内側に留め、Escape で閉じる | [`"modal"`] and [`"overlay"`] scopes | the trap is the modal's alone; Escape is shared with the menu and the value popover |
 *
 * ## 被せ層 (overlay) — why Escape is one row and not three
 *
 * 被せ層とは、現在の画面の上に開き、開いている間だけ操作を受け取る層 (登録・設定のモーダル、共通
 * 入口のメニュー、絞り込みの値一覧ポップオーバー) を指す。All three close on Escape and all three
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

import { msg } from "./messages";

// --- 適用範囲 (doc-7 §2.1 使える場所) -----------------------------------------------------------

/**
 * Where an assignment is answered. A closed set: a seventh place would need a row in the doc's list
 * before it could have a key, which is what keeps 一覧 = 実装.
 *
 * - `bothScreens` … スイムレーンとプロジェクト詳細画面のどちらでも (the ☰'s menu is on both).
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
 * from プロジェクト詳細 prints, so the two rows can be read against each other.
 */
export function scopeLabel(scope: ShortcutScope): string {
  return msg().shortcutHelp.scope[scope];
}

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

/**
 * One row of the 割り当て一覧, minus the action that keys it and minus the two 欄 that are words.
 *
 * 操作 and the name of the default this key stops are the 文言表's (`shortcutHelp.assignment`), keyed
 * by the same [`ShortcutAction`] — so the row's rule and the row's words are still one list, read
 * together by [`shortcutOf`].
 */
interface Assignment {
  chord: Chord;
  scope: ShortcutScope;
  /** 入力欄内で発火するか (doc-7 §2.1). */
  firesInTextEntry: boolean;
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
    scope: "bothScreens",
    firesInTextEntry: true,
  },
  openSettings: {
    chord: { key: ",", mod: true },
    scope: "bothScreens",
    firesInTextEntry: true,
  },
  toggleMenu: {
    chord: { key: "m" },
    scope: "bothScreens",
    firesInTextEntry: false,
  },
  // A bare key is only answered while the caret is *outside* a field, so its character normally lands
  // nowhere — but this operation moves the caret into one. The popover focuses its 検索欄 from an
  // `$effect`, which runs before the browser performs the keydown's default, so the `f` arrives in the
  // box the press just opened and the list is filtered to the values containing one — none at all,
  // where the values are Japanese, which reads as 絞り込める値が無い (TASK-129). Stopping the default is
  // what §2.1 provides for; the alternatives were worse — not focusing the 検索欄 puts the keystrokes
  // that follow nowhere the user can see (`FilterPopover.svelte`), and deferring the focus past the
  // default ties the popover to when a particular engine performs it.
  addFilter: {
    chord: { key: "f" },
    scope: "swimlane",
    firesInTextEntry: false,
  },
  undoFilter: {
    chord: { key: "Backspace" },
    scope: "swimlane",
    firesInTextEntry: false,
  },
  closeOverlay: {
    chord: { key: "Escape" },
    scope: "overlay",
    // See the module header: a modal keeps focus inside itself, so an Escape suppressed in fields
    // would leave it with no key that closes it — and Escape enters no character.
    firesInTextEntry: true,
  },
  cycleModalFocus: {
    chord: { key: "Tab", shift: "either" },
    scope: "modal",
    firesInTextEntry: true,
  },
  saveEditSession: {
    chord: { key: "Enter", mod: true },
    scope: "editPart",
    firesInTextEntry: true,
  },
  submitLaneCreate: {
    chord: { key: "Enter", mod: true },
    scope: "laneCreate",
    firesInTextEntry: true,
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
  /** 操作: the words the 一覧 and the hint beside the control both use, so the two cannot diverge. */
  operation: string;
  /**
   * What default this key would otherwise take, or `null` when nothing is stopped. doc-7 §2.1 limits
   * `preventDefault` to the keys that need it and requires the list to say so — a boolean would record
   * that a default is stopped without recording *which*, which is the part that can turn out wrong.
   * The 文言表 answers for every action, `null` included, so a key that stops a default in one
   * language cannot stop nothing in the other.
   *
   * A 単独キー needs one whenever its operation moves focus into something that takes characters:
   * [`firesInTextEntry`] keeps the press out of a field that *already* holds the caret, but it cannot
   * see a field the operation itself opens, and the key's own character reaches that field after the
   * handler returns (TASK-129).
   */
  preventsDefault: string | null;
}

/** 割り当て一覧 (doc-7 §2.1), in reading order. The only list; nothing assigns a key outside it. */
export function shortcuts(): ShortcutBinding[] {
  return SHORTCUT_ORDER.map((action) => shortcutOf(action));
}

/** One assignment by its operation, for the hint that has to sit beside that operation (AC #4). */
export function shortcutOf(action: ShortcutAction): ShortcutBinding {
  return { action, ...ASSIGNMENTS[action], ...msg().shortcutHelp.assignment[action] };
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
  if (key === "Escape") {
    return "Esc";
  }
  if (key === " ") {
    return "Space";
  }
  return key.length === 1 ? key.toUpperCase() : key;
}

function spell(chord: Chord, mac: boolean, shift: boolean): string {
  const parts: string[] = [];
  if (chord.mod === true) {
    parts.push(modifierLabel(mac));
  }
  if (shift) {
    parts.push(shiftLabel(mac));
  }
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
  /** True when the OS is repeating a key the user has not released ([`continuesHeldPress`]). */
  repeat: boolean;
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
  if (chord.key.toLowerCase() !== event.key.toLowerCase()) {
    return false;
  }
  if (chord.mod === true) {
    // 共通修飾キー: this OS's modifier alone. Not the other platform's — on macOS Control+letter moves
    // the caret in a text field, and these chords fire in text fields — and not both at once, which is
    // a chord of its own that this list does not take.
    if (!(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) {
      return false;
    }
  } else if (event.metaKey || event.ctrlKey) {
    // A bare-key assignment takes no modifier at all: ⌘F and Ctrl+F belong to whatever else uses them,
    // not to the bare-key 絞り込み.
    return false;
  }
  if (chord.shift !== "either" && (chord.shift === true) !== event.shiftKey) {
    return false;
  }
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
  if (event.isComposing || event.keyCode === 229) {
    return null;
  }
  for (const action of SHORTCUT_ORDER) {
    const binding = { action, ...ASSIGNMENTS[action] };
    if (!context.scopes.includes(binding.scope)) {
      continue;
    }
    if (context.textEntry && !binding.firesInTextEntry) {
      continue;
    }
    if (chordMatches(binding.chord, event, context.mac)) {
      return shortcutOf(action);
    }
  }
  return null;
}

/**
 * 押下の継続: whether this keydown is the OS repeating a key the caller has already answered and
 * stopped, rather than a new press. `held` is that key (as [`Chord.key`] spells it, lower-cased), and
 * `null` while the caller is holding none — only the caller knows which press it answered, so the key
 * lives there and this decides what it means.
 *
 * A repeat has to be told apart because the operation an assignment runs can move focus into a field.
 * [`matchShortcut`] then withholds the row — doc-7 §2.1's 単独キーの抑止 reads where the caret is, not
 * which press is under way — and the key's own character lands in the box the press itself opened
 * (TASK-129: holding `F` filled the 値一覧's 検索欄 with `f`s). **A repeat is not 文字入力**: the user
 * has not let go of a key they pressed against a screen that had no field in it, so the whole press
 * stays the caller's and its default stays stopped.
 *
 * The operation is *not* re-issued for a repeat — only the default is stopped. A held key that kept
 * matching goes on answering as before (holding Backspace undoes one 絞り込み per repeat), because
 * that press never stopped matching and never reaches here.
 */
export function continuesHeldPress(event: ShortcutKeyEvent, held: string | null): boolean {
  return event.repeat && held !== null && event.key.toLowerCase() === held;
}
