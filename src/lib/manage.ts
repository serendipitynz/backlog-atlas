/**
 * 文書・マイルストーン管理と新規タスク作成 (doc-5 §3.2, TASK-40) as pure functions — three of
 * プロジェクト詳細画面's 区画 since doc-10 §5-§7. The screen (`ProjectDetail.svelte`) is
 * markup over these values: what each form holds, which 更新操作 it turns into, and which operations
 * are withheld with which reason. Nothing here calls the boundary — the component issues the action a
 * builder hands it — so every rule below is testable without a CLI or a mounted component.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `edit.ts` and the Rust modules' convention.
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-10 §7 作成時に渡す範囲 | [`TaskCreateInput`] + [`buildTaskCreate`] | the 新規タスク作成 form and the `task create` it issues |
 * | doc-5 §3 doc create 写像 | [`DocCreateInput`] + [`buildDocCreate`] | the 文書作成 form and its operation |
 * | doc-5 §3.2 文書更新（本文全置換） | [`DocSession`] + [`buildDocUpdate`] | the 文書更新 session and its operation |
 * | doc-5 §3 milestone add 写像 | [`MilestoneAddInput`] + [`buildMilestoneAdd`] | the マイルストーン作成 form and its operation |
 * | doc-10 §6 改称・削除・アーカイブ | [`MilestoneRenameInput`] / [`MilestoneRemoveInput`] + their builders | the three operations doc-9 §4.2 made checkable, and what each requires before it is offered |
 * | doc-9 §4.2.2 参照タスク集合 | [`referencingTasks`] | the active tasks a 参照追随書き換え may rewrite, shown before the user commits |
 * | doc-9 §4.2.2 参照追随書き換えを伴うか | [`followsReferences`] | which of the six operations carries the fan-out |
 * | doc-5 §3.1/§3.2 作成後の説明編集は出さない | [`MILESTONE_DESCRIPTION_NOT_EDITABLE`] | the reason shown beside every milestone's description |
 * | doc-10 §1 提供しない操作区画 | [`WithheldOperation`] + [`WITHHELD_DOCUMENT_OPERATIONS`] / [`WITHHELD_MILESTONE_OPERATIONS`] | the material for laying an operation decided against out as 名称・写像先・理由 |
 * | doc-10 §7 作成フォームを絞るのは製品判断 | [`TASK_CREATE_OMITTED_FIELDS`] | the fields with no input, each with its reason and its post-creation route |
 * | doc-5 §5 縮退 | [`issueAvailability`] via `readinessReason` | no supported CLI, so no operation is offered at all |
 * | doc-9 §5 提示の区別 | [`IssueOutcome`] + [`outcomeMessage`] | 更新前競合 / 照合不能 / CLI 失敗 stated apart |
 *
 * Three rules the whole module follows, the same three `edit.ts` follows:
 *
 * - **Touched, not merely different**. A field the user did not touch is never sent, so issuing a
 *   文書更新 cannot revert a facet someone else changed between the read and the save.
 * - **The CLI's limits are anticipated, not discovered** (doc-5 §5). An operation v1.47.1 cannot
 *   perform, and one the boundary refuses before launch (doc-9 §4.2), is withheld here rather than
 *   issued and rejected.
 * - **A withheld operation says why**. Nothing is silently missing: either it is offered, or it
 *   carries the reason it is not — and for 照合不能 that reason states it is *not* a version
 *   divergence (doc-9 §5).
 */

import { readinessReason } from "./edit";
import { conflictSetDetail } from "./mark";
import type {
  CliReadiness,
  ConflictSet,
  Document,
  DocUpdate,
  Milestone,
  TaskView,
  UpdateOperation,
} from "./wire";

// --- 発行できる／できない (doc-5 §5) --------------------------------------------------------

/**
 * What a form would issue. `blocked` is doc-5 の制約の先取り: the action is not built at all, so the
 * adapter is never asked to reject it — the screen disables the control that would produce it and
 * states the reason with the same words.
 */
export type IssuePlan =
  | { state: "ready"; action: UpdateOperation[] }
  | { state: "blocked"; reason: string };

export type IssueAvailability = { state: "ready" } | { state: "blocked"; reason: string };

/**
 * Why every 発行 control is withheld while one action is in flight. Exported so that the controls the
 * screen withholds for the same reason — 文書の編集 among them, which builds no plan of its own — say
 * it in the same words as the ones `issueAvailability` speaks for (doc-11 §5 理由の無い無効化を残さない).
 */
export const ISSUE_BUSY_REASON = "発行中です";

/**
 * Whether a form's 発行 control may be pressed, and the reason when it may not. One decision for
 * both the disabled state and the message: derived separately, a state that stops the issue from
 * happening can still leave the button looking pressable — the one outcome doc-5 §5 rules out.
 */
export function issueAvailability(
  plan: IssuePlan,
  context: {
    readiness: CliReadiness | null;
    busy: boolean;
    /**
     * A screen-specific reason to hold issuance, or `null`. Taken as a reason rather than a flag so
     * the caller's own cause is what the control states: プロジェクト詳細画面 holds every 区画 while
     * a ledger write is in flight, because that write may move the roots — a different thing from
     * `busy`, and one `ISSUE_BUSY_REASON` would misdescribe.
     */
    hold?: string | null;
  },
): IssueAvailability {
  // Ordered as the obstacles are: without a supported CLI nothing can be issued whatever the form
  // holds; a hold outranks the form for the same reason (it is about the target, not the input);
  // and a form still filling in is the user's own next step.
  const degraded = readinessReason(context.readiness);
  if (degraded !== null) return { state: "blocked", reason: degraded };
  if (context.hold != null) return { state: "blocked", reason: context.hold };
  if (context.busy) return { state: "blocked", reason: ISSUE_BUSY_REASON };
  return plan.state === "ready" ? { state: "ready" } : { state: "blocked", reason: plan.reason };
}

// --- 入力の共通規則 ----------------------------------------------------------------------------

/** Trim each value and drop the empty ones — list fields are edited row by row, and a blank row is
 * an unfilled one rather than an empty label/criterion the CLI should be asked to create. */
function cleaned(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value !== "");
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Why a comma cannot appear in a label or a tag. `task create --labels` and `doc update --tags` take
 * *one* comma-separated value in v1.47.1 (doc-5 §3, `update.rs`), so a value containing a comma would
 * silently become two — the failure mode worth anticipating, since nothing would report it.
 */
export function commaReason(what: string, value: string): string {
  return (
    `${what}に「,」を含められません（v1.47.1 の CLI は 1 個のカンマ区切り値として受け取るため、` +
    `「${value}」は 2 件に分かれます。doc-5 §3）`
  );
}

function firstWithComma(values: readonly string[]): string | undefined {
  return values.find((value) => value.includes(","));
}

// --- 新規タスク作成 (doc-5 §3 task create・doc-10 §7 作成時に渡す範囲, AC #1) ------------------

/**
 * The 新規タスク作成 form: the range Atlas passes at create time (doc-10 §7) — title・description・
 * status・labels・priority・milestone・AC.
 *
 * Narrower than what the CLI accepts, and narrowed by product judgment rather than by capability:
 * v1.47.1's `task create` also takes `-a`・`--plan`・`--notes`・`--ref`・`--depends-on` and stores
 * them in the created file (doc-5 §3, 2026-07-29 実測). The form holds what identifies and
 * classifies a task at the moment it is created; plan・notes・references・dependencies accrue while
 * the work runs and are edited from タスク詳細 (doc-8 §6), so a field here would only move the same
 * input earlier. assignee is the one omission with no create-time substitute, and is closed on the
 * edit side instead (`EditDraft.assignee`, TASK-57) — assignment changes over a task's life, and a
 * create-only route would set it once and never again.
 */
export interface TaskCreateInput {
  title: string;
  description: string;
  /** Raw frontmatter status. `""` leaves it to the CLI's `default_status`. */
  status: string;
  labels: string[];
  priority: string;
  milestone: string;
  acceptanceCriteria: string[];
}

export const EMPTY_TASK_CREATE: TaskCreateInput = {
  title: "",
  description: "",
  status: "",
  labels: [],
  priority: "",
  milestone: "",
  acceptanceCriteria: [],
};

export const TASK_TITLE_REQUIRED_REASON =
  "title は必須です（`task create` の位置引数であり、doc-4 §3.1 の必須項目でもあります）";

/**
 * Whether the 新規タスク作成 form holds anything the user typed. Part of the screen's 未保存入力
 * signal: a create form is unmounted by a screen switch just as an edit session is, and input that
 * was never issued is as much the user's as input that was (doc-8 §6.3 破棄前確認).
 */
export function hasTaskCreateInput(input: TaskCreateInput): boolean {
  return (
    input.title.trim() !== "" ||
    input.description.trim() !== "" ||
    input.status !== "" ||
    input.priority !== "" ||
    input.milestone !== "" ||
    input.labels.length > 0 ||
    input.acceptanceCriteria.length > 0
  );
}

/** Turn the form into the `task create` operation doc-5 §3 maps it to (AC #1). */
export function buildTaskCreate(input: TaskCreateInput): IssuePlan {
  const title = input.title.trim();
  if (title === "") return { state: "blocked", reason: TASK_TITLE_REQUIRED_REASON };

  const labels = cleaned(input.labels);
  const badLabel = firstWithComma(labels);
  if (badLabel !== undefined) {
    return { state: "blocked", reason: commaReason("ラベル", badLabel) };
  }

  const operation: Extract<UpdateOperation, { op: "taskCreate" }> = { op: "taskCreate", title };
  // Each optional field is *omitted* when unset rather than sent empty: an empty `--status` would
  // ask the CLI to set a status of "", where leaving it out is what makes `default_status` apply.
  if (input.description.trim() !== "") operation.description = input.description;
  if (input.status !== "") operation.status = input.status;
  if (labels.length > 0) operation.labels = labels;
  if (input.priority !== "") operation.priority = input.priority;
  if (input.milestone !== "") operation.milestone = input.milestone;
  const ac = cleaned(input.acceptanceCriteria);
  if (ac.length > 0) operation.acceptanceCriteria = ac;

  return { state: "ready", action: [operation] };
}

// --- 文書作成 (doc-5 §3 doc create, AC #2) -----------------------------------------------------

/** `doc create -t` の値域 (doc-5 §3). A value outside it is not offered; the CLI defines no other. */
export const DOC_TYPES = ["readme", "guide", "specification", "other"] as const;

export interface DocCreateInput {
  title: string;
  /** `""` leaves `-t` off, so the CLI's own default type applies. */
  docType: string;
  /** `-p`: where under the docs directory the file goes. `""` leaves it off. */
  path: string;
}

export const EMPTY_DOC_CREATE: DocCreateInput = { title: "", docType: "", path: "" };

export const DOC_TITLE_REQUIRED_REASON =
  "title は必須です（`doc create` の位置引数であり、doc-4 §3.2 の必須項目でもあります）";

/** Whether the 文書作成 form holds anything the user typed — see [`hasTaskCreateInput`]. */
export function hasDocCreateInput(input: DocCreateInput): boolean {
  return input.title.trim() !== "" || input.docType !== "" || input.path.trim() !== "";
}

export function buildDocCreate(input: DocCreateInput): IssuePlan {
  const title = input.title.trim();
  if (title === "") return { state: "blocked", reason: DOC_TITLE_REQUIRED_REASON };

  const operation: Extract<UpdateOperation, { op: "docCreate" }> = { op: "docCreate", title };
  if (input.docType !== "") operation.docType = input.docType;
  if (input.path.trim() !== "") operation.path = input.path.trim();
  return { state: "ready", action: [operation] };
}

// --- 文書更新 (doc-5 §3.2 本文全置換, AC #2) ---------------------------------------------------

/**
 * The 文書更新 form's values. `content` is the **whole** body: `doc update --content` full-replaces
 * it and v1.47.1 has no partial update (doc-5 §3.1), so the editor is seeded with the body as read
 * and a partial edit is reduced to handing back the edited whole (doc-5 §3.2, AC #2).
 */
export interface DocDraft {
  title: string;
  content: string;
  docType: string;
  /**
   * `-p`. Not seeded from the read model: the model holds the file's `source_path`, which is not the
   * value `-p` takes, and writing a guess into the field would issue a move the user never asked for.
   * Empty therefore means 変更しない, never 現在値.
   */
  path: string;
  tags: string[];
}

export type DocField = keyof DocDraft;

/**
 * 文書の編集セッション. `baseline` is the read the input was made against, held by the session
 * rather than taken from the screen, so a reload arriving mid-edit does not rewrite 未保存入力 —
 * the same rule doc-8 §6.4 fixes for tasks.
 */
export interface DocSession {
  baseline: Document;
  draft: DocDraft;
  touched: DocField[];
}

export function docDraftFrom(document: Document): DocDraft {
  return {
    title: document.title,
    content: document.body ?? "",
    docType: document.type ?? "",
    path: "",
    tags: [...document.tags],
  };
}

export function startDocSession(document: Document): DocSession {
  return { baseline: document, draft: docDraftFrom(document), touched: [] };
}

/** Record a change and mark its field touched. Returns a new session; nothing is mutated. */
export function setDocField<K extends DocField>(
  session: DocSession,
  key: K,
  value: DocDraft[K],
): DocSession {
  return {
    ...session,
    draft: { ...session.draft, [key]: value },
    touched: session.touched.includes(key) ? session.touched : [...session.touched, key],
  };
}

function docChanged(session: DocSession, field: DocField): boolean {
  const { draft, baseline } = session;
  switch (field) {
    case "title":
      return draft.title !== baseline.title;
    case "content":
      return draft.content !== (baseline.body ?? "");
    case "docType":
      // `""` is 変更しない, not 未設定へ戻す: v1.47.1 has no way to unset a document's type.
      return draft.docType !== "" && draft.docType !== (baseline.type ?? "");
    case "path":
      // No baseline to compare against (see `DocDraft.path`), so any value is a move request.
      return draft.path.trim() !== "";
    case "tags":
      return !sameList(draft.tags, baseline.tags);
  }
}

/** The fields that would be sent: touched *and* different from the baseline. */
export function docDirtyFields(session: DocSession): DocField[] {
  return session.touched.filter((field) => docChanged(session, field));
}

export function isDocDirty(session: DocSession): boolean {
  return docDirtyFields(session).length > 0;
}

export const DOC_NOTHING_TO_UPDATE_REASON = "変更はまだありません";

export const DOC_TITLE_EMPTY_REASON =
  "title を空にはできません（doc-4 §3.2 の必須項目で、空にすると文書として読めなくなります）";

/**
 * Why the last tag cannot be removed. `--tags ""` is not among the behaviours doc-5 §3.1 measured on
 * v1.47.1 — `--ref ""` and `--depends-on ""` were, and both exit 0 while clearing nothing. Offering
 * a clear whose effect is unconfirmed would promise something that may silently not happen, so it is
 * withheld rather than issued and hoped for.
 */
export const DOC_EMPTY_TAGS_REASON =
  "tags を空にする操作は提供しません（v1.47.1 で `--tags \"\"` の効果が確認されておらず、" +
  "同型の `--ref \"\"`・`--depends-on \"\"` は終了コード 0 のまま何も消さないことが実測されているため。doc-5 §3.1）";

/** The values a 文書更新 asserts, kept so the re-read can be checked against them ([`docDivergence`]). */
export interface DocSubmitted {
  title?: string;
  /** The whole body, since `--content` full-replaces it — the value most worth checking back. */
  content?: string;
  docType?: string;
  tags?: string[];
}

/** [`buildDocUpdate`]'s result: an [`IssuePlan`] that also carries what the save asserts. */
export type DocUpdatePlan =
  | { state: "ready"; action: UpdateOperation[]; submitted: DocSubmitted }
  | { state: "blocked"; reason: string };

/**
 * Turn the session into the `doc update` operation doc-5 §3 maps it to (AC #2). Every changed field
 * goes in one call, which is doc-5 §3's "まとめられる範囲でまとめる" — and it keeps the action
 * single-invocation, so a failure cannot leave a partial application to reconcile (doc-5 §5).
 */
export function buildDocUpdate(session: DocSession): DocUpdatePlan {
  const dirty = docDirtyFields(session);
  if (dirty.length === 0) return { state: "blocked", reason: DOC_NOTHING_TO_UPDATE_REASON };

  const draft = session.draft;
  const update: DocUpdate = {};
  const submitted: DocSubmitted = {};
  for (const field of dirty) {
    switch (field) {
      case "title":
        if (draft.title.trim() === "") return { state: "blocked", reason: DOC_TITLE_EMPTY_REASON };
        update.title = draft.title.trim();
        submitted.title = update.title;
        break;
      case "content":
        // 本文全置換 (doc-5 §3.2): what goes over the wire is the whole body, edited or not.
        update.content = draft.content;
        submitted.content = draft.content;
        break;
      case "docType":
        update.docType = draft.docType;
        submitted.docType = draft.docType;
        break;
      case "path":
        // Not asserted: `-p` moves the file, and the model holds no field to compare the result to.
        update.path = draft.path.trim();
        break;
      case "tags": {
        const tags = cleaned(draft.tags);
        if (tags.length === 0) return { state: "blocked", reason: DOC_EMPTY_TAGS_REASON };
        const bad = firstWithComma(tags);
        if (bad !== undefined) return { state: "blocked", reason: commaReason("タグ", bad) };
        update.tags = tags;
        submitted.tags = tags;
        break;
      }
    }
  }

  return {
    state: "ready",
    action: [{ op: "docUpdate", docId: session.baseline.id, update }],
    submitted,
  };
}

/**
 * Which submitted values the re-read disagrees with — doc-9 §5's 事後通知 for documents, the same
 * best-effort notice `edit.ts` gives tasks. It matters more here than anywhere else: `--content`
 * full-replaces the body (doc-5 §3.1), so an external edit landing inside the 照合後競合窓 is
 * overwritten whole. Like the task one, it catches only the direction that survives — a write the
 * CLI's read-modify-write overwrote is already gone from the file — so it is a notice about the
 * limit, never a claim that nothing was lost (doc-9 §4.1).
 *
 * Text is compared trimmed and tags as a set: the CLI owns the file's formatting, and reporting its
 * own normalization as someone else's change would make the notice untrustworthy.
 */
export function docDivergence(submitted: DocSubmitted, document: Document | null): string[] {
  if (document === null) return ["文書（再読込結果に見当たりません）"];
  const diverged: string[] = [];
  const text = (label: string, sent: string | undefined, got: string | null) => {
    if (sent !== undefined && sent.trim() !== (got ?? "").trim()) diverged.push(label);
  };
  text("title", submitted.title, document.title);
  text("本文", submitted.content, document.body);
  text("type", submitted.docType, document.type);
  if (submitted.tags !== undefined && !sameSet(submitted.tags, document.tags)) {
    diverged.push("tags");
  }
  return diverged;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const norm = (values: readonly string[]) => [...values].map((value) => value.trim()).sort();
  return sameList(norm(a), norm(b));
}

// --- マイルストーン (doc-5 §3.2, doc-9 §4.2, AC #3/#5) -----------------------------------------

export interface MilestoneAddInput {
  name: string;
  /** 作成時のみ設定できる説明 (doc-5 §3.1). There is no update path for it — see below. */
  description: string;
}

export const EMPTY_MILESTONE_ADD: MilestoneAddInput = { name: "", description: "" };

export const MILESTONE_NAME_REQUIRED_REASON =
  "名称は必須です（`milestone add` の位置引数）";

/** Whether the マイルストーン作成 form holds anything the user typed — see [`hasTaskCreateInput`]. */
export function hasMilestoneAddInput(input: MilestoneAddInput): boolean {
  return input.name.trim() !== "" || input.description.trim() !== "";
}

export function buildMilestoneAdd(input: MilestoneAddInput): IssuePlan {
  const name = input.name.trim();
  if (name === "") return { state: "blocked", reason: MILESTONE_NAME_REQUIRED_REASON };
  const operation: Extract<UpdateOperation, { op: "milestoneAdd" }> = { op: "milestoneAdd", name };
  if (input.description.trim() !== "") operation.description = input.description;
  return { state: "ready", action: [operation] };
}

// --- 改称・削除・アーカイブ (doc-9 §4.2, doc-10 §6) --------------------------------------------

/**
 * 参照タスク集合 (doc-9 §4.2.2): the active tasks a 参照追随書き換え may rewrite. The same rule the
 * boundary checks against, computed here so the screen can show *what will be rewritten* before the
 * user commits — doc-10 §6 forbids issuing one of these without that list, because doc-9 §4.2.3
 * treats "the user decided from what they saw" as the thing the check protects.
 *
 * Wider than the read layer's reference resolution on purpose: v1.47.1 treats a value as a reference
 * when it matches the id *or* the title modulo surrounding whitespace and case — `"  M-0  "` is
 * rewritten by a rename of `m-0` (doc-9 §4.2.1). Tasks outside `tasks/` are excluded because no
 * operation was observed to touch them.
 */
export function referencingTasks(
  milestone: Milestone,
  tasks: readonly TaskView[],
): TaskView[] {
  const id = milestone.id.trim().toLowerCase();
  const title = milestone.title.trim().toLowerCase();
  return tasks.filter((view) => {
    if (view.task.storageState !== "active") return false;
    const value = view.task.milestone?.trim().toLowerCase();
    return value !== undefined && (value === id || value === title);
  });
}

/**
 * Whether an operation carries a 参照追随書き換え (doc-9 §4.2.2), i.e. whether [`referencingTasks`]
 * is part of its 書き換え対象集合. Keyed on the built operation rather than on the form, so the
 * screen cannot describe one operation and issue another. Which three fan out comes from doc-9
 * §4.2.1's measurement, not from the flag names.
 */
export function followsReferences(operation: UpdateOperation): boolean {
  switch (operation.op) {
    case "milestoneRename":
      return operation.updateTasks;
    case "milestoneRemove":
      return operation.taskHandling.mode !== "keep";
    default:
      return false;
  }
}

/** 改称の入力 (doc-10 §6). `updateTasks` false adds `--no-update-tasks`. */
export interface MilestoneRenameInput {
  to: string;
  updateTasks: boolean;
}

/** 参照するタスクも更新する側を既定にする (doc-10 §6): leaving stale references behind is the
 * exception, so it is the box the user has to clear. */
export const EMPTY_MILESTONE_RENAME: MilestoneRenameInput = { to: "", updateTasks: true };

export const MILESTONE_RENAME_REQUIRED_REASON =
  "新しい名称は必須です（`milestone rename <from> <to>` の位置引数）";

export const MILESTONE_RENAME_UNCHANGED_REASON =
  "現在の名称と同じです（変更が無いので発行しません）";

export function buildMilestoneRename(
  milestone: Milestone,
  input: MilestoneRenameInput,
): IssuePlan {
  const to = input.to.trim();
  if (to === "") return { state: "blocked", reason: MILESTONE_RENAME_REQUIRED_REASON };
  // The CLI compares titles ignoring case and surrounding space (doc-9 §4.2.1), so a rename that
  // differs only there would be issued as a change and land as none.
  if (to.toLowerCase() === milestone.title.trim().toLowerCase()) {
    return { state: "blocked", reason: MILESTONE_RENAME_UNCHANGED_REASON };
  }
  return {
    state: "ready",
    // The id is sent as `<from>`, never the title: the operand accepts either, and the id is the one
    // that cannot become ambiguous between two milestones sharing a title.
    action: [
      { op: "milestoneRename", from: milestone.id, to, updateTasks: input.updateTasks },
    ],
  };
}

/** How `milestone remove` treats referencing tasks (doc-5 §3). `null` は未選択 — doc-10 §6 makes it
 * a required choice, so nothing is issued until the user has made it. */
export interface MilestoneRemoveInput {
  handling: "clear" | "keep" | "reassign" | null;
  /** `--reassign-to`, required by `reassign` alone. Holds a milestone id. */
  reassignTo: string;
}

export const EMPTY_MILESTONE_REMOVE: MilestoneRemoveInput = { handling: null, reassignTo: "" };

export const MILESTONE_REMOVE_HANDLING_REQUIRED_REASON =
  "参照するタスクの扱いを選んでください（`--task-handling <clear|keep|reassign>`）";

export const MILESTONE_REASSIGN_TARGET_REQUIRED_REASON =
  "付け替え先のマイルストーンは必須です（`--reassign-to <milestone>`）";

export const MILESTONE_REASSIGN_TARGET_IS_SELF_REASON =
  "付け替え先が削除するマイルストーン自身です";

/**
 * v1.47.1 の削除はファイルを消さない (doc-9 §4.2.1 実測): the milestone file moves to
 * `archive/milestones/`. Stated beside the control because "削除" otherwise reads as an unlink, and
 * doc-10 §6 asks the screen to keep the CLI's word while saying what actually happens.
 */
export const MILESTONE_REMOVE_MOVES_THE_FILE =
  "削除はマイルストーンのファイルを消さず `archive/milestones/` へ移します（v1.47.1 実測）";

/** `keep` leaves referencing tasks pointing at a milestone that is no longer in the root. */
export const MILESTONE_KEEP_LEAVES_DANGLING_REFERENCES =
  "「そのまま保持」では、参照するタスクが解決先の無い milestone 値を持ったまま残ります";

export function buildMilestoneRemove(
  milestone: Milestone,
  input: MilestoneRemoveInput,
): IssuePlan {
  if (input.handling === null) {
    return { state: "blocked", reason: MILESTONE_REMOVE_HANDLING_REQUIRED_REASON };
  }
  if (input.handling !== "reassign") {
    return {
      state: "ready",
      action: [
        {
          op: "milestoneRemove",
          name: milestone.id,
          taskHandling: { mode: input.handling },
        },
      ],
    };
  }
  const to = input.reassignTo.trim();
  if (to === "") {
    return { state: "blocked", reason: MILESTONE_REASSIGN_TARGET_REQUIRED_REASON };
  }
  if (to === milestone.id) {
    return { state: "blocked", reason: MILESTONE_REASSIGN_TARGET_IS_SELF_REASON };
  }
  return {
    state: "ready",
    action: [
      {
        op: "milestoneRemove",
        name: milestone.id,
        taskHandling: { mode: "reassign", to },
      },
    ],
  };
}

/** アーカイブ (doc-10 §6). Nothing to validate: the operand is the milestone the user picked. */
export function buildMilestoneArchive(milestone: Milestone): IssuePlan {
  return { state: "ready", action: [{ op: "milestoneArchive", name: milestone.id }] };
}

/**
 * Why an existing milestone's description has no edit control (doc-5 §3.1/§3.2). Carried as the
 * reason of the 提供しない操作区画's `describe` entry (doc-10 §6) rather than as a hint beside the
 * descriptions: doc-11 §5 puts operations Atlas has decided not to offer in that 区画, and a sentence
 * floating beside the list would state the same absence in a second place with no 写像先 beside it.
 */
export const MILESTONE_DESCRIPTION_NOT_EDITABLE =
  "作成後の説明の編集は提供しません。v1.47.1 の `milestone` に update/edit サブコマンドが無く、" +
  "説明は `milestone add -d` で作成時にのみ設定できます（`rename` は名称だけを変え、説明は変えません）。" +
  "CLI が提供するまで Atlas も提供しません（doc-5 §3.1・§3.2）";

/**
 * One item of a 提供しない操作区画 (doc-10 §1/§6). It holds the three points the 区画 lays out —
 * 名称, the CLI it maps to, and the reason — because that is the shape doc-11 §5 asks for: a
 * disabled button means「今は条件が揃っていない」, while what is listed here is what Atlas decided
 * not to offer in this version.
 *
 * `kind` need only be unique within its own list (it is the `{#each}` key, and how a test names an
 * entry). Documents and milestones keep separate lists because each 区画 carries its own
 * (doc-10 §5/§6).
 */
export interface WithheldOperation {
  kind: string;
  label: string;
  /** 操作写像 (doc-5 §3): what the entry *would* issue, so the withheld operation is still legible. */
  mapping: string;
  reason: string;
}

/**
 * What the マイルストーン区画 still withholds (doc-10 §6). 改称・削除・アーカイブ left this list once
 * doc-9 §4.2 defined their 照合 (TASK-45); what remains is missing for the other family of reason —
 * v1.47.1 has no subcommand for it — so no entry here speaks of 照合不能 any more. Kept as a list of
 * one rather than folded into a sentence: the 区画's three points (名称・写像先・理由) are what tell
 * "Atlas decided against this" apart from a disabled button (doc-11 §5).
 */
export const WITHHELD_MILESTONE_OPERATIONS: WithheldOperation[] = [
  {
    kind: "describe",
    label: "作成後の説明の編集",
    mapping: "`milestone` に update/edit 相当なし（`milestone add -d` は作成時のみ）",
    reason: MILESTONE_DESCRIPTION_NOT_EDITABLE,
  },
];

// --- 文書の提供しない操作 (doc-10 §5) ---------------------------------------------------------

/**
 * The 文書区画's 提供しない操作区画 (doc-10 §5). One entry, but laid out in the same three points as
 * the milestone list: "there is no unpressable button here" and "this was decided against" are only
 * told apart when the presentation matches.
 *
 * The delete is absent for two reasons in sequence. v1.47.1's `doc` has no delete/remove, and
 * filling that gap by having Atlas unlink the file itself is outside decision-2's boundary (reads
 * parse directly, writes go through the CLI). Same standing as the milestone description edit:
 * Atlas offers it when the CLI does.
 */
export const WITHHELD_DOCUMENT_OPERATIONS: WithheldOperation[] = [
  {
    kind: "remove",
    label: "文書の削除",
    mapping: "`doc` に delete/remove 相当のサブコマンドなし",
    reason:
      "v1.47.1 の `doc` に削除サブコマンドが無く、Atlas が管理ファイルを直接消すことは " +
      "decision-2 の境界（更新は Backlog CLI 経由）の外にあるため提供しません（doc-10 §5）。" +
      "文書を消す必要があるときは、対象プロジェクトで直接ファイルを操作してください。",
  },
];

// --- 新規タスク区画で欄を置かない項目 (doc-10 §7) ----------------------------------------------

/** One field the create form does not offer, with its reason and its post-creation route. */
export interface OmittedCreateField {
  label: string;
  /** The flag v1.47.1's `task create` takes it on — shown so the absence cannot read as「CLI に無い」. */
  flag: string;
  /** Why there is no field. Written as a product judgment — doc-10 §7 forbids「CLI に無い」. */
  reason: string;
  /** Where it can be added after creation. Differs per field (doc-10 §7). */
  after: string;
}

/**
 * The fields `task create` accepts and this 区画 does not offer (doc-10 §7). Held so the screen can
 * state the reason: explaining the absence as「CLI に無いから」would be false — the CLI does accept
 * them (doc-5 §3, measured 2026-07-29) — and would leave the CLI as a pretext for widening the form
 * later.
 */
export const TASK_CREATE_SCOPE_NOTE =
  "作成フォームは、タスクを識別し分類するのに要る項目へ絞ってあります。" +
  "以下は v1.47.1 の `task create` が受け取り、作成された管理ファイルへ保存する項目ですが" +
  "（doc-5 §3、2026-07-29 実測）、Atlas の製品判断で欄を置いていません（doc-10 §7）。";

export const TASK_CREATE_OMITTED_FIELDS: OmittedCreateField[] = [
  {
    label: "assignee",
    flag: "-a",
    reason:
      "割当は作業の進行につれて変わるため、作成時にだけ設定できて後から変えられない経路を作らない" +
      "（TASK-57 の決定で編集側に閉じた）。",
    after:
      "タスク詳細の編集（doc-8 §6）で設定・変更します。ただし解除だけは CLI に手段がありません" +
      "（`-a \"\"` は沈黙無変更。doc-5 §3.1）。",
  },
  {
    label: "実装計画",
    flag: "--plan",
    reason: "作業を始めてから書くものであり、作成時点で書ける内容ではない。",
    after: "タスク詳細の編集（doc-8 §6）で足します。",
  },
  {
    label: "実装ノート",
    flag: "--notes",
    reason: "作業中に積み上がるものであり、作成時点で書ける内容ではない。",
    after: "タスク詳細の編集（doc-8 §6）で足します。",
  },
  {
    label: "References",
    flag: "--ref",
    reason: "参照は作業の過程で増えるもので、作成フォームに置いても同じ入力を前倒しするだけになる。",
    after: "タスク詳細の編集（doc-8 §6）で足します。",
  },
  {
    label: "依存",
    flag: "--depends-on",
    reason: "依存関係は着手の前後で判明するもので、作成時点に固定すべき分類ではない。",
    after: "タスク詳細の編集（doc-8 §6）で足します。",
  },
];

// --- 発行結果の提示 (doc-9 §5) -----------------------------------------------------------------

/**
 * What became of one issued action, as the screen needs it. Narrower than the boundary's
 * `UpdateResult`: the re-read belongs to the shell, which owns the snapshot the whole screen draws
 * from. The four states are kept apart because doc-9 §5 requires 更新前競合 and 照合不能 to read
 * differently — one is "we checked and it diverged", the other "there is no defined way to check".
 */
export type IssueOutcome =
  | { state: "applied" }
  | ({ state: "conflict" } & ConflictSet)
  | { state: "uncheckable"; detail: string }
  | { state: "failed"; detail: string };

/** One issued action's result as the screen states it. `done` names what succeeded. */
export function outcomeMessage(outcome: IssueOutcome, done: string): string {
  switch (outcome.state) {
    case "applied":
      return done;
    case "conflict":
      return (
        `${conflictSetDetail(outcome)}。CLI を起動せずに中止しました` +
        "（更新前競合。doc-9 §5）。最新を読み直したので、内容を確かめてからやり直してください"
      );
    case "uncheckable":
      return outcome.detail;
    case "failed":
      return outcome.detail;
  }
}
