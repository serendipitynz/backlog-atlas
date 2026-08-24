/**
 * 外部エディタ経路 (doc-8 §7, decision-45), as pure functions. The submenu is markup over these
 * values: which rows are offered, what each would run, what is stated before opening, and what a
 * launch failure reads as. Nothing here calls the boundary — the shell issues the launch this module
 * describes — so every rule below is testable without a program appearing on screen.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `edit.ts` and the Rust modules' convention.
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-8 §7 外部エディタ経路 | this module | handing one 管理ファイル to a program outside Atlas; Atlas writes nothing |
 * | doc-7 §2.1 外部で開く | [`externalOpenLabel`] + [`externalOpenAvailability`] | the menu row that opens the submenu, and whether it may be pressed |
 * | decision-45 §1 選択中の管理ファイル | [`OpenTarget`] | the one file the group hands over — resolved by the screen that holds the selection |
 * | decision-45 §1 対象未選択 | [`noTargetReason`] | 保留理由 for the row when no file is selected: 開く相手が無い, not 開けない |
 * | decision-45 §4 行の集合 | [`externalOpenRows`] | one row per `MethodOffer` the crate reported, in its order |
 * | doc-8 §7 開く前の注意表示 | [`openNotice`] | the 抑止できる注意 layer (doc-11 §15), and what it says |
 * | doc-8 §6.4 二重取り込みの回避 | [`openNotice`]'s `unsavedInput` | the half of that layer 注意の抑止 does not reach |
 * | doc-8 §7 書き戻し（継続検出が止まっている場合） | [`watchStoppedNote`] | the submenu's own line, above the rows that edit — **not** in the layer, which can be suppressed |
 * | doc-8 §7 の区画に残るもの | [`rereadRootLabel`] | the re-read the panel keeps beside the path (decision-45 §8) |
 *
 * Three rules the module follows.
 *
 * - **A withheld control says why** (doc-5 §5, doc-11 §5). A row that cannot be pressed is disabled
 *   with its reason, never silently absent.
 * - **The 未保存入力 is never taken.** Opening a program does not end an 編集セッション or discard a
 *   draft (doc-8 §6.4); it only warns, and the save's 更新前競合検出 is what acts on the divergence.
 * - **Which rows exist is the crate's answer, not this module's** (decision-45 §4). Nothing here
 *   spells a platform or a product: a row is drawn because `EditorReadiness.methods` carries it.
 */

import type {
  CommandError,
  EditorReadiness,
  EditorSource,
  LaunchMethod,
  MethodOffer,
} from "./wire";
import type { Availability } from "./availability";
import { AVAILABLE, withheld } from "./availability";
import { commandErrorDetail } from "./edit";
import { launchRefusalText } from "./failure";
import { msg } from "./messages";

/**
 * 選択中の管理ファイル (decision-45 §1): the one file 外部で開く hands over. The kind is not carried —
 * the notice names 管理ファイル rather than any one of the four (decision-45 §6), and the launch
 * resolves the path against all four on the crate side.
 */
export interface OpenTarget {
  slug: string;
  sourcePath: string;
}

export interface ExternalOpenContext {
  /** `null` while 対象未選択 (decision-45 §1). */
  target: OpenTarget | null;
  /**
   * The selected file has left the read result. Held apart from a `null` target because the two are
   * different facts with different reasons: nothing is selected, versus what is selected is gone.
   */
  fileMissing: boolean;
  /** 継続検出 が止まっている for the target's root (doc-9 §3.1). */
  watchStopped: boolean;
  /** The 編集セッション on the target holds 未保存入力 (doc-8 §6.4). */
  hasUnsavedInput: boolean;
  /** 注意の抑止 (decision-45 §6): the user turned frontmatter の注意 off for good. */
  noticeSuppressed: boolean;
}

/** One row of the submenu: what it would run, whether it may be pressed, and why not. */
export interface ExternalOpenRow {
  method: LaunchMethod;
  label: string;
  /**
   * What this would invoke and what it receives, with the file shown as a placeholder. Not always a
   * command line: Windows' association launcher is `ShellExecuteW`, which takes the path as a
   * parameter — and being able to read *that* off the row is the point (TASK-44).
   */
  command: string;
  availability: Availability;
  /** The extra caveat that stands while the route *is* open, or `null` when there is none. */
  caveat: string | null;
  /** Whether this row hands over something to edit (decision-45 §6) — the rows the notice covers. */
  edits: boolean;
}

/** The menu row that opens the submenu (doc-7 §2.1). */
export function externalOpenLabel(): string {
  return msg().shell.externalOpen.label;
}

/**
 * 保留理由 while 対象未選択 (decision-45 §1). States that there is nothing to open rather than that
 * opening failed — the user's next move is to select a file, and a sentence about a failure would
 * send them looking for one.
 */
export function noTargetReason(): string {
  return msg().shell.externalOpen.noTarget;
}

/** 保留理由 when the selected file has left the read result. */
export function fileMissingReason(): string {
  return msg().shell.externalOpen.fileMissing;
}

export function editorProbePendingReason(): string {
  return msg().shell.externalOpen.probePending;
}

export function noConfiguredEditorReason(): string {
  return msg().shell.externalOpen.noConfigured;
}

/**
 * Whether 外部で開く may be pressed (doc-11 §5). Read on the parent row rather than on each row of the
 * submenu, because both obstacles are about the *target*: with none, no row in the group has anything
 * to hand over, and a submenu of seven identically-withheld rows says the same thing seven times.
 */
export function externalOpenAvailability(context: ExternalOpenContext): Availability {
  if (context.fileMissing) {
    return withheld(fileMissingReason());
  }
  return context.target === null ? withheld(noTargetReason()) : AVAILABLE;
}

/**
 * How each 起動指定の出所 is named (doc-8 §7 の解決順). アプリ設定 is spelled as itself rather than as a
 * variable name: it is the 指定手段 for users whose environment never reaches the process, and calling
 * it `$…` would send them looking for a variable that does not exist.
 */
export function editorSourceLabel(source: EditorSource): string {
  return msg().shell.externalOpen.source[source];
}

/**
 * The caveat on the 起動指定 row. A terminal editor started from a GUI process has no terminal to draw
 * in, so it exits immediately and the launch looks like it did nothing — the one launch whose success
 * the screen cannot show (decision-45 §7), which is why this caveat survived the move to the menu.
 */
export function configuredTerminalCaveat(): string {
  return msg().shell.externalOpen.terminalCaveat;
}

/** Placeholder for the file in a command shown to the user; the real argument is the full path. */
function filePlaceholder(): string {
  return msg().shell.externalOpen.filePlaceholder;
}

/**
 * What one row is called. **The product name comes from the offer, not from here** (decision-45 §4):
 * a product name is an identifier rather than 画面文, so the catalogue words the row around it and
 * neither catalogue spells `Visual Studio Code`.
 *
 * The two rows named by what they do (起動指定・OS の関連付け) carry no product, which is exactly how
 * they are told apart from the rest — no list of method tokens is needed here.
 */
function rowLabel(offer: MethodOffer, readiness: EditorReadiness): string {
  const text = msg().shell.externalOpen;
  switch (offer.method) {
    case "configured": {
      const configured = readiness.configured;
      return configured === null
        ? text.openWithConfiguredAbsent
        : text.openWithConfigured(editorSourceLabel(configured.source), configured.program);
    }
    case "association":
      return text.openWithAssociation;
    case "reveal":
      return text.revealIn(offer.product);
    case "terminal":
      return text.openTerminal(offer.product);
    default:
      return text.openWithProduct(offer.product);
  }
}

/** What a row would invoke, as the submenu states it. */
function rowCommand(offer: MethodOffer, readiness: EditorReadiness): string {
  if (offer.method === "configured") {
    const configured = readiness.configured;
    return configured === null
      ? "—"
      : [configured.program, ...configured.args, filePlaceholder()].join(" ");
  }
  if (offer.method === "association") {
    return `${offer.program} … ${filePlaceholder()}`;
  }
  return `${offer.program} … ${filePlaceholder()}`;
}

/**
 * The rows of the submenu (decision-45 §4), in the order the crate reported them. `null` readiness is
 * an unfinished probe, which is a reason on disabled rows rather than an empty submenu: "Atlas cannot
 * open this" and "the probe has not answered yet" must not look the same.
 *
 * The 保留理由 here are about the *environment*; the ones about the target are on the parent row
 * ([`externalOpenAvailability`]), which is why nothing below reads `context.target`.
 */
export function externalOpenRows(
  readiness: EditorReadiness | null,
  context: ExternalOpenContext,
): ExternalOpenRow[] {
  if (readiness === null) {
    // One row rather than none, and rather than a guessed list: the crate has not said which rows this
    // platform has, so any list drawn here would be this module inventing the table decision-45 §4 put
    // on the other side.
    return [
      {
        method: "association",
        label: msg().shell.externalOpen.openWithAssociation,
        command: "—",
        availability: withheld(editorProbePendingReason()),
        caveat: null,
        edits: true,
      },
    ];
  }
  void context;
  return readiness.methods.map((offer) => ({
    method: offer.method,
    label: rowLabel(offer, readiness),
    command: rowCommand(offer, readiness),
    availability:
      offer.method === "configured" && readiness.configured === null
        ? withheld(noConfiguredEditorReason())
        : AVAILABLE,
    caveat: offer.method === "configured" && readiness.configured !== null
      ? configuredTerminalCaveat()
      : null,
    edits: offer.edits,
  }));
}

/**
 * 書き戻し when 継続検出 is stopped (doc-8 §7): the save will not arrive on its own. Drawn as the
 * submenu's own line above the rows that edit, **not** inside [`openNotice`] — that layer can be
 * suppressed (decision-45 §6), and a requirement met only for users who have not suppressed it is not
 * met (decision-45 §9).
 *
 * One text for both causes (the watch failed, or アプリ設定 turned it off): doc-9 §3.1 keeps the state
 * and its mark the same either way and puts the difference only in the reason, which the swimlane's
 * 帯 states.
 */
export function watchStoppedNote(): string {
  return msg().shell.externalOpen.watchStoppedNote;
}

/** The re-read control doc-8 §7 requires while 継続検出 is stopped, kept by the panel and the
 * プロジェクト詳細 header (decision-45 §8). */
export function rereadRootLabel(): string {
  return msg().shell.externalOpen.rereadRoot;
}

/**
 * The layer a press raises before the launch, or `null` when the press launches straight away.
 *
 * Two halves with different rules (doc-11 §15 ③, decision-45 §6):
 *
 * - `frontmatter` is 抑止できる注意 — dropped once the user has suppressed it, and absent on the rows
 *   that hand over nothing to edit.
 * - `unsavedInput` is 実行前確認 (doc-11 §12) — **never suppressible**, because a question that can be
 *   turned off is one that can be missing on the single occasion it was needed.
 *
 * `null` therefore means both halves are empty, which is the only case where a press is a launch.
 */
export interface OpenNotice {
  /** The layer's name and its 進む answer: the row's own label (doc-11 §12 refuses a wider word). */
  title: string;
  frontmatter: string | null;
  unsavedInput: string | null;
  proceed: string;
  /** The 今後表示しない tick, or `null` when there is no suppressible half to tick off. */
  suppress: string | null;
}

export function openNotice(
  row: ExternalOpenRow,
  context: ExternalOpenContext,
): OpenNotice | null {
  const text = msg().shell.externalOpen;
  const frontmatter = row.edits && !context.noticeSuppressed ? text.frontmatterNotice : null;
  const unsavedInput = row.edits && context.hasUnsavedInput ? text.unsavedInputWarning : null;
  if (frontmatter === null && unsavedInput === null) {
    return null;
  }
  return {
    title: row.label,
    frontmatter,
    unsavedInput,
    proceed: row.label,
    // Only offered beside the half it turns off. Ticking it while the layer stands for the
    // unsuppressible half alone would read as turning that question off.
    suppress: frontmatter === null ? null : text.suppressNotice,
  };
}

/**
 * Whether the row's own label takes the trailing `…` (doc-11 §12 ②): it predicts that a press does not
 * reach the action, so it is present exactly when [`openNotice`] is.
 */
export function asksBeforeOpening(row: ExternalOpenRow, context: ExternalOpenContext): boolean {
  return openNotice(row, context) !== null;
}

/**
 * A failed launch as the ⑤ 通知 states it (decision-45 §7). `unknownManagedFile` gets its own wording:
 * it means the path the screen held is not in the current read — the screen is behind the root, not
 * that the program failed — so it reads as a re-read, not as an editor problem.
 */
export function launchFailureDetail(error: CommandError): string {
  switch (error.kind) {
    case "unknownManagedFile":
      return msg().shell.externalOpen.unknownManagedFile(error.path);
    case "editorUnavailable":
      return msg().taskDetail.commandError.editorUnavailable(msg().failure.editorUnavailable);
    case "editorLaunchFailed": {
      // 「で開けませんでした」rather than 「を起動できませんでした」, and the correction follows the method:
      // `program` may be `ShellExecuteW` (Windows' association launcher), whose failures are things like
      // "nothing is registered for this extension" — pointing that user at VISUAL・EDITOR would name the
      // one thing that has no bearing on it.
      const text = msg().shell.externalOpen;
      return text.launchFailed(
        error.program,
        launchRefusalText(error.reason, error.detail),
        error.method === "association" ? text.fixAssociation : text.fixConfigured,
      );
    }
    default:
      return commandErrorDetail(error);
  }
}
