/**
 * アプリ設定 (decision-13), as pure functions. `Settings.svelte` is markup over these values: what each
 * item is called, what the choices are, what the screen says when the values in hand are the defaults,
 * and how the 外部エディタ指定 is read out of two form fields. Nothing here calls the boundary.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `external-editor.ts` and the Rust modules' convention.
 *
 * | term | here | is |
 * |---|---|---|
 * | decision-13 既定値で動いている旨 | [`statusNotice`] | why these values are the defaults, in one sentence the screen shows (AC #6) |
 * | decision-13 未知の上位版は上書きしない | [`saveAvailability`] | whether 保存 may be pressed, and the reason when it may not |
 * | doc-8 §7 外部エディタ指定 | [`editorCommandOf`] / [`editorArgsText`] | the 起動指定 as two form fields ↔ one `EditorCommand` |
 * | decision-29 外部コマンド指定 | [`EXTERNAL_COMMANDS`] + [`commandPathOf`] | the three executables the form can name, and one field ↔ one optional path |
 * | decision-29 解決結果の表示 | [`programSourceLabel`] / [`probeSummary`] | what the panel says about the program actually in use |
 * | decision-12 表示テーマ | `theme.ts` の `RECORDED_THEMES` | the colour sets this build has; named there, defined in `app.scss` |
 * | doc-7 §5.2 既定の保存区分 | [`storageSelectionLabel`] + [`toggleStorage`] | which 保存区分 the filter starts with |
 * | doc-8 §2.2 既定の詳細配置・doc-7 §5.4 既定の並び順（フォームの外から書かれる項目） | [`mergeDraft`] | how a value stored elsewhere lands in an open form without taking its input |
 * | doc-7 §5.4 並び順の語 | `swimlane.ts` の `CARD_ORDERS` | the ten orders and their screen words; this module only carries the value through |
 * | TASK-74 下部操作行 | [`closeWithoutSavingLabel()`] / [`saveLabel()`] | the two ways out of the モーダル, named in one place |
 * | TASK-75 場所を開く | [`openLocationLabel()`] / [`openLocationAvailability`] | opening the アプリ設定ディレクトリ (decision-13), and when it cannot be opened |
 * | doc-3 §2.1 フォルダの有無 | [`openLocationAvailability`] の `present` | whether the folder that control opens is there yet — the boundary's answer, not this module's |
 *
 * One rule runs through it, the same one `edit.ts` and `external-editor.ts` follow: **a withheld
 * control says why** (doc-5 §5, doc-11 §5). No item is hidden because it cannot be changed yet or
 * because saving is refused — it is shown, disabled, with the reason beside it.
 */

import type {
  AppSettings,
  CardDensity,
  CommandError,
  DetailPlacement,
  ExternalProgramSource,
  ProbeOutcome,
  EditorCommand,
  SettingsStatus,
  StorageSelection,
} from "./wire";
import { commandErrorDetail } from "./edit";
import { launchRefusalText, probeFailureText } from "./failure";
import { msg } from "./messages";

/**
 * The three 段 and the three 配置, in the order their controls list them.
 *
 * Written out rather than derived from the 文言表 (`Object.keys` over a catalog group would do it):
 * the order a control offers its options in is this screen's, not the catalog's, and a catalog whose
 * entries were re-ordered for reading would silently re-order the radios.
 */
export const CARD_DENSITIES: readonly CardDensity[] = ["s", "m", "l"];

export const DETAIL_PLACEMENTS: readonly DetailPlacement[] = ["sidebar", "modal", "full"];

export function cardDensityLabel(density: CardDensity): string {
  return msg().settings.cardDensity[density];
}

export function detailPlacementLabel(placement: DetailPlacement): string {
  return msg().settings.detailPlacement[placement];
}

/**
 * 保存区分 as the 既定の保存区分 control names it. The four divisions keep their bare names for
 * `token.ts`'s reason (decision-35 §5 の識別子); `indeterminate` is not one of them but the absence
 * of one, so it is a sentence.
 */
export function storageSelectionLabel(selection: StorageSelection): string {
  return selection === "indeterminate" ? msg().settings.storageIndeterminate : selection;
}

export const STORAGE_SELECTIONS: StorageSelection[] = [
  "active",
  "draft",
  "completed",
  "archive",
  "indeterminate",
];

/**
 * カード情報量 (doc-7 §3) が**減らさないもの**だけを言う。段の違いは選択肢そのものが述べているので、
 * 何が増えるかは書かない (doc-11 §8 の状態の言い換え) — 残すのは、S を選ぶと不整合印まで消えると
 * 読まれかねない一点だけである。保存時に効くことも、保存が唯一の書き手であることも同じ理由で落とした
 * (2026-08-08 の目視)。
 */
export function cardDensityNote(): string {
  return msg().settings.cardDensityNote;
}

/**
 * decision-13 既定値で動いている旨 (AC #6): why the values in hand are the defaults, or `null` when they
 * came from the file. Split by cause because the three lead to different expectations — a first run
 * needs no action, a corrupt file will be rebuilt by the next save, and a newer file will not be
 * written at all.
 */
export function statusNotice(status: SettingsStatus): string | null {
  const text = msg().settings;
  switch (status.state) {
    case "stored":
      return null;
    case "absent":
      return text.fileAbsent;
    case "unreadable":
      return text.fileUnreadable(status.detail);
    case "readOnly":
      return text.fileReadOnly(status.version);
  }
}

/** Whether 保存 may be pressed, and why not (decision-13: an unknown newer file is never clobbered). */
export function saveAvailability(status: SettingsStatus): { enabled: boolean; reason: string | null } {
  return status.state === "readOnly"
    ? { enabled: false, reason: msg().settings.saveRefusedNewer(status.version) }
    : { enabled: true, reason: null };
}

/**
 * The 外部エディタ指定 as the form holds it: a program field and one argument per line. Split fields
 * rather than one command line, because doc-8 §7 passes the 起動指定 as an argument array and never as a
 * shell string — a single line would have to be split by something, and only a shell splits command
 * lines properly (AGENTS). It also lets an editor whose path contains a space be named at all, which
 * `$VISUAL` cannot express.
 */
export function editorArgsText(command: EditorCommand | undefined): string {
  return (command?.args ?? []).join("\n");
}

/**
 * Build the 外部エディタ指定 from the two fields, or `undefined` to clear it — an empty program means
 * "fall through to `$VISUAL`/`$EDITOR`" (doc-8 §7 の解決順), which is also how the Rust side reads a
 * blank one. Arguments are one per line; blank lines are dropped, and no line is split further, so an
 * argument may itself contain spaces.
 */
export function editorCommandOf(program: string, argsText: string): EditorCommand | undefined {
  const trimmed = program.trim();
  if (trimmed === "") {
    return undefined;
  }
  return {
    program: trimmed,
    args: argsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  };
}

/**
 * One 外部コマンド指定 as the file holds it (decision-29): a trimmed absolute path, or `undefined` to
 * clear the item so the key is skipped. Trimming is the form's, not the resolution's — decision-29
 * uses a configured path as written, and this only decides what the field means by "empty". A path
 * that is nothing but whitespace names no program, and storing it would spend every launch on a
 * spawn error the user could not see the cause of.
 */
export function commandPathOf(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * The 外部コマンド the form can name, in the order the 区画 lists them (decision-29).
 *
 * `backlog` is first because it is the one whose absence stops an operation the user asked for; the
 * other two degrade quietly, which is why they are here at all (TASK-156). The `field` is the
 * `AppSettings` key *and* the `settings.toml` key — doc-3 §2.2's hand-editing rule means the name in
 * the file is the name a user reads about.
 *
 * `help` is not shown beside the field. It sits behind the row's `?` (doc-11 §8 keeps screen text to
 * what the screen has to say; a paragraph under every input states three things a user reading the
 * fourth does not need). The row's own icon already says whether the command resolved, so `help`
 * carries only what the icon cannot: what Atlas uses this command *for*, and therefore what stops
 * working when it is not found.
 */
export const EXTERNAL_COMMANDS = [
  { field: "backlog_cli", name: "backlog", label: "Backlog CLI" },
  { field: "git_cli", name: "git", label: "Git" },
  { field: "gh_cli", name: "gh", label: "GitHub CLI" },
] as const satisfies readonly {
  field: "backlog_cli" | "git_cli" | "gh_cli";
  name: string;
  /** The product's own name, which is not translated (decision-35 §5). */
  label: string;
}[];

/** Which command a row is. The three the 外部コマンド 区画 offers, and no more. */
export type ExternalCommandField = (typeof EXTERNAL_COMMANDS)[number]["field"];

/** What Atlas uses one external command *for*, and therefore what stops when it is not found. */
export function externalCommandHelp(field: ExternalCommandField): string {
  return msg().settings.externalCommandHelp[field];
}

/** 解決結果の出どころ (decision-29) in the panel's words. Shown inside the row's `?`, not beside it. */
export function programSourceLabel(source: ExternalProgramSource): string {
  return msg().settings.programSource[source];
}

/**
 * One 解決結果 as a sentence, for the row's `?` (decision-29). The failure states why: it is the only
 * text that distinguishes "not installed" from "installed where this process cannot see it", which is
 * the distinction TASK-156 was raised about.
 *
 * **It goes through `probeFailureText` rather than printing `detail`.** Since decision-35 §3 the
 * boundary sends a 失敗理由符号 and no sentence, and the two ordinary failures here — a `--version`
 * that does not answer inside the probe's bound, and a program that exits writing nothing to stderr —
 * carry an empty `detail`. Printed raw, both would read 「起動できません（）」, which is the one thing
 * this line exists not to say.
 */
export function probeSummary(outcome: ProbeOutcome): string {
  return outcome.state === "launched"
    ? outcome.report
    : msg().settings.probeUnlaunched(probeFailureText(outcome.reason, outcome.detail));
}

/**
 * Whether the row's leading 印 says resolved (doc-11 §2.4 の 状態の印). `null` while the probe has
 * not answered — drawn as neither state rather than as "not resolved", since a probe still running
 * is not a failure and an icon that guessed would flash the alarm on every open.
 */
export function programResolved(outcome: ProbeOutcome | null): boolean | null {
  return outcome === null ? null : outcome.state === "launched";
}

/**
 * Add or remove one 保存区分 from the 既定の保存区分 (doc-7 §5.2). Kept as a function so the order is
 * stable — `STORAGE_SELECTIONS`' order, not click order — which is what makes the saved file and the
 * checkbox list read the same on the next start.
 */
export function toggleStorage(
  selection: StorageSelection[],
  value: StorageSelection,
  on: boolean,
): StorageSelection[] {
  const next = new Set(selection);
  if (on) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return STORAGE_SELECTIONS.filter((candidate) => next.has(candidate));
}

/**
 * What the screen warns when 既定の保存区分 is empty, or `null` when it is not. An empty selection is a
 * legal filter state (doc-7 §5.2 makes 保存区分 a positive selection: what is selected is shown), so it
 * is not refused — but as a *startup* default it means a grid with no cards and no visible cause,
 * which the user should not meet without having been told.
 */
export function emptyStorageWarning(selection: StorageSelection[]): string | null {
  return selection.length === 0 ? msg().settings.emptyStorageWarning : null;
}

/**
 * 継続検出を切っている旨 (doc-9 §3.1) as the settings screen states it. doc-9 §3.1 requires the
 * *state* to look the same as a watch that failed to start — only the reason differs — so this text
 * says what stops and what still works, and does not invent a second state name.
 */
export function watchOffNote(): string {
  return msg().settings.watchOffNote;
}

/**
 * 下部操作行 (TASK-74) の 2 つの押下。「変更せずに閉じる」は下書きを書かずに出る経路で、「保存する」は
 * 書けたときだけ出る経路である。語を定数に持つのは、この 2 つが `Settings.svelte` の外（コンポーネント
 * テストの引き当て）からも同じ 1 か所を見て名指しされるようにするためで、寸法の変数と同じ理由による。
 */
export function closeWithoutSavingLabel(): string {
  return msg().settings.closeWithoutSaving;
}

export function saveLabel(): string {
  return msg().settings.save;
}

/**
 * 「保存する」が押せない理由のうち、変更が無いことだけを述べるもの (TASK-74 AC #3)。**可視の補助文には
 * しない** — 下部操作行が 2 つの出口を常に見せているので、押せないことの説明は画面の語を増やすだけになる。
 * それでも doc-11 §5 は理由の無い無効化を禁じているので、控えは `aria-disabled` のままフォーカスを受け、
 * この文を `aria-describedby` で読める場所に置く（同節が挙げる 2 つ目の形）。
 */
export function noChangesReason(): string {
  return msg().settings.noChanges;
}

/** 「保存する」が押せない理由のうち、保存の発行中であることを述べるもの。 */
export function savingReason(): string {
  return msg().action.savingNow;
}

/** 場所を開く (TASK-75 AC #1)。開くのはアプリ設定ディレクトリで、ファイルは選択されない。 */
export function openLocationLabel(): string {
  return msg().settings.openLocation;
}

/**
 * 開く先を「2 つのファイルのあるフォルダ」と述べる。台帳ファイルは同じフォルダにあり (doc-3 §2.1)、
 * 控えが 1 つで足りる理由がそれである。行が現に描かれているかを数えないのは、パスの解決が片方だけ
 * 失敗しても、フォルダがどちらのものかは変わらないため。
 */
export function openLocationTitle(): string {
  return msg().settings.openLocationTitle;
}

/** 起動を発行してから応答が返るまでの、場所を開く の理由。 */
export function openingLocationReason(): string {
  return msg().settings.openingLocation;
}

/**
 * フォルダがまだ無いときの、場所を開く の理由。**述べるのはフォルダであって、その中のファイルの有無
 * ではない** (doc-3 §2.1)。作る手立てを 2 つとも挙げるのは、どちらの保存でもフォルダが作られるから
 * である — 設定の保存はこのフォームの中にあり、登録はこのモーダルの外にある。
 */
export function locationAbsentReason(): string {
  return msg().settings.locationAbsent;
}

/**
 * フォルダの有無の答えがまだ手元に無いときの、場所を開く の理由。**「フォルダが無い」と書き分ける** —
 * 問い合わせが返っていない、あるいはその問い合わせ自体が失敗した状態で、フォルダが無いことは分かって
 * いない。分けないと、測っていないことを測ったかのように述べることになる。
 */
export function locationUnconfirmedReason(): string {
  return msg().settings.locationUnconfirmed;
}

/**
 * 場所を開く の 保留判定 と 保留理由 (TASK-75 AC #3、doc-11 §5)。判定を理由文の非 null で代えないのは
 * 同節のためで、兼ねさせると理由文を落とした日に無効化まで一緒に落ちる。
 *
 * 判定が読むのは**フォルダの有無**であって、設定ファイルが書かれているかではない (doc-3 §2.1)。
 * 控えが開くのはフォルダで、そのフォルダは台帳・アプリ設定のどちらかを最初に保存した時点で作られる
 * ので、**プロジェクトを 1 件登録して設定を一度も保存していない状態でも開ける** — TASK-144 まではその
 * 状態で押せず、しかも理由は利用者が必要としていない別のファイルについて述べていた。読めない・上位版の
 * ファイルも同じ判定に収まる: ファイルが**ある**ならフォルダもあり、手で直すならまさにそこを開く必要が
 * ある。
 *
 * 発行中を状態ではなく**理由**として持つのも doc-11 §5 のためで、控えが `aria-disabled` になる間ずっと
 * `aria-describedby` の指す先が空だと、それは同節が禁じる理由の無い無効化そのものになる。
 */
export function openLocationAvailability(
  present: boolean | null,
  opening: boolean,
): { enabled: boolean; reason: string | null } {
  if (opening) {
    return { enabled: false, reason: openingLocationReason() };
  }
  if (present === null) {
    return { enabled: false, reason: locationUnconfirmedReason() };
  }
  if (!present) {
    return { enabled: false, reason: locationAbsentReason() };
  }
  return { enabled: true, reason: null };
}

/**
 * 場所を開く の失敗文 (doc-5 §5「withheld control says why」と同じ姿勢で、起きたことを述べる)。
 * `launchFailureDetail` (external-editor.ts) と分けてあるのは、あちらの助言が `.md` の関連付けと
 * $VISUAL・$EDITOR を名指すためで、ディレクトリを開けなかった利用者にはどちらも関係が無い。
 */
export function openLocationFailure(error: CommandError): string {
  switch (error.kind) {
    case "editorLaunchFailed":
      return msg().settings.openLocationFailed(
        error.program,
        launchRefusalText(error.reason, error.detail),
      );
    case "editorUnavailable":
      return msg().settings.openLocationUnavailable(msg().failure.editorUnavailable);
    default:
      return commandErrorDetail(error);
  }
}

/**
 * Fold a baseline that arrived from *outside* the 設定画面 into the draft it is editing: every field the
 * user has changed away from the previous baseline stays as they left it, and the rest comes from the
 * new one. `baseline`/`draft` are `null` before the form has anything to protect, which is the plain
 * "seed from the new values" case.
 *
 * Needed because アプリ設定 has writers outside this form: choosing a 詳細配置 (doc-8 §2.2) or a 並び順
 * (doc-7 §5.4) stores it as the 既定, and folding a column or row, or hiding one, stores that too
 * (doc-7 §5.1 since decision-13 の 再起動をまたぐ保持の改訂) — all of them while the 設定画面 may be open
 * over the same screen with unsaved input, and any of them can be the one that lands. Re-seeding the whole form on
 * that write would take the input away — which doc-8 §6.4 forbids of the detail panel's 編集セッション,
 * and the same reasoning applies to this form: an edit the user is in the middle of is not the writer's
 * to discard. Adopting the incoming value for *untouched* fields is what keeps 保存 from silently
 * putting the placement back the way it was.
 *
 * `schema_version` is never taken from the draft: it describes the file's format, not the user's choice.
 */
export function mergeDraft(
  baseline: AppSettings | null,
  draft: AppSettings | null,
  next: AppSettings,
): AppSettings {
  if (baseline === null || draft === null) {
    return { ...next };
  }
  const merged: AppSettings = {
    schema_version: next.schema_version,
    theme: pick(draft.theme, baseline.theme, next.theme),
    language: pick(draft.language, baseline.language, next.language),
    card_density: pick(draft.card_density, baseline.card_density, next.card_density),
    default_storage_filter: pick(
      draft.default_storage_filter,
      baseline.default_storage_filter,
      next.default_storage_filter,
    ),
    default_detail_placement: pick(
      draft.default_detail_placement,
      baseline.default_detail_placement,
      next.default_detail_placement,
    ),
    default_card_order: pick(
      draft.default_card_order,
      baseline.default_card_order,
      next.default_card_order,
    ),
    watch_external_changes: pick(
      draft.watch_external_changes,
      baseline.watch_external_changes,
      next.watch_external_changes,
    ),
    // The three 再起動をまたぐ保持 values have no control in this form at all, which is exactly why they
    // have to be here: the save writes this return value as the whole file, so a value left out is
    // deleted from disk — and the swimlane behind the open モーダル is what writes these.
    collapsed_columns: pick(
      draft.collapsed_columns,
      baseline.collapsed_columns,
      next.collapsed_columns,
    ),
    folded_rows: pick(draft.folded_rows, baseline.folded_rows, next.folded_rows),
    hidden_rows: pick(draft.hidden_rows, baseline.hidden_rows, next.hidden_rows),
  };
  // Every optional field is carried the same way, and each has to be: the form save serializes this
  // return value as the *whole* file, so a field left out here is deleted from disk. The three
  // 外部コマンド指定 now have controls (decision-29), but they stay in this list — the merge is what
  // keeps a value the user is not looking at, and which fields have a control is not what decides
  // whether a value survives a save.
  //
  // Absent rather than `undefined`-valued: the key is skipped in the file when there is no value.
  const cli = pick(draft.backlog_cli, baseline.backlog_cli, next.backlog_cli);
  if (cli !== undefined) {
    merged.backlog_cli = cli;
  }
  const git = pick(draft.git_cli, baseline.git_cli, next.git_cli);
  if (git !== undefined) {
    merged.git_cli = git;
  }
  const gh = pick(draft.gh_cli, baseline.gh_cli, next.gh_cli);
  if (gh !== undefined) {
    merged.gh_cli = gh;
  }
  const editor = pick(draft.external_editor, baseline.external_editor, next.external_editor);
  if (editor !== undefined) {
    merged.external_editor = editor;
  }
  return merged;
}

/** One field's merged value: the user's if they moved it off the baseline, otherwise the new baseline's. */
function pick<T>(draft: T, baseline: T, next: T): T {
  return sameValue(draft, baseline) ? next : draft;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** True when two settings values differ — what makes 保存 meaningful and 取消 offerable. */
export function isDirty(a: AppSettings, b: AppSettings): boolean {
  return JSON.stringify(normalize(a)) !== JSON.stringify(normalize(b));
}

/** Field order fixed for the comparison above; an absent optional and `undefined` are one state. */
function normalize(settings: AppSettings): unknown {
  return [
    settings.schema_version,
    settings.theme,
    settings.language,
    settings.card_density,
    settings.default_storage_filter,
    settings.default_detail_placement,
    settings.default_card_order,
    settings.watch_external_changes,
    settings.collapsed_columns,
    settings.folded_rows,
    settings.hidden_rows,
    settings.backlog_cli ?? null,
    settings.git_cli ?? null,
    settings.gh_cli ?? null,
    settings.external_editor ?? null,
  ];
}
