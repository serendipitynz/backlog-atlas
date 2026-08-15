/**
 * 外部エディタ経路 (doc-8 §7), as pure functions. The panel is markup over these values: which launch
 * methods are offered, what each would run, what is stated before opening, and what a launch or its
 * failure reads as. Nothing here calls the boundary — `TaskDetail.svelte` issues the launch this
 * module describes — so every rule below is testable without an editor appearing on screen.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `edit.ts` and the Rust modules' convention.
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-8 §7 外部エディタ経路 | this module | opening the management file itself in the user's editor; Atlas writes nothing |
 * | doc-8 §7 `$EDITOR` 起動 / OS の関連付け起動 | [`EditorOffer`] per `LaunchMethod` | one control each, because the two are not interchangeable |
 * | doc-8 §7 開く前の注意表示 | [`FRONTMATTER_NOTICE`] | breaking frontmatter degrades the read (doc-4 §5), stated before the launch |
 * | doc-8 §6.4 二重取り込みの回避 | [`UNSAVED_INPUT_WARNING`] + [`needsConfirmation`] | an open 編集セッション makes the launch ask first |
 * | doc-11 §12 実行前確認 | [`launchConfirmation`] | the same warning as the question a launch asks before it starts |
 * | doc-8 §7 書き戻し（継続検出が動いている場合） | — | the save arrives through doc-9's watch and the screen says nothing: §7 states the behaviour but requires no notice, so TASK-79 dropped the sentence |
 * | doc-8 §7 書き戻し（継続検出が止まっている場合） | [`WATCH_STOPPED_NOTE`] | the save will *not* arrive on its own; the row has to be re-read, and the panel offers it |
 * | doc-5 §3.1 / doc-8 §6.5 の案内先 | — | each withheld operation names this route in its own 保留理由 (`edit.ts`), so the list that repeated them was dropped by TASK-79 |
 *
 * Two rules the module follows, the same two `edit.ts` follows:
 *
 * - **A withheld control says why** (doc-5 §5). A method that cannot be pressed is disabled with its
 *   reason, never silently absent.
 * - **The 未保存入力 is never taken.** Opening an editor does not end an 編集セッション or discard a
 *   draft (doc-8 §6.4); it only warns, and the save's 更新前競合検出 is what acts on the divergence.
 */

import type {
  CommandError,
  EditorLaunch,
  EditorReadiness,
  EditorSource,
  LaunchMethod,
} from "./wire";
import { commandErrorDetail, type IssueConfirmation } from "./edit";
import { launchRefusalText } from "./failure";
import { msg } from "./messages";

/**
 * What became of one launch, as the shell reports it back to the panel. Mirrors `ApplyOutcome`: the
 * shell owns the call, the panel owns what is said about it.
 */
export type OpenOutcome =
  | { state: "launched"; launch: EditorLaunch }
  /**
   * Nothing was started: the attempt to (re)start the watch found 継続検出 stopped for this root, and
   * the panel had not said so before the press. doc-8 §7 requires that to be read *before* the editor
   * opens, so the launch waits for the next press — by which time the notice is on screen.
   */
  | { state: "deferred"; detail: string }
  | { state: "failed"; detail: string };

/** One launch method as a control: what it would run, whether it may be pressed, and why not. */
export interface EditorOffer {
  method: LaunchMethod;
  label: string;
  /** What this would invoke and what it receives, with the file shown as a placeholder. Not always a
   * command line: Windows' association launcher is `ShellExecuteW`, which takes the path as a
   * parameter — and being able to read *that* off the panel is the point (TASK-44). */
  command: string;
  enabled: boolean;
  /** Why it is not active, or the extra caveat when it is. `null` when there is neither. */
  reason: string | null;
}

/**
 * 開く前の注意表示 (doc-8 §7 難点と受け方). The whole file is opened, frontmatter included, and what
 * the editor writes does not pass the CLI's option checking — the two facts that make this the
 * exception route rather than another edit control.
 */
export const FRONTMATTER_NOTICE =
  "外部エディタでは frontmatter を含むタスクの Markdown ファイルを開きます。" +
  "編集時に id・status・labels などの構造化フィールドについて Backlog.md による検査は実施されません" +
  "（壊れると不整合表示になります）。";

/**
 * 書き戻し when 継続検出 is stopped (doc-8 §7): the save will not arrive on its own. Shown *before* the
 * launch, beside the frontmatter notice — doc-8 §7 is explicit that the user must not learn this only
 * after the editor is open. The re-read it names is the control the panel offers next to it, so the
 * user reaches the reflected change without leaving the screen.
 *
 * One text for both causes (the watch failed, or アプリ設定 turned it off): doc-9 §3.1 keeps the state
 * and its mark the same either way and puts the difference only in the reason, which the swimlane's
 * 帯 states.
 */
export const WATCH_STOPPED_NOTE =
  "このルートは継続検出が止まっているため、外部エディタでの保存は自動では反映されません。" +
  "編集を終えたら、下の「このルートを再読込」を押してください（タスクを開き直すだけでは読み直しません）。";

/** The re-read control doc-8 §7 requires beside the launch while 継続検出 is stopped. */
export const REREAD_ROOT_LABEL = "このルートを再読込";

/**
 * What a [`OpenOutcome`] `deferred` says. The stop was discovered by the press itself — the watch had
 * not failed yet when the panel was drawn — so the notice above appears at the same moment. Opening
 * anyway would satisfy doc-8 §7's wording and not its point: the user would be reading the warning
 * with the editor already up.
 */
export const WATCH_STOPPED_BEFORE_LAUNCH =
  "このルートの継続検出が止まっていることが分かったため、まだ開いていません。上の注意を読んでから、" +
  "もう一度押すと開きます。";

/** doc-8 §6.4: an open 編集セッション plus an external edit is the double intake to avoid. */
export const UNSAVED_INPUT_WARNING =
  "GUI 側に未保存入力があります。このまま外部エディタでも編集すると、同じタスクを二重に編集する" +
  "ことになります。入力は破棄しませんが、外部エディタの保存は外部変更として検出し、GUI の保存時は" +
  "更新前競合検出で止めます。先に保存またはキャンセルすることを推奨します。";

/**
 * The caveat on the `$EDITOR` control. A terminal editor started from a GUI process has no terminal
 * to draw in, so it exits immediately and the launch looks like it did nothing — which is why the two
 * methods are separate controls rather than a fallback chain that would pick one silently.
 */
export const CONFIGURED_TERMINAL_CAVEAT =
  "端末専用エディタ（vim・nano など）を指している場合、GUI から起動しても画面は出ません。" +
  "その場合は OS の関連付けで開いてください。";

/**
 * How each 起動指定の出所 is named (doc-8 §7 の解決順). アプリ設定 is spelled as itself rather than as a
 * variable name: it is the指定手段 for users whose environment never reaches the process, and calling
 * it `$…` would send them looking for a variable that does not exist.
 */
export const EDITOR_SOURCE_LABEL: Record<EditorSource, string> = {
  appSettings: "アプリ設定の外部エディタ指定",
  visual: "$VISUAL",
  editor: "$EDITOR",
};

export const NO_CONFIGURED_EDITOR_REASON =
  "アプリ設定の外部エディタ指定も VISUAL・EDITOR も設定されていないため、この方式は提供しません" +
  "（設定画面で指定するか、環境変数を設定して Atlas を起動し直すか、OS の関連付けで開いてください）";

export const EDITOR_PROBE_PENDING_REASON = "外部エディタの確認中です";

export const FILE_MISSING_EDITOR_REASON =
  "このタスクのファイルが現在の読み取り結果にありません（外部での移動・削除の可能性）。" +
  "開く対象を特定できないため、外部エディタでも開けません";

/** Placeholder for the file in a command shown to the user; the real argument is the full path. */
const FILE_PLACEHOLDER = "<このタスクのファイル>";

export interface EditorContext {
  /** The task's file has left the read result — there is nothing to name as the launch target. */
  fileMissing: boolean;
}

/**
 * The launch controls for this environment (doc-8 §7). Both methods always appear: a missing
 * `$EDITOR` is a reason on a disabled control, not an absent one, so "Atlas cannot open this" and
 * "this machine has no `$EDITOR`" never look the same.
 */
export function editorOffers(
  readiness: EditorReadiness | null,
  context: EditorContext,
): EditorOffer[] {
  // Ordered as the obstacles are, matching `saveAvailability`: a file that is gone cannot be opened
  // whatever the environment has, and an unfinished probe is not the same as a missing editor.
  const blocked = context.fileMissing
    ? FILE_MISSING_EDITOR_REASON
    : readiness === null
      ? EDITOR_PROBE_PENDING_REASON
      : null;
  const configured = readiness?.configured ?? null;
  const configuredCommand =
    configured === null
      ? "—"
      : [configured.program, ...configured.args, FILE_PLACEHOLDER].join(" ");
  return [
    {
      method: "configured",
      label:
        configured === null
          ? "$EDITOR で開く"
          : `${EDITOR_SOURCE_LABEL[configured.source]} で開く（${configured.program}）`,
      command: configuredCommand,
      enabled: blocked === null && configured !== null,
      reason:
        blocked ??
        (configured === null ? NO_CONFIGURED_EDITOR_REASON : CONFIGURED_TERMINAL_CAVEAT),
    },
    {
      method: "association",
      label: "OS の関連付けで開く",
      // No `null` branch for the launcher itself: every platform has one (TASK-44), so the only reason
      // this control is ever disabled is `blocked` — a missing file or an unfinished probe.
      command: readiness === null ? "—" : `${readiness.association} … ${FILE_PLACEHOLDER}`,
      enabled: blocked === null,
      reason: blocked,
    },
  ];
}

/**
 * Whether the launch asks before it starts (doc-11 §12 の実行前確認). Only with 未保存入力: the notice
 * above is on screen whether or not this is true, and asking on every launch would train the answer
 * into a reflex — which is the one thing that would make the warning that matters (doc-8 §6.4)
 * invisible.
 *
 * The judgement is this boolean and the question is [`launchConfirmation`] below, kept apart on
 * purpose (doc-11 §5): with the question's presence *being* the judgement, dropping the text would
 * drop the asking, and the 語尾の … decides off the same value.
 */
export function needsConfirmation(hasUnsavedInput: boolean): boolean {
  return hasUnsavedInput;
}

/**
 * 実行前確認 (doc-11 §12) for one launch, asked only while [`needsConfirmation`] holds.
 *
 * The question is [`UNSAVED_INPUT_WARNING`] itself — the same text this 区画 prints. The layer covers
 * the 区画, so the warning has to be readable inside it, and doc-11 §7 already settled that the same
 * thing is not to be worded twice for the sake of the second place it appears in.
 *
 * Both answers name the launch, because that is what the press does; the layer's name and its 進む
 * answer are the same act stated once each (doc-11 §12 refuses a wider word like 実行する).
 */
export function launchConfirmation(offer: EditorOffer): IssueConfirmation {
  return { title: offer.label, question: UNSAVED_INPUT_WARNING, proceed: offer.label };
}

/** What was started, as the panel states it. The argument array is shown, not a reconstructed
 * command line: that is what was actually spawned (no shell, no quoting), and a terminal editor that
 * exited without drawing anything is diagnosable from it. */
export function launchSummary(launch: EditorLaunch): string {
  const how = launch.method === "configured" ? "$EDITOR" : "OS の関連付け";
  return `${how} で起動しました: ${[launch.program, ...launch.args].join(" ")}`;
}

/**
 * A failed launch as the panel states it. `unknownTaskFile` gets its own wording: it means the path
 * the panel held is not in the current read — the screen is behind the root, not that the editor
 * failed — so it reads as a re-read, not as an editor problem.
 */
export function launchFailureDetail(error: CommandError): string {
  switch (error.kind) {
    case "unknownTaskFile":
      return (
        `${error.path} は現在の読み取り結果のタスクファイルではないため、起動しませんでした` +
        "（外部での移動・削除の可能性）。タスクを開き直してください。"
      );
    case "editorUnavailable":
      return `外部エディタを起動できません: ${msg().failure.editorUnavailable}`;
    case "editorLaunchFailed":
      // 「で開けませんでした」rather than 「を起動できませんでした」, and the correction follows the method:
      // `program` may be `ShellExecuteW` (Windows' association launcher), whose failures are things like
      // "nothing is registered for this extension" — pointing that user at VISUAL・EDITOR would name the
      // one thing that has no bearing on it.
      return (
        `${error.program} で開けませんでした: ${launchRefusalText(error.reason, error.detail)}。` +
        (error.method === "association"
          ? ".md に関連付けられたアプリケーションが OS に登録されているか確認してください" +
            "（アプリ設定・$VISUAL・$EDITOR での起動は使えます）。"
          : "アプリ設定の外部エディタ指定・VISUAL・EDITOR の値（プログラム名とオプション）を" +
            "確認してください。")
      );
    default:
      return commandErrorDetail(error);
  }
}
