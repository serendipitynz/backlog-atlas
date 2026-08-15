/**
 * 失敗理由符号 → the sentence a screen shows (decision-35 §3).
 *
 * ## Referent table (doc term → identifier here)
 *
 * | term | here | is |
 * |---|---|---|
 * | decision-35 失敗理由符号 | the `reason` argument of each function below | the boundary's typed cause, one `wire.ts` union per route |
 * | doc-5 §5 失敗の理由 | each function's return value | the sentence stated beside the control that asked |
 *
 * ## Why one module rather than a sentence at each call site
 *
 * The same code set reaches more than one screen — a launch failure is worded by the task detail
 * panel and by the 設定画面's launch controls, a lookup failure by the Pull Request 区画 — and the
 * boundary that produces it is one. Writing the sentence where it is shown would put the code table
 * in as many places as there are screens, and a variant added later would be worded in some of them.
 *
 * ## What `detail` is, and when it is the sentence
 *
 * `detail` is the diagnostic text decision-35 §3 keeps beside the code: the OS's own description, a
 * program's first stderr line, an exit status — **or nothing at all**, since a program can fail
 * writing nothing.
 *
 * Where the code says *the OS or the program stated the reason*, that statement **is** the sentence
 * and is shown as it stands: it is not Atlas's text, so decision-35 §5 leaves it untranslated. Where
 * such a code arrives with an empty `detail`, the 文言表 supplies the sentence instead — the branch
 * cannot be removed, only placed, and this is the side that decision-35 §3 puts the wording on. The
 * remaining codes always take their sentence from the 文言表, with a non-empty `detail` after it in
 * parentheses.
 */
import { msg } from "./messages";
import type {
  BodyLinkRefusal,
  LaunchRefusal,
  LookupFailure,
  ProbeFailure,
  RemoteReadFailure,
} from "./wire";

/** A 文言表 sentence with the diagnostic text after it, when there is one. */
function withDetail(sentence: string, detail: string): string {
  return detail === "" ? sentence : `${sentence}（${detail}）`;
}

/**
 * What the OS or the program said, or the 文言表's sentence when it said nothing.
 *
 * Not `detail || sentence`: an empty string is the value this decides on, and the `||` form would
 * also swallow a `detail` that is legitimately `"0"`.
 */
function spokenOr(detail: string, sentence: string): string {
  return detail === "" ? sentence : detail;
}

/**
 * Why a launch that reached the OS did not open its target (doc-8 §7, doc-8 §9.3).
 *
 * The caller supplies what failed — `${program} を起動できません: …` and its kin — so this states the
 * cause alone.
 */
export function launchRefusalText(reason: LaunchRefusal, detail: string): string {
  const text = msg().failure.launch;
  switch (reason.reason) {
    // Both of these mean "the OS answered": its description is the whole reason, and Atlas adding a
    // sentence in front of it would say the same thing twice.
    case "osRefused":
    case "exited":
      return detail;
    case "shellExecute":
      return withDetail(shellExecuteText(reason.code), detail);
    case "comInit":
      return withDetail(text.comInit(hresultText(reason.hresult)), detail);
    case "shellExecuteAbsent":
      return withDetail(text.shellExecuteAbsent, detail);
  }
}

/**
 * `ShellExecuteW`'s own return codes. The boundary hands over the number rather than a sentence
 * (decision-35 §3), because these collide with unrelated Win32 codes and only this table tells them
 * apart — 31 is "nothing is associated with this extension", not "a device is not functioning".
 */
function shellExecuteText(code: number): string {
  const text = msg().failure.launch.shellExecute;
  switch (code) {
    case 0:
      return text.outOfMemory;
    case 26:
      return text.share;
    case 27:
      return text.associationIncomplete;
    case 28:
      return text.ddeTimeout;
    case 29:
      return text.ddeFail;
    case 30:
      return text.ddeBusy;
    case 31:
      return text.noAssociation;
    case 32:
      return text.dllNotFound;
    default:
      return text.unknown(code);
  }
}

/**
 * An `HRESULT` in the `0x` form a Windows reader looks it up by. The boundary sends it as the `i32`
 * the API returns, which is negative for every failure — so the sign is undone here rather than
 * printing `-2147417850`, a number that appears in no documentation.
 */
function hresultText(hresult: number): string {
  return `0x${(hresult >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

/** Why a 本文リンク was not opened (doc-8 §9.3). */
export function bodyLinkRefusalText(reason: BodyLinkRefusal, detail: string): string {
  const text = msg().failure.bodyLink;
  switch (reason.reason) {
    case "schemeNotAllowed":
      return withDetail(text.schemeNotAllowed, detail);
    case "controlCharacter":
      return withDetail(text.controlCharacter, detail);
    // The one that names a program. Worded here rather than by the caller: unlike the editor route,
    // the press that reaches this has no control of its own to name (doc-11 §4 ⑤ 通知).
    case "launchFailed":
      return `${reason.program}: ${launchRefusalText(reason.launch, detail)}`;
  }
}

/** Why a `--version` probe reported no version (decision-29 解決結果の表示). */
export function probeFailureText(reason: ProbeFailure, detail: string): string {
  const text = msg().failure.probe;
  switch (reason.reason) {
    case "spawnFailed":
      return withDetail(text.spawnFailed(reason.program), detail);
    case "exited":
      return spokenOr(detail, text.exited);
    case "noResponse":
      return withDetail(text.noResponse, detail);
  }
}

/** Why the project root's Git remote could not be read (doc-10 §4.1). */
export function remoteReadFailureText(reason: RemoteReadFailure, detail: string): string {
  const text = msg().failure.remoteRead;
  switch (reason.reason) {
    case "gitUnavailable":
      return withDetail(text.gitUnavailable, detail);
    case "gitFailed":
      return spokenOr(detail, text.gitFailed);
    case "remoteUrlEmpty":
      return withDetail(text.remoteUrlEmpty(reason.name), detail);
  }
}

/** Why a Pull Request's commit set could not be fetched (doc-6 §6). */
export function lookupFailureText(reason: LookupFailure, detail: string): string {
  const text = msg().failure.lookup;
  switch (reason.reason) {
    case "toolMissing":
      return withDetail(text.toolMissing, detail);
    case "invalidReference":
      return withDetail(text.invalidReference(reason.value), detail);
    case "queryFailed":
      return spokenOr(detail, text.queryFailed);
    case "timedOut":
      return withDetail(text.timedOut(reason.afterSecs), detail);
  }
}
