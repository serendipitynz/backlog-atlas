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
 * | doc-5 §1/§3 マイルストーン説明の更新（直接書き込み操作） | [`buildMilestoneDescribe`] | the 説明 edit and the one operation on this screen that is not a CLI call (decision-21) |
 * | doc-10 §6 行頭 `##` を拒む入力検査 | [`milestoneDescriptionHeadingReason()`] | why a heading in the 説明 is refused: it would fall outside the range read back |
 * | doc-10 §7 注記モーダル | [`taskCreateNote()`] + [`taskCreateLaterFields()`] | 代替経路の案内 (doc-11 §8): where the fields this form has no input for are added instead |
 * | doc-5 §5 縮退 | [`issueAvailability`] via `readinessReason` | no supported CLI, so no operation is offered at all |
 * | doc-9 §5 提示の区別 | [`IssueOutcome`] + [`outcomeMessage`] | 更新前競合 / 照合不能 / CLI 失敗 stated apart |
 *
 * Three rules the whole module follows, the same three `edit.ts` follows:
 *
 * - **Touched, not merely different**. A field the user did not touch is never sent, so issuing a
 *   文書更新 cannot revert a facet someone else changed between the read and the save.
 * - **The CLI's limits are anticipated, not discovered** (doc-5 §5). An operation v1.49.3 cannot
 *   perform, and one the boundary refuses before launch (doc-9 §4.2), is withheld here rather than
 *   issued and rejected. The one exception is the 直接書き込み操作, which v1.49.3 cannot perform and
 *   Atlas offers anyway — under decision-21's three conditions, not because the gap was awkward.
 * - **A control that is on screen but cannot be pressed says why** (doc-11 §5). What is *not* on
 *   screen says nothing: TASK-123 dropped the 提供しない操作区画 that listed the operations Atlas
 *   does not offer, because Atlas draws on backlog.md's CLI and the absence of what that CLI has no
 *   subcommand for is what the product is. 照合不能 still states it is *not* a version divergence
 *   (doc-9 §5) — that one is a reason a *pressable* control was turned away.
 */

import { commaReason, firstWithComma } from "./comma";
import { msg } from "./messages";
import { nothingToSaveReason, readinessReason } from "./edit";
import { conflictSetDetail } from "./mark";
import { overviewInputProblemsReason, overviewNoChangesReason } from "./project-detail";
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
export function issueBusyReason(): string {
  return msg().projectDetail.issueBusy;
}

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
     * `busy`, and one `issueBusyReason()` would misdescribe.
     */
    hold?: string | null;
  },
): IssueAvailability {
  // Ordered as the obstacles are: without a supported CLI nothing can be issued whatever the form
  // holds; a hold outranks the form for the same reason (it is about the target, not the input);
  // and a form still filling in is the user's own next step.
  const degraded = readinessReason(context.readiness);
  if (degraded !== null) {
    return { state: "blocked", reason: degraded };
  }
  if (context.hold != null) {
    return { state: "blocked", reason: context.hold };
  }
  if (context.busy) {
    return { state: "blocked", reason: issueBusyReason() };
  }
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

// --- 新規タスク作成 (doc-5 §3 task create・doc-10 §7 作成時に渡す範囲, AC #1) ------------------

/**
 * The 新規タスク作成 form: the range Atlas passes at create time (doc-10 §7) — title・description・
 * status・labels・priority・milestone・AC.
 *
 * Narrower than what the CLI accepts, and narrowed by product judgment rather than by capability:
 * v1.49.3's `task create` also takes `-a`・`--plan`・`--notes`・`--ref`・`--depends-on` and stores
 * them in the created file (doc-5 §3, measured 2026-08-12 on v1.49.3). The form holds what identifies and
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

export function taskTitleRequiredReason(): string {
  return msg().field.titleRequiredReason;
}

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
  if (title === "") {
    return { state: "blocked", reason: taskTitleRequiredReason() };
  }

  const labels = cleaned(input.labels);
  const badLabel = firstWithComma(labels);
  if (badLabel !== undefined) {
    return { state: "blocked", reason: commaReason(msg().field.labelWord, badLabel) };
  }

  const operation: Extract<UpdateOperation, { op: "taskCreate" }> = { op: "taskCreate", title };
  // Each optional field is *omitted* when unset rather than sent empty: an empty `--status` would
  // ask the CLI to set a status of "", where leaving it out is what makes `default_status` apply.
  if (input.description.trim() !== "") {
    operation.description = input.description;
  }
  if (input.status !== "") {
    operation.status = input.status;
  }
  if (labels.length > 0) {
    operation.labels = labels;
  }
  if (input.priority !== "") {
    operation.priority = input.priority;
  }
  if (input.milestone !== "") {
    operation.milestone = input.milestone;
  }
  const ac = cleaned(input.acceptanceCriteria);
  if (ac.length > 0) {
    operation.acceptanceCriteria = ac;
  }

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

export function docTitleRequiredReason(): string {
  return msg().field.titleRequiredReason;
}

/** Whether the 文書作成 form holds anything the user typed — see [`hasTaskCreateInput`]. */
export function hasDocCreateInput(input: DocCreateInput): boolean {
  return input.title.trim() !== "" || input.docType !== "" || input.path.trim() !== "";
}

export function buildDocCreate(input: DocCreateInput): IssuePlan {
  const title = input.title.trim();
  if (title === "") {
    return { state: "blocked", reason: docTitleRequiredReason() };
  }

  const operation: Extract<UpdateOperation, { op: "docCreate" }> = { op: "docCreate", title };
  if (input.docType !== "") {
    operation.docType = input.docType;
  }
  if (input.path.trim() !== "") {
    operation.path = input.path.trim();
  }
  return { state: "ready", action: [operation] };
}

// --- 文書更新 (doc-5 §3.2 本文全置換, AC #2) ---------------------------------------------------

/**
 * The 文書更新 form's values. `content` is the **whole** body: `doc update --content` full-replaces
 * it and v1.49.3 has no partial update (doc-5 §3.1), so the editor is seeded with the body as read
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
      // `""` is 変更しない, not 未設定へ戻す: v1.49.3 has no way to unset a document's type.
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

export function docNothingToUpdateReason(): string {
  return msg().state.nothingToSaveYet;
}

export function docTitleEmptyReason(): string {
  return msg().projectDetail.docTitleEmpty;
}

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
  if (dirty.length === 0) {
    return { state: "blocked", reason: docNothingToUpdateReason() };
  }

  const draft = session.draft;
  const update: DocUpdate = {};
  const submitted: DocSubmitted = {};
  for (const field of dirty) {
    switch (field) {
      case "title":
        if (draft.title.trim() === "") {
          return { state: "blocked", reason: docTitleEmptyReason() };
        }
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
        // 空集合の tags is タグ全消し (doc-10 §5), not "no tags to send": `--tags ""` clears them
        // (v1.49.3 実測). What must never reach here is an *untouched* tags field — that one is
        // absent from `dirty`, so the flag is not emitted at all and someone else's tags survive.
        const tags = cleaned(draft.tags);
        const bad = firstWithComma(tags);
        if (bad !== undefined) {
          return { state: "blocked", reason: commaReason(msg().field.tagWord, bad) };
        }
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
  if (document === null) {
    return [msg().projectDetail.divergedDocument];
  }
  const diverged: string[] = [];
  const text = (label: string, sent: string | undefined, got: string | null) => {
    if (sent !== undefined && sent.trim() !== (got ?? "").trim()) {
      diverged.push(label);
    }
  };
  text("title", submitted.title, document.title);
  text(msg().field.body, submitted.content, document.body);
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

export function milestoneNameRequiredReason(): string {
  return msg().projectDetail.nameRequiredReason;
}

/** Whether the マイルストーン作成 form holds anything the user typed — see [`hasTaskCreateInput`]. */
export function hasMilestoneAddInput(input: MilestoneAddInput): boolean {
  return input.name.trim() !== "" || input.description.trim() !== "";
}

export function buildMilestoneAdd(input: MilestoneAddInput): IssuePlan {
  const name = input.name.trim();
  if (name === "") {
    return { state: "blocked", reason: milestoneNameRequiredReason() };
  }
  const operation: Extract<UpdateOperation, { op: "milestoneAdd" }> = { op: "milestoneAdd", name };
  if (input.description.trim() !== "") {
    operation.description = input.description;
  }
  return { state: "ready", action: [operation] };
}

// --- 改称・削除・アーカイブ (doc-9 §4.2, doc-10 §6) --------------------------------------------

/**
 * 参照タスク集合 (doc-9 §4.2.2): the active tasks a 参照追随書き換え may rewrite. The same rule the
 * boundary checks against, computed here so the screen can show *what will be rewritten* before the
 * user commits — doc-10 §6 forbids issuing one of these without that list, because doc-9 §4.2.3
 * treats "the user decided from what they saw" as the thing the check protects.
 *
 * Wider than the read layer's reference resolution on purpose: v1.49.3 treats a value as a reference
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
    if (view.task.storageState !== "active") {
      return false;
    }
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

export function milestoneRenameRequiredReason(): string {
  return msg().projectDetail.renameRequiredReason;
}

export function milestoneRenameUnchangedReason(): string {
  return msg().projectDetail.renameUnchanged;
}

export function buildMilestoneRename(
  milestone: Milestone,
  input: MilestoneRenameInput,
): IssuePlan {
  const to = input.to.trim();
  if (to === "") {
    return { state: "blocked", reason: milestoneRenameRequiredReason() };
  }
  // The CLI compares titles ignoring case and surrounding space (doc-9 §4.2.1), so a rename that
  // differs only there would be issued as a change and land as none.
  if (to.toLowerCase() === milestone.title.trim().toLowerCase()) {
    return { state: "blocked", reason: milestoneRenameUnchangedReason() };
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

export function milestoneRemoveHandlingRequiredReason(): string {
  return msg().projectDetail.removeHandlingRequired;
}

export function milestoneReassignTargetRequiredReason(): string {
  return msg().projectDetail.reassignTargetRequired;
}

export function milestoneReassignTargetIsSelfReason(): string {
  return msg().projectDetail.reassignTargetIsSelf;
}

/**
 * 削除はファイルを消さない (doc-9 §4.2.1 実測): the milestone file moves to `archive/milestones/`.
 * Stated beside the control because "削除" otherwise reads as an unlink, and doc-10 §6 asks the screen
 * to keep the CLI's word while saying what actually happens. **The version measured stays in doc-9
 * §4.2.1 and off the screen** (decision-27).
 */
export function milestoneRemoveMovesTheFile(): string {
  return msg().projectDetail.removeMovesTheFile;
}

/** `keep` leaves referencing tasks pointing at a milestone that is no longer in the root. */
export function milestoneKeepLeavesDanglingReferences(): string {
  return msg().projectDetail.keepLeavesDangling;
}

export function buildMilestoneRemove(
  milestone: Milestone,
  input: MilestoneRemoveInput,
): IssuePlan {
  if (input.handling === null) {
    return { state: "blocked", reason: milestoneRemoveHandlingRequiredReason() };
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
    return { state: "blocked", reason: milestoneReassignTargetRequiredReason() };
  }
  if (to === milestone.id) {
    return { state: "blocked", reason: milestoneReassignTargetIsSelfReason() };
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
 * Why a description line beginning with `##` is refused (doc-10 §6, decision-21).
 *
 * The read layer takes 説明の本文範囲 up to the next `##`, and the write replaces that same range,
 * so a heading typed into the box would put the rest of what was typed *outside* the range that is
 * read back — saved to the file, invisible on screen. Refusing at the input is the same shape as
 * doc-10 §7's comma-in-a-label rule, and for the same kind of reason: the value would not survive
 * the round trip it appears to make.
 *
 * The reason is **not** "the CLI cannot do it" — v1.49.3's `milestone add -d` writes such a
 * description without complaint (measured 2026-08-12). doc-10 §1 asks that a stated reason be a
 * true one.
 */
export function milestoneDescriptionHeadingReason(): string {
  return msg().projectDetail.descriptionHeading;
}

/** A description whose text is unchanged has nothing to issue — the same 触っていない判定 the
 * document update form makes (doc-10 §5). */
export function milestoneDescriptionUnchangedReason(): string {
  return msg().projectDetail.descriptionUnchanged;
}

/**
 * The 保留理由 drawn without a visible sentence (doc-11 §8's two licences).
 *
 * Both licences are here, and they differ in what the *control* must be:
 *
 * - **① the 区画 states the reason** — a field marked「（必須）」sitting empty is itself the 常時表示
 *   補助文 §5's first form asks for, so those controls stay `disabled`
 *   (`taskTitleRequiredReason()`, `docTitleRequiredReason()`, `docTitleEmptyReason()`,
 *   `milestoneNameRequiredReason()`, `milestoneRenameRequiredReason()`), and so do the 概要区画's
 *   two (`overviewInputProblemsReason()` — every problem is printed under the field it is about;
 *   `overviewNoChangesReason()` — the 送信属性一覧 directly above the control says 変更なし).
 *   **概要区画の保存 keeps §5's second form even so**, because two of its four 保留理由 are 台帳読取専用
 *   and 発行中, which are on neither licence and keep a printed line: one control cannot take focus or
 *   not depending on *why* it is withheld. ① licences omitting the sentence, and that is what is
 *   omitted — the element stays in the DOM for `aria-describedby` to point at.
 * - **② nothing typed / nothing changed yet**, where the form itself makes the next move obvious.
 *   No marker states it, so these two take §5's *second* form — the control is `aria-disabled` and
 *   focusable, and `aria-describedby` names a span that is always in the DOM
 *   (`docNothingToUpdateReason()`, `milestoneDescriptionUnchangedReason()`, and
 *   `nothingToSaveReason()` — the タスク詳細's 保存, added 2026-08-10 from the 目視 on TASK-135).
 *   **`nothingToSaveReason()` is the first entry from outside プロジェクト詳細**, which is why this
 *   list sits beside `omitsSentence` rather than beside any one screen: the licence is a fact about
 *   the reason and its 区画, and both screens ask the same question of it.
 *
 * **Reasons caused from outside the form are on neither licence and keep their sentence** — CLI 縮退,
 * 台帳読取専用, 発行中, 競合. That is why this is a listed set and not a rule over all 保留理由: which
 * licence a reason has is a fact about its 区画, and adding an entry means checking that 区画.
 *
 * **Built where it is asked rather than once at load** (TASK-187): each entry now comes from the
 * 文言表, so a list frozen at import would answer for whichever 表示言語 happened to be in force then.
 * The comparison stays a string one — [`omitsSentence`] is handed a reason that was worded in the
 * same pass, so both sides are in the same language whichever language that is.
 */
function reasonsWithoutSentence(): readonly string[] {
  return [
    taskTitleRequiredReason(),
    docTitleRequiredReason(),
    docTitleEmptyReason(),
    docNothingToUpdateReason(),
    milestoneNameRequiredReason(),
    milestoneRenameRequiredReason(),
    milestoneDescriptionUnchangedReason(),
    nothingToSaveReason(),
    overviewInputProblemsReason(),
    overviewNoChangesReason(),
  ];
}

/** Whether this reason is drawn without a visible sentence (doc-11 §8). */
export function omitsSentence(reason: string): boolean {
  return reasonsWithoutSentence().includes(reason);
}

/**
 * マイルストーン説明の更新 (doc-10 §6, decision-21) — the one action this screen issues that is not a
 * CLI call.
 *
 * An empty `description` is allowed and issued: doc-10 §6 offers emptying deliberately, and the
 * empty string is what carries it (`milestone add` without `-d` writes a placeholder instead, so a
 * description the user wrote has no other way back out). It is only the *unchanged* case that is
 * blocked, which is why the two are told apart here rather than by testing for emptiness.
 *
 * The operand is the id, like every other milestone operation on this screen: the CLI's operand
 * accepts either, and the id is the one that cannot become ambiguous between milestones sharing a
 * title.
 */
export function buildMilestoneDescribe(milestone: Milestone, description: string): IssuePlan {
  if (description.split("\n").some((line) => line.trimStart().startsWith("##"))) {
    return { state: "blocked", reason: milestoneDescriptionHeadingReason() };
  }
  if (description === (milestone.description ?? "")) {
    return { state: "blocked", reason: milestoneDescriptionUnchangedReason() };
  }
  return {
    state: "ready",
    action: [{ op: "milestoneDescribe", name: milestone.id, description }],
  };
}

/**
 * The one sentence the 注記モーダル opens with (doc-10 §7), and the fields it then names.
 *
 * **代替経路の案内** (doc-11 §8): it says where these are added, and nothing about why the form has no
 * input for them. TASK-123 dropped what stood here before — the same five fields laid out as 名称・
 * フラグ・理由・作成後の経路, on screen at all times, 361px of a 885px 区画 and the reason the form did
 * not fit its scroller. What a user filling in a create form needs is where to put what does not fit,
 * not an account of the product judgment that shaped the form.
 *
 * The five share one sentence because their one difference — `-a ""` cannot *clear* an assignee
 * (doc-5 §3.1) — bites where assignees are set, which is タスク詳細の編集, and doc-8 §6 carries the
 * external-editor route there. Stating it here would hand the reader a limit they can do nothing about
 * from this form.
 */
export function taskCreateNote(): string {
  return msg().projectDetail.taskCreateNote;
}

/**
 * The fields `task create` accepts that this 区画 has no input for (doc-10 §7), as the 注記モーダル
 * names them.
 *
 * Names only. The flags they map to (`-a`・`--plan`・`--notes`・`--ref`・`--depends-on`) were shown
 * until TASK-123 so that the absence could not read as「CLI に無い」— the CLI does accept them
 * (doc-5 §3, measured 2026-08-12). With the reasons gone there is no false explanation left to guard
 * against, and a flag name is doc-11 §8's 発行手段の記述 with nothing exempting it any more.
 */
export function taskCreateLaterFields(): readonly string[] {
  const text = msg();
  return [
    "assignee",
    text.taskDetail.planHeading,
    text.taskDetail.notesHeading,
    "References",
    text.projectDetail.dependenciesField,
  ];
}

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
      return msg().projectDetail.outcomeConflict(conflictSetDetail(outcome));
    case "uncheckable":
      return outcome.detail;
    case "failed":
      return outcome.detail;
  }
}
