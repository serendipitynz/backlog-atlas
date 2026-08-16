/**
 * The 台帳管理画面's logic, as pure functions (doc-3 §3/§4). Everything here maps the form's
 * in-progress input onto the ledger commands' requests, or maps a refusal back onto the field that
 * gets the user past it — so the register/update/remove rules can be tested without mounting a
 * component, exactly as `swimlane.ts` does for the grid.
 *
 * ## Referent table (doc-3 term → identifier here)
 *
 * Fixed before the code was written, following the Rust modules' and `swimlane.ts`'s convention.
 *
 * | doc-3 | here | is |
 * |---|---|---|
 * | §1 プロジェクト台帳 / 台帳エントリ | `Ledger` / `ProjectEntry` (`wire.ts`) | the registration record and one project in it — the screen's data, unchanged |
 * | §4.1 登録の入力 | `RegisterInput` | the registration form's fields as the user has them, before they become a `RegisterRequest` |
 * | §4.3 更新してよい属性 | `EntryEdit` | one entry's editable attributes as the form holds them, before they become an `UpdateRequest` |
 * | §3.3 status 別名表 | `AliasRow[]` | the alias table *while being edited*: ordered rows, so a half-typed or duplicated key can exist on screen without being in the table |
 * | §4.1 登録を拒否し理由を示す | `refusalReport` | one refusal as the sentence the screen shows, plus the field to correct |
 * | §3.1 別 slug 指定で回復 | `LedgerField` | which form field a problem points at |
 * | §3.1 slug の文字種 | `isValidSlug` | the `[a-z0-9][a-z0-9-]*` check |
 * | §3 絶対パス | `isAbsolutePath` | whether a root is spelled as an absolute path |
 * | §3.3 別名の対応先 | `CANONICAL_STATUS_NAMES` | the four names an alias value may take |
 * | decision-4 別名の主体 | `aliasKeyEffect` | whether an alias key names a status the project declares — an alias for an undeclared status changes nothing |
 *
 * ## What is checked here, and what is not
 *
 * The checks below are advice *while typing*; the decision is always the Rust side's. doc-3 §3.1's
 * slug grammar, §3's absolute roots and §3.3's canonical alias values are spelled in the document,
 * so mirroring them here costs nothing and turns three round-trips into inline feedback. The
 * authority stays `Ledger::register` / `Ledger::update`, whose refusals arrive typed and are
 * reported by `refusalReport` — including the cases only they can know (slug uniqueness against a
 * ledger another window may have just written, a Backlog root's `config.yml`/`tasks/`).
 *
 * Nothing here writes anything, and nothing here can reach a project's files: the only outputs are
 * request values for the three ledger commands, which write the ledger file alone (doc-3 §2.1).
 */

import { msg } from "./messages";
import type {
  CommandError,
  ProjectEntry,
  RegisterRequest,
  UpdateRequest,
} from "./wire";

/** The four names a status 別名表 value may take (doc-3 §3.3, decision-4). Fixed set. */
export const CANONICAL_STATUS_NAMES: readonly string[] = [
  "To Do",
  "In Progress",
  "In Review",
  "Done",
] as const;

/** Which form field a problem or refusal points at. `null` is "no field change gets past this". */
export type LedgerField = "projectRoot" | "backlogRoot" | "slug" | "aliases";

/** One thing wrong with the form, and where. `message` is what the screen shows verbatim. */
export interface FieldProblem {
  field: LedgerField;
  message: string;
}

/** The registration form's fields (doc-3 §4.1 step 1–3). Empty string is "not given". */
export interface RegisterInput {
  projectRoot: string;
  /** Empty means the default `<projectRoot>/backlog` (doc-3 §3). */
  backlogRoot: string;
  /** Empty means the slug derived from the project-root directory name (doc-3 §3.1). */
  slug: string;
}

export const EMPTY_REGISTER_INPUT: RegisterInput = {
  projectRoot: "",
  backlogRoot: "",
  slug: "",
};

/**
 * Whether the registration form holds 未保存入力 — anything typed that the ledger has not been told
 * about (doc-8 §6.3 の語を、doc-11 §7 のモーダルへ適用したもの。TASK-86).
 *
 * All three fields count, not just the required one: 登録 is refused while プロジェクトルート is empty,
 * so a Backlog root or a slug typed on its own is exactly the input that would go silently — the form
 * cannot have issued it, and closing the layer unmounts it.
 *
 * Whitespace alone is not input. It cannot become a request either (`toRegisterRequest` trims), so
 * counting it would raise a 破棄前確認 about a value the user could not have submitted.
 */
export function hasRegisterInput(input: RegisterInput): boolean {
  return (
    input.projectRoot.trim() !== "" ||
    input.backlogRoot.trim() !== "" ||
    input.slug.trim() !== ""
  );
}

/**
 * Why the 登録モーダル will not take a close request right now (doc-11 §7 の いま閉じられない事情).
 *
 * Same shape and same reason as `savingReason()` one screen over: the panel is what reports whether the
 * registration was refused, and leaving takes it away while the write already issued goes on to land.
 */
export function registeringReason(): string {
  return msg().projectRegister.registering;
}

/** One row of the 別名表 editor. Ordered and possibly incomplete — see the referent table. */
export interface AliasRow {
  key: string;
  value: string;
}

/**
 * One entry's editable attributes (doc-3 §4.3). `slug` is absent on purpose: it is immutable, and
 * leaving it out of the form's own type is how that is kept true here as well as in the request.
 * Display order is not here either — it is moved by its own action, not by submitting this form.
 *
 * The Git remote re-detection is absent for that second reason (doc-10 §4.1, TASK-124): it is its own
 * control that issues on press, so it holds nothing between renders and is not part of 未保存入力.
 */
export interface EntryEdit {
  /** A same-project move when it differs from the entry's current value (doc-3 §4.3). */
  projectRoot: string;
  backlogRoot: string;
  aliases: AliasRow[];
}

/** The form for one entry, filled from what the ledger currently holds. */
export function editOf(entry: ProjectEntry): EntryEdit {
  return {
    projectRoot: entry.project_root,
    backlogRoot: entry.backlog_root,
    aliases: aliasRowsOf(entry),
  };
}

/** The entry's 別名表 as editor rows, in a stable order so the list does not jump while typing. */
export function aliasRowsOf(entry: ProjectEntry): AliasRow[] {
  return Object.entries(entry.status_aliases ?? {})
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** True when `s` matches doc-3 §3.1's slug grammar `[a-z0-9][a-z0-9-]*`. */
export function isValidSlug(s: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(s);
}

/**
 * Whether a root is spelled as an absolute path (doc-3 §3). Deliberately accepts both POSIX and
 * Windows spellings rather than only the host's: a path this accepts and the Rust side does not is
 * refused there with `nonAbsoluteRoot` and reported, whereas one this rejected too eagerly would be
 * unregisterable with no way to argue.
 */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/**
 * The parent directory of a path, or `null` when it has none. Used only to *prefill* the project
 * root when the user picked a Backlog root instead (doc-3 §4.1 step 1 allows either): the guess
 * lands in the visible field for the user to correct, and is never sent on its own.
 */
export function parentPath(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (cut < 0) {
    return null;
  }
  // Keep the root itself spelled as a root ("/x" → "/"), rather than as an empty string.
  const parent = cut === 0 ? trimmed.slice(0, 1) : trimmed.slice(0, cut);
  return parent === "" || parent === trimmed ? null : parent;
}

/** The Backlog root a registration would resolve to (doc-3 §3: default `<project_root>/backlog`). */
export function resolvedBacklogRoot(input: RegisterInput): string {
  const explicit = input.backlogRoot.trim();
  if (explicit !== "") {
    return explicit;
  }
  const projectRoot = input.projectRoot.trim().replace(/[\\/]+$/, "");
  if (projectRoot === "") {
    return "";
  }
  const separator = projectRoot.includes("\\") && !projectRoot.includes("/") ? "\\" : "/";
  return `${projectRoot}${separator}backlog`;
}

/**
 * What is wrong with the registration form, if anything (doc-3 §4.1). An empty list means the
 * request is worth sending — not that it will succeed: the root's readability and the slug's
 * uniqueness are the Rust side's to judge, and `taken` here only catches a collision with a slug
 * this screen already has in view.
 */
export function registerProblems(
  input: RegisterInput,
  taken: readonly string[],
): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const projectRoot = input.projectRoot.trim();
  const backlogRoot = input.backlogRoot.trim();
  const slug = input.slug.trim();

  const text = msg().projectRegister.problem;
  if (projectRoot === "") {
    problems.push({ field: "projectRoot", message: text.projectRootRequired });
  } else if (!isAbsolutePath(projectRoot)) {
    problems.push({ field: "projectRoot", message: text.projectRootNotAbsolute });
  }
  if (backlogRoot !== "" && !isAbsolutePath(backlogRoot)) {
    problems.push({ field: "backlogRoot", message: text.backlogRootNotAbsolute });
  }
  // An empty slug is not a problem: it means "derive it from the project root" (doc-3 §3.1).
  if (slug !== "" && !isValidSlug(slug)) {
    problems.push({ field: "slug", message: slugGrammarMessage(slug) });
  } else if (slug !== "" && taken.includes(slug)) {
    problems.push({
      field: "slug",
      message: text.slugTaken(slug),
    });
  }
  return problems;
}

/**
 * The registration request for this form (doc-3 §4.1). Both optional fields are *omitted* when the
 * user left them empty, so the defaults applied are the ledger's own — sending `""` would ask the
 * Rust side to register a relative empty path instead.
 */
export function toRegisterRequest(input: RegisterInput): RegisterRequest {
  const request: RegisterRequest = { project_root: input.projectRoot.trim() };
  const backlogRoot = input.backlogRoot.trim();
  if (backlogRoot !== "") {
    request.backlog_root = backlogRoot;
  }
  const slug = input.slug.trim();
  if (slug !== "") {
    request.slug = slug;
  }
  return request;
}

/**
 * What is wrong with one entry's edit form (doc-3 §4.3). Alias problems are listed per row's key so
 * the screen can name the row: a duplicate key would otherwise silently lose one of the two, since
 * the table is a map.
 */
export function editProblems(edit: EntryEdit): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const projectRoot = edit.projectRoot.trim();
  const backlogRoot = edit.backlogRoot.trim();

  const text = msg().projectRegister.problem;
  if (projectRoot === "") {
    problems.push({ field: "projectRoot", message: text.projectRootEmpty });
  } else if (!isAbsolutePath(projectRoot)) {
    problems.push({ field: "projectRoot", message: text.projectRootNotAbsolute });
  }
  if (backlogRoot === "") {
    problems.push({ field: "backlogRoot", message: text.backlogRootEmpty });
  } else if (!isAbsolutePath(backlogRoot)) {
    problems.push({ field: "backlogRoot", message: text.backlogRootNotAbsolute });
  }
  problems.push(...aliasProblems(edit.aliases));
  return problems;
}

/** 別名表 rows that cannot become a table (doc-3 §3.3). Blank rows are ignored, not reported. */
export function aliasProblems(rows: readonly AliasRow[]): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const text = msg().projectRegister.problem;
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (key === "" && value === "") {
      continue;
    }
    if (key === "") {
      problems.push({ field: "aliases", message: text.aliasKeyMissing });
      continue;
    }
    // 名称一致 (decision-4): two keys differing only in case or surrounding space are one status,
    // so they would collapse into a single table entry with an arbitrary winner.
    const normalized = key.trim().toLowerCase();
    if (seen.has(normalized)) {
      problems.push({
        field: "aliases",
        message: text.aliasKeyDuplicate(key),
      });
    }
    seen.add(normalized);
    if (!CANONICAL_STATUS_NAMES.includes(value)) {
      problems.push({
        field: "aliases",
        message: text.aliasValueNotCanonical(key, value === "" ? text.aliasValueUnset : value),
      });
    }
  }
  return problems;
}

/** The 別名表 these rows describe (doc-3 §3.3). Blank rows are dropped; keys and values trimmed. */
export function aliasTable(rows: readonly AliasRow[]): Record<string, string> {
  const table: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (key === "" || value === "") {
      continue;
    }
    table[key] = value;
  }
  return table;
}

/**
 * Whether an alias keyed `key` would have any effect, given the project's declared status set
 * (`config.yml`'s `statuses`). decision-4 makes an alias's subject a status the project *declares*,
 * so an alias for a value declared nowhere leaves its tasks 未分類 regardless — which looks like the
 * alias was ignored. Advisory only: `interpret::status` is where the rule is applied.
 *
 * - `declared` … the project declares this status; the alias applies.
 * - `draft` … the draft-only `Draft` status, known even when `config.yml` omits it (doc-4 §3.4).
 * - `noDeclaredSet` … `config.yml` declares no statuses, so nothing contradicts this key.
 * - `undeclared` … declared nowhere: the alias will not place the task in a column.
 */
export function aliasKeyEffect(
  key: string,
  statuses: readonly string[],
): "declared" | "draft" | "noDeclaredSet" | "undeclared" {
  const normalized = key.trim().toLowerCase();
  if (normalized === "") {
    return "undeclared";
  }
  if (statuses.some((status) => status.trim().toLowerCase() === normalized)) {
    return "declared";
  }
  if (normalized === "draft") {
    return "draft";
  }
  return statuses.length === 0 ? "noDeclaredSet" : "undeclared";
}

/**
 * The update request for one entry's edit, or `null` when nothing changed (doc-3 §4.3). Only the
 * changed attributes are sent, so an alias-only edit stays an alias-only edit — the Rust side closes
 * the project's open session when the roots move, and sending unchanged roots would make every save
 * look like a move.
 *
 * A move sends *both* roots explicitly, even when only `project_root` was edited. The Rust default
 * for a move without a Backlog root is `<new project_root>/backlog`, which need not be what this
 * form is showing; sending the form's own value keeps "両方更新" (doc-3 §4.3) equal to what the user
 * saw. The screen is what offers to follow the default, visibly, in the field.
 */
export function toUpdateRequest(
  entry: ProjectEntry,
  edit: EntryEdit,
): UpdateRequest | null {
  const request: UpdateRequest = { slug: entry.slug };
  let changed = false;

  const projectRoot = edit.projectRoot.trim();
  const backlogRoot = edit.backlogRoot.trim();
  const moved = projectRoot !== entry.project_root;
  if (moved) {
    request.project_root = projectRoot;
    request.backlog_root = backlogRoot;
    changed = true;
  } else if (backlogRoot !== entry.backlog_root) {
    request.backlog_root = backlogRoot;
    changed = true;
  }
  const table = aliasTable(edit.aliases);
  if (!sameTable(table, entry.status_aliases ?? {})) {
    // Sent even when empty: `{}` is how the 別名表 is cleared (doc-3 §3.3 既定は空).
    request.status_aliases = table;
    changed = true;
  }
  return changed ? request : null;
}

function sameTable(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) {
    return false;
  }
  return keys.every((key) => a[key] === b[key]);
}

/**
 * Where a row would land in the ledger order when moved one step (doc-3 §4.3 表示上の並び順), or
 * `null` at the end it is already at. Unlike the swimlane's reorder there is no hidden row to skip:
 * this screen shows every entry, so a step is a step.
 */
export function moveTarget(
  order: readonly string[],
  slug: string,
  direction: -1 | 1,
): number | null {
  const index = order.indexOf(slug);
  if (index < 0) {
    return null;
  }
  const target = index + direction;
  return target < 0 || target >= order.length ? null : target;
}

/**
 * What became of one 登録・削除・更新, as the screen needs it. The shell issues the command — it owns
 * the IPC and the re-sync of the rows that follows — and hands back this, so the form knows whether
 * to clear itself and which field to send the user to.
 */
export type LedgerActionResult =
  | { state: "done"; slug: string }
  | { state: "refused"; report: RefusalReport };

/** One refusal as the screen shows it: the reason, and the field that gets the user past it. */
export interface RefusalReport {
  message: string;
  /** `null` when no field change helps — a read-only ledger, or the ledger file itself failing. */
  field: LedgerField | null;
}

/**
 * A failed ledger operation as a reason plus a recovery (doc-3 §4.1 理由付き提示, §3.1 別 slug 指定
 * で回復). Every refusal is answered from its typed `reason`, so no message text is parsed; the
 * untyped `ledger` variant — the file or the plumbing — is passed through with no field, because
 * there is no form change that would help.
 */
export function refusalReport(error: CommandError): RefusalReport {
  if (error.kind !== "ledgerRefused") {
    // Not a refusal of the operation: the ledger file could not be read or written, or the failure
    // is not a ledger one at all. Reported as it arrived rather than dressed as a correctable input.
    const detail = "detail" in error ? error.detail : JSON.stringify(error);
    return { message: msg().projectRegister.refusal.notARefusal(detail), field: null };
  }
  const text = msg().projectRegister.refusal;
  const reason = error.reason;
  switch (reason.reason) {
    case "readOnly":
      return { message: text.readOnly(reason.schema_version), field: null };
    case "backlogRootInvalid":
      return { message: text.backlogRootInvalid(reason.path), field: "backlogRoot" };
    case "invalidSlug":
      return { message: slugGrammarMessage(reason.slug), field: "slug" };
    case "duplicateSlug":
      return { message: msg().projectRegister.problem.slugTaken(reason.slug), field: "slug" };
    case "slugNotFound":
      return { message: text.slugNotFound(reason.slug), field: null };
    case "nonAbsoluteRoot":
      return { message: text.nonAbsoluteRoot(reason.path), field: "projectRoot" };
    case "duplicateRoot":
      return { message: text.duplicateRoot(reason.slug), field: "projectRoot" };
    case "invalidStatusAlias":
      return {
        message: text.invalidStatusAlias(
          reason.key,
          reason.value,
          CANONICAL_STATUS_NAMES.join(" / "),
        ),
        field: "aliases",
      };
  }
}

function slugGrammarMessage(slug: string): string {
  const text = msg().projectRegister;
  return text.problem.slugGrammar(slug === "" ? text.problem.emptySlug : slug);
}
