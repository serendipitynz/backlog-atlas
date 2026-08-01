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
 * | decision-12 表示テーマ | `theme.ts` の `RECORDED_THEMES` | the colour sets this build has; named there, defined in `app.scss` |
 * | doc-7 §5.2 既定の保存区分 | [`STORAGE_SELECTION_LABEL`] + [`toggleStorage`] | which 保存区分 the filter starts with |
 * | doc-8 §2.2 既定の詳細配置（第 2 の書き手） | [`mergeDraft`] | how a placement stored elsewhere lands in an open form without taking its input |
 *
 * One rule runs through it, the same one `edit.ts` and `external-editor.ts` follow: **a withheld
 * control says why** (doc-5 §5, doc-11 §5). No item is hidden because it cannot be changed yet or
 * because saving is refused — it is shown, disabled, with the reason beside it.
 */

import type {
  AppSettings,
  CardDensity,
  DetailPlacement,
  EditorCommand,
  SettingsStatus,
  StorageSelection,
} from "./wire";

export const CARD_DENSITY_LABEL: Record<CardDensity, string> = {
  s: "S（ID・priority・印・title 1 行）",
  m: "M（＋ Type、title 2 行）",
  l: "L（＋ 通常ラベル・assignee、title 3 行）",
};

export const DETAIL_PLACEMENT_LABEL: Record<DetailPlacement, string> = {
  sidebar: "併置サイドバー",
  modal: "中央モーダル",
  full: "全面シングルビュー",
};

export const STORAGE_SELECTION_LABEL: Record<StorageSelection, string> = {
  active: "active",
  draft: "draft",
  completed: "completed",
  archive: "archive",
  indeterminate: "不定（走査対象外の場所にあるファイル）",
};

export const STORAGE_SELECTIONS: StorageSelection[] = [
  "active",
  "draft",
  "completed",
  "archive",
  "indeterminate",
];

/**
 * カード情報量 (doc-7 §3) の説明。何が増減するかと、**何が増減しないか**を両方言う: 状態の印はどの段でも
 * 落とさない (doc-7 §3) ため、S を選ぶと縮退・版ずれの印まで消えると読まれてはいけない。反映が保存時で
 * あることも書く — このフォームは打鍵ごとには書かず、保存が唯一の書き手である（表示テーマと同じ）。
 */
export const CARD_DENSITY_NOTE =
  "保存すると、スイムレーンのタスクカードへ反映され、次回起動後も残ります。" +
  "状態の印（縮退・版ずれ・保存区分・未対応列の原文 status）は、どの段でも落としません（doc-7 §3）。";

/**
 * 既定の詳細配置 (doc-8 §2.2) の説明。この項目は他の設定と違い、設定画面の外からも書き換わる — タスク
 * 詳細の切替が選んだ配置をそのまま既定として保存するためで、そのことを設定画面側でも読めるようにする。
 */
export const DETAIL_PLACEMENT_NOTE =
  "起動直後にタスク詳細を開く配置です。タスク詳細の見出しで配置を切り替えると、その配置がここへ保存され" +
  "ます（doc-8 §2.2）。ここで変えた場合、開いている詳細はそのままで、次回起動時から新しい既定になります。";

/**
 * decision-13 既定値で動いている旨 (AC #6): why the values in hand are the defaults, or `null` when they
 * came from the file. Split by cause because the three lead to different expectations — a first run
 * needs no action, a corrupt file will be rebuilt by the next save, and a newer file will not be
 * written at all.
 */
export function statusNotice(status: SettingsStatus): string | null {
  switch (status.state) {
    case "stored":
      return null;
    case "absent":
      return "設定ファイルはまだありません。既定値で動いています（保存すると作成します）。";
    case "unreadable":
      return (
        `設定ファイルを読めませんでした（${status.detail}）。既定値で動いています` +
        "（保存すると、この既定値で作り直します）。"
      );
    case "readOnly":
      return (
        `設定ファイルの schema_version ${status.version} はこのビルドが理解する版より新しいため、` +
        "読み取り専用です。既定値で動いており、保存はできません（ファイルは書き換えません）。"
      );
  }
}

/** Whether 保存 may be pressed, and why not (decision-13: an unknown newer file is never clobbered). */
export function saveAvailability(status: SettingsStatus): { enabled: boolean; reason: string | null } {
  return status.state === "readOnly"
    ? {
        enabled: false,
        reason:
          `設定ファイルの schema_version ${status.version} はこのビルドより新しいため、` +
          "上書きしません（新しい版で書かれた内容を壊さないため）。",
      }
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
  if (trimmed === "") return undefined;
  return {
    program: trimmed,
    args: argsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  };
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
  if (on) next.add(value);
  else next.delete(value);
  return STORAGE_SELECTIONS.filter((candidate) => next.has(candidate));
}

/**
 * What the screen warns when 既定の保存区分 is empty, or `null` when it is not. An empty selection is a
 * legal filter state (doc-7 §5.2 makes 保存区分 a positive selection: what is selected is shown), so it
 * is not refused — but as a *startup* default it means a grid with no cards and no visible cause,
 * which the user should not meet without having been told.
 */
export function emptyStorageWarning(selection: StorageSelection[]): string | null {
  return selection.length === 0
    ? "保存区分をひとつも選ばないと、起動直後はどのカードも表示されません（フィルタで足せます）。"
    : null;
}

/**
 * 継続検出を切っている旨 (doc-9 §3.1) as the settings screen states it. doc-9 §3.1 requires the
 * *state* to look the same as a watch that failed to start — only the reason differs — so this text
 * says what stops and what still works, and does not invent a second state name.
 */
export const WATCH_OFF_NOTE =
  "切ると、外部エディタや別プロセスの保存が自動では画面へ届きません（行の「再読込」で読み直せます）。" +
  "更新後の再読込と手動の再読込は切っても働きます（doc-9 §3.1）。";

/** doc-9 §3.2: 起動時の全ルート読み取りが設定項目でない理由を、設定画面で読める形にしたもの。 */
export const STARTUP_READ_NOTE =
  "起動時に全ルートを読むことは必須で、設定項目にしていません。読まない状態ではカードを 1 枚も描けず、" +
  "更新前競合検出の基準も持てないためです（doc-9 §3.2）。";

/** decision-13: 列折畳み・行折畳み・行非表示 をこのファイルへ保存しない理由 (AC #4)。 */
export const TRANSIENT_STATE_NOTE =
  "列折畳み・行折畳み・行非表示は画面の一時状態として扱い、この設定には保存しません。" +
  "前回どけた行が消えたままだと、登録したはずのプロジェクトが失われたように読めるためです（decision-13）。";

/**
 * Fold a baseline that arrived from *outside* the 設定画面 into the draft it is editing: every field the
 * user has changed away from the previous baseline stays as they left it, and the rest comes from the
 * new one. `baseline`/`draft` are `null` before the form has anything to protect, which is the plain
 * "seed from the new values" case.
 *
 * Needed because アプリ設定 has a second writer: choosing a 詳細配置 stores it as the 既定 (doc-8 §2.2)
 * while the 設定画面 may be open over the same screen with unsaved input. Re-seeding the whole form on
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
  if (baseline === null || draft === null) return { ...next };
  const merged: AppSettings = {
    schema_version: next.schema_version,
    theme: pick(draft.theme, baseline.theme, next.theme),
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
    watch_external_changes: pick(
      draft.watch_external_changes,
      baseline.watch_external_changes,
      next.watch_external_changes,
    ),
  };
  // Both optional fields are carried the same way, and `backlog_cli` has to be even though no control
  // on this form can touch it: the form save serializes this return value as the *whole* file, so a
  // field left out here is deleted from disk. It is hand-edited only (doc-5 §4 順序 1), which makes it
  // exactly the value a user would not think to re-enter after changing a theme.
  const cli = pick(draft.backlog_cli, baseline.backlog_cli, next.backlog_cli);
  // Absent rather than `undefined`-valued: the key is skipped in the file when there is no value.
  if (cli !== undefined) merged.backlog_cli = cli;
  const editor = pick(draft.external_editor, baseline.external_editor, next.external_editor);
  if (editor !== undefined) merged.external_editor = editor;
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
    settings.card_density,
    settings.default_storage_filter,
    settings.default_detail_placement,
    settings.watch_external_changes,
    settings.backlog_cli ?? null,
    settings.external_editor ?? null,
  ];
}
