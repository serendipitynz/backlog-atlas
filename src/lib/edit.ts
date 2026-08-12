/**
 * タスク詳細からの編集操作 (doc-8 §6), as pure functions. The panel is markup over these values:
 * what the 編集セッション holds, which 更新操作 an explicit save turns it into, which operations
 * each 保存区分 may be offered, and how a 更新前競合 is resolved. Nothing here calls the boundary —
 * `TaskDetail.svelte` issues the action `buildSave` hands it — so every rule below is testable
 * without a CLI, a file, or a mounted component.
 *
 * ## Referent table (doc term → identifier here)
 *
 * Fixed before naming, following `detail.ts` and the Rust modules' convention.
 *
 * | term | here | is |
 * |---|---|---|
 * | doc-8 §1 編集セッション | [`EditSession`] | the 未保存入力 plus the `TaskView` it was started from |
 * | doc-8 §1 未保存入力 | [`EditDraft`] + `touched` | the values typed, and which fields the user actually touched |
 * | doc-8 §1 明示保存 | [`buildSave`] | turning the session into the 更新操作 the save button issues |
 * | doc-8 §6.5 保存区分別の編集可否 | [`EditAvailability`] | whether content editing is offered, and why not |
 * | doc-5 §3.2/§3.3 状態遷移の入口 | [`TransitionOffer`] | one transition, its 能動化 and its 無効化理由 |
 * | doc-11 §12 実行前確認 | [`IssueConfirmation`] + [`transitionConfirmation`] | the question a press raises before the act |
 * | doc-11 §12 語尾の … | [`confirmMarkedLabel`] | the mark on a 控え whose press asks first |
 * | doc-5 §3 assignee 非空全置換 | `EditDraft.assignee` + [`canRemoveLast`] | the whole non-empty set `-a` sends, last removal withheld |
 * | doc-5 §3 References 非空全置換 | `EditDraft.references` + [`canRemoveLast`] | the whole non-empty set, last removal withheld |
 * | doc-5 §3 AC 全体差し替え（複合） | [`AcDraft`] mode `replace` | remove-all ＋ add ＋ check in one `task edit` |
 * | doc-5 §3 AC 項目単位操作 | [`AcDraft`] mode `delta` | add / remove / check / uncheck on their own |
 * | doc-9 §5 防げる競合 | [`SaveState`] `conflict` | the pre-update check stopped the save; no CLI ran |
 * | doc-9 §5 防げない喪失の事後通知 | [`SaveState`] `diverged` + [`divergence`] | the re-read disagrees with what was submitted |
 * | doc-9 §5 (i) 最新を読み直してやり直す | [`startSession`] on the reloaded view | the draft is discarded for the current file |
 * | doc-9 §5 (ii) 入力を保持して再適用 | [`rebaseOnto`] | touched values kept, baseline moved to the latest read |
 * | doc-8 §6.4 編集中の継続検出 | [`externallyChanged`] | the file moved under an open session; input is not taken away |
 * | doc-5 §5 縮退 | [`EditAvailability`] via [`readinessReason`] | no supported CLI, so no edit is offered at all |
 *
 * Three rules the whole module follows:
 *
 * - **Touched, not merely different** (doc-9 §5 (ii)). A field the user did not touch is never
 *   sent, so re-applying a draft onto a newer read cannot revert someone else's change.
 * - **The CLI's limits are anticipated, not discovered** (doc-8 §6, AC #6). Emptying references or
 *   dependencies, and every operation v1.48.0 lacks, are withheld here rather than issued and
 *   refused by the adapter.
 * - **A withheld operation says why** (doc-5 §5). Nothing is silently missing: either it is offered,
 *   or it carries the reason it is not.
 */

import type {
  AcItem,
  CliReadiness,
  CommandError,
  ConflictSet,
  FailureKind,
  Milestone,
  ProjectSnapshot,
  TaskEdit,
  TaskView,
  UpdateFailure,
  UpdateOperation,
} from "./wire";
import { commaReason, firstWithComma } from "./comma";
import { refusalReport } from "./ledger";

// --- 未保存入力 (doc-8 §1/§6.3) ------------------------------------------------------------

/** Per-item AC operations — 項目単位 (doc-5 §3). Indices are the baseline's 1-based `number`. */
export interface AcDelta {
  add: string[];
  remove: number[];
  check: number[];
  uncheck: number[];
}

/**
 * The AC edit in progress. The two modes are kept apart all the way to the wire because doc-5
 * §3/§3.1 require it: 全体差し替え is a composite that must not be confused with the per-item
 * operations. v1.48.0's single-option `--acceptance-criteria` does replace the whole set, but it
 * refuses to run beside `--check-ac` (実測), so it cannot carry the checked state the composite
 * does. Per-item text editing does not exist at all, which is why `delta` has no text field for an
 * existing item.
 */
export type AcDraft = { mode: "delta"; delta: AcDelta } | { mode: "replace"; items: AcItem[] };

export interface EditDraft {
  title: string;
  description: string;
  /** Raw frontmatter status. `""` means "leave unset" — the CLI has no way to unset one. */
  status: string;
  priority: string;
  milestone: string;
  /**
   * 担当 (doc-5 §3 `-a`). The whole frontmatter list, like `references`/`dependencies`: `task edit`
   * reads `-a`'s value as a comma-separated set and replaces the list with it (実測 2026-08-12), so
   * this is a 非空全置換. Empty is refused — see [`EMPTY_ASSIGNEE_REASON`], the CLI has no unassign.
   */
  assignee: string[];
  plan: string;
  notes: string;
  /** `--notes` replaces, `--append-notes` appends: two CLI options, so a mode, not a flag. */
  notesMode: "set" | "append";
  /** 通常ラベル only. Type is not edited here from either 導出元 — see `TYPE_NOT_EDITABLE`. */
  labels: string[];
  dependencies: string[];
  references: string[];
  ac: AcDraft;
}

/** Which facet a change belongs to. `notesMode` folds into `notes`; they are one CLI option. */
export type DraftField =
  | "title"
  | "description"
  | "status"
  | "priority"
  | "milestone"
  | "assignee"
  | "plan"
  | "notes"
  | "labels"
  | "dependencies"
  | "references"
  | "ac";

/**
 * 編集セッション (doc-8 §6.3). `baseline` is the read the input was made against — held by the
 * session rather than taken from the screen, because doc-8 §6.4 forbids an external change from
 * rewriting 未保存入力 under the user: the panel keeps showing the session's own values while the
 * screen behind it reloads, and the two are only reconciled by an explicit choice (doc-9 §5).
 */
export interface EditSession {
  baseline: TaskView;
  draft: EditDraft;
  touched: DraftField[];
}

/**
 * Why Type values are not editable here, stated once so the panel and the tests agree.
 *
 * Two reasons because decision-20 gave Type two 導出元, and the reason differs per source — the
 * old text explained every visible Type as a kind label, which stopped being true the moment a
 * `type:` field could produce one. Neither source is editable, so the message states that as one
 * fact with its two grounds rather than implying one half can be reached.
 */
export const TYPE_NOT_EDITABLE =
  "Type の編集はこの画面では提供しません。kind ラベル由来の値は、読み取り層が保持するのが" +
  "接頭辞を外した値で、元のラベル文字列と一致する保証がないためです。frontmatter の type 由来の値は、" +
  "更新アダプターが --type の操作写像を持たないためです（通常ラベルは編集できます）";

const EMPTY_DELTA: AcDelta = { add: [], remove: [], check: [], uncheck: [] };

function acDraftFrom(): AcDraft {
  // Per-item operations are the default: 全体差し替え rewrites every criterion's text and is the
  // heavier of the two, so it is entered deliberately (doc-5 §3 の使い分け).
  return { mode: "delta", delta: { ...EMPTY_DELTA } };
}

export function draftFrom(view: TaskView): EditDraft {
  const task = view.task;
  return {
    title: task.title ?? "",
    description: task.description ?? "",
    status: task.status ?? "",
    priority: task.priority ?? "",
    milestone: task.milestone ?? "",
    assignee: [...task.assignee],
    plan: task.implementationPlan ?? "",
    notes: task.implementationNotes ?? "",
    notesMode: "set",
    labels: [...task.labels],
    dependencies: [...task.dependencies],
    references: [...task.references],
    ac: acDraftFrom(),
  };
}

/** Begin a 編集セッション on the view the panel is showing (doc-8 §6.3 編集開始). */
export function startSession(view: TaskView): EditSession {
  return { baseline: view, draft: draftFrom(view), touched: [] };
}

/** Which facet a draft key belongs to — `notesMode` and `notes` are one `task edit` option. */
export function fieldOf(key: keyof EditDraft): DraftField {
  return key === "notesMode" ? "notes" : key;
}

/** Record a change and mark its facet touched. Returns a new session; nothing is mutated. */
export function setField<K extends keyof EditDraft>(
  session: EditSession,
  key: K,
  value: EditDraft[K],
): EditSession {
  const field = fieldOf(key);
  return {
    ...session,
    draft: { ...session.draft, [key]: value },
    touched: session.touched.includes(field) ? session.touched : [...session.touched, field],
  };
}

/**
 * Switch the notes edit between replace and append. The text is swapped with it: appending the
 * existing notes to themselves is the mistake a shared text box would invite, and a replace that
 * started from an emptied box would silently wipe them.
 */
export function setNotesMode(session: EditSession, mode: "set" | "append"): EditSession {
  const text = mode === "append" ? "" : (session.baseline.task.implementationNotes ?? "");
  return setField(setField(session, "notesMode", mode), "notes", text);
}

/** Enter 全体差し替え, seeded with the criteria as they stand, or return to 項目単位 (doc-5 §3). */
export function setAcMode(session: EditSession, mode: AcDraft["mode"]): EditSession {
  const ac: AcDraft =
    mode === "replace"
      ? {
          mode: "replace",
          items: session.baseline.task.acceptanceCriteria.map((item) => ({
            text: item.text,
            checked: item.checked,
          })),
        }
      : acDraftFrom();
  return setField(session, "ac", ac);
}

// --- 未保存入力の有無 (doc-8 §6.3) ---------------------------------------------------------

/**
 * The facets that would be sent: touched *and* different from the baseline. Touch alone is not
 * enough — typing a character and undoing it leaves nothing to save — and difference alone is not
 * enough either, which is what makes [`rebaseOnto`] safe (doc-9 §5 (ii)).
 */
export function dirtyFields(session: EditSession): DraftField[] {
  return session.touched.filter((field) => changed(session, field));
}

export function isDirty(session: EditSession): boolean {
  return dirtyFields(session).length > 0;
}

function changed(session: EditSession, field: DraftField): boolean {
  const { draft, baseline } = session;
  const task = baseline.task;
  switch (field) {
    case "title":
      return draft.title !== (task.title ?? "");
    case "description":
      return draft.description !== (task.description ?? "");
    case "status":
      return draft.status !== "" && draft.status !== (task.status ?? "");
    case "priority":
      return draft.priority !== "" && draft.priority !== (task.priority ?? "");
    case "milestone":
      return draft.milestone !== "" && draft.milestone !== (task.milestone ?? "");
    case "assignee":
      return !sameList(draft.assignee, task.assignee);
    case "plan":
      return draft.plan !== (task.implementationPlan ?? "");
    case "notes":
      // An append has nothing to compare against: any text is an addition, and an empty box is not.
      return draft.notesMode === "append"
        ? draft.notes !== ""
        : draft.notes !== (task.implementationNotes ?? "");
    case "labels":
      return !sameList(draft.labels, task.labels);
    case "dependencies":
      return !sameList(draft.dependencies, task.dependencies);
    case "references":
      return !sameList(draft.references, task.references);
    case "ac":
      return acChanged(draft.ac, baseline);
  }
}

function acChanged(ac: AcDraft, baseline: TaskView): boolean {
  if (ac.mode === "delta") {
    const { add, remove, check, uncheck } = ac.delta;
    return add.length + remove.length + check.length + uncheck.length > 0;
  }
  const current = baseline.task.acceptanceCriteria;
  if (ac.items.length !== current.length) return true;
  return ac.items.some(
    (item, index) => item.text !== current[index].text || item.checked !== current[index].checked,
  );
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

// --- 編集中の外部変更 (doc-8 §6.4) ---------------------------------------------------------

/**
 * Whether the file moved under an open session (doc-8 §6.4 編集中の継続検出). Reported only —
 * the draft is never discarded or overwritten by it; the save's 更新前競合検出 is what acts on it.
 * Compared by content rather than by identity because every reload builds fresh objects, so an
 * identity check would call an unchanged root a change on every unrelated reload.
 */
export function externallyChanged(session: EditSession, current: TaskView | null): boolean {
  if (current === null) return true;
  return JSON.stringify(current.task) !== JSON.stringify(session.baseline.task);
}

/**
 * doc-9 §5 (ii): keep the 未保存入力 and move the session onto the latest read. Touched facets keep
 * the user's values; untouched ones adopt the newer file, so a save after this re-applies only what
 * the user actually changed and leaves the external change standing.
 */
/**
 * Whether a rebase has to drop the pending per-item AC edit. A delta points at criteria by number,
 * and an external change renumbers them: old `#2` may now be a different criterion with the same
 * number, so re-applying by number would check something the user never pointed at. A 全体差し替え
 * is not affected — it carries the texts themselves, and its `existing` count is taken from
 * whatever baseline it is finally built against.
 */
export function acDeltaDroppedByRebase(session: EditSession, latest: TaskView): boolean {
  if (session.draft.ac.mode !== "delta") return false;
  const { add, remove, check, uncheck } = session.draft.ac.delta;
  if (remove.length + check.length + uncheck.length === 0) return false;
  // `add` alone survives: it names no criterion. The rest are index-bound.
  void add;
  return !sameCriteria(session.baseline, latest);
}

function sameCriteria(a: TaskView, b: TaskView): boolean {
  const of = (view: TaskView) =>
    view.task.acceptanceCriteria.map((item) => `${item.number}\0${item.text}`);
  return sameList(of(a), of(b));
}

export function rebaseOnto(session: EditSession, latest: TaskView): EditSession {
  const fresh = draftFrom(latest);
  const draft = { ...fresh };
  const dropAcDelta = acDeltaDroppedByRebase(session, latest);
  for (const field of session.touched) {
    switch (field) {
      case "notes":
        draft.notes = session.draft.notes;
        draft.notesMode = session.draft.notesMode;
        break;
      case "ac":
        // Index-bound operations do not survive a renumbering; the additions do, since they name
        // no criterion. Keeping the rest would silently retarget them (see `acDeltaForCli`).
        draft.ac =
          dropAcDelta && session.draft.ac.mode === "delta"
            ? { mode: "delta", delta: { ...EMPTY_DELTA, add: [...session.draft.ac.delta.add] } }
            : session.draft.ac;
        break;
      case "assignee":
      case "labels":
      case "dependencies":
      case "references":
        draft[field] = [...session.draft[field]];
        break;
      default:
        draft[field] = session.draft[field];
    }
  }
  return { baseline: latest, draft, touched: [...session.touched] };
}

// --- 明示保存 (doc-8 §6.3) -----------------------------------------------------------------

/** The values a save asserts, kept so the re-read can be checked against them ([`divergence`]). */
export interface Submitted {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  milestone?: string;
  /** The whole non-empty set sent, as `references`/`dependencies` are. */
  assignee?: string[];
  plan?: string;
  /** Replace only: an append cannot be compared against the result. */
  notes?: string;
  references?: string[];
  dependencies?: string[];
  /** 全体差し替え only: a per-item delta does not assert the whole list. */
  ac?: string[];
}

/**
 * What an explicit save would issue. `refused` is doc-5 の制約の先取り (AC #6): the action is not
 * built at all, so the adapter is never asked to reject it — the panel disables the control that
 * would produce it and states the reason with the same words.
 */
export type SavePlan =
  | { state: "ready"; action: UpdateOperation[]; submitted: Submitted }
  | { state: "nothingToSave" }
  | { state: "refused"; reason: string };

/**
 * The route these reasons send the user to (doc-5 §3.1・doc-8 §7). Named once so every withheld
 * operation points at the same control instead of at "外部エディタ経路" as an abstraction — TASK-37
 * put the launch in this panel, so the guidance can name where it is.
 */
export const EXTERNAL_EDITOR_ROUTE = "この画面下部の「外部エディタで開く」";

export const EMPTY_REFERENCES_REASON =
  "References は最後の 1 件を削除できません（v1.48.0 の CLI に空集合化の手段がないため）。" +
  `空にする場合は${EXTERNAL_EDITOR_ROUTE}から管理ファイルを直接編集します`;

/**
 * Why the last assignee cannot be removed. `-a ""` exits 0 without clearing in v1.48.0 (実測), and
 * so does a value whose parse is empty — `-a ","` and `-a " "` both return 0 and leave the list as
 * it was — so an empty set is withheld rather than issued as an unassignment that would be reported
 * as a success and not happen (doc-5 §3.1, the same silent-no-op as `--ref ""`).
 */
export const EMPTY_ASSIGNEE_REASON =
  "assignee は最後の 1 件を削除できません（v1.48.0 の CLI に空集合化の手段がないため）。" +
  `空にする場合は${EXTERNAL_EDITOR_ROUTE}から管理ファイルを直接編集します`;

export const EMPTY_DEPENDENCIES_REASON =
  "dependencies は最後の 1 件を削除できません（v1.48.0 の CLI に空集合化の手段がないため）。" +
  `空にする場合は${EXTERNAL_EDITOR_ROUTE}から管理ファイルを直接編集します`;

/**
 * Renumber a per-item AC edit for the CLI (doc-5 §3). One `task edit` resolves its AC options in
 * two different frames, measured on v1.48.0:
 *
 * - `--remove-ac` indexes the criteria **as read** — `--remove-ac 1 --remove-ac 3` removes the
 *   first and third, not the first and then the third of what is left.
 * - `--check-ac` / `--uncheck-ac` index the list **after** the removals: on `#1 one / #2 two /
 *   #3 three`, `--remove-ac 1 --check-ac 2` checks `three`, and on a two-item list the same pair
 *   exits 1 with "Acceptance criterion #2 not found".
 * - `--ac` appends, so an addition never shifts the indices a check resolves against.
 *
 * The draft holds baseline numbers throughout, because that is what the user pointed at. Passing
 * them through unchanged would check the wrong criterion whenever a removal sits before it — the
 * silent half of this, and worse than the failure, since nothing tells the user it happened.
 * So a check/uncheck of a removed criterion is dropped, and every surviving one is remapped to its
 * position among the survivors.
 */
export function acDeltaForCli(delta: AcDelta, baseline: TaskView): AcDelta {
  const removed = new Set(delta.remove);
  const survivors = baseline.task.acceptanceCriteria
    .map((item) => item.number)
    .filter((number) => !removed.has(number));
  const renumber = (numbers: number[]): number[] =>
    numbers.flatMap((number) => {
      const at = survivors.indexOf(number);
      // A criterion being removed cannot also be checked: the operation has no target left.
      return at === -1 ? [] : [at + 1];
    });
  return {
    add: [...delta.add],
    remove: [...delta.remove],
    check: renumber(delta.check),
    uncheck: renumber(delta.uncheck),
  };
}

export const EMPTY_TITLE_REASON =
  "title は空にできません（必須項目で、空にすると解析不能として不整合表示になります）";

/**
 * Whether one more removal is allowed from a 非空全置換 field (doc-5 §3.1). The last element stays:
 * `--ref ""` / `--depends-on ""` exit 0 without clearing in v1.48.0, so an "empty it" control would
 * promise something the CLI silently declines to do.
 */
export function canRemoveLast(values: readonly string[]): boolean {
  return values.length > 1;
}

/**
 * Why the last entry of a 非空全置換 field may not be removed — or `null` when it may.
 *
 * The withholding only holds where emptying would be *issued*. A list the baseline already had
 * empty is not one of those: entries added in this session can be taken back down to nothing, the
 * field stops being 触れた項目 (doc-9 §5 (ii)), and no option is sent — so the CLI's missing
 * 空集合化 constrains nothing, and stating it as the reason would be false. Without this the
 * panel traps a mistyped entry on a task that had none: 削除 disabled, and the only ways out are
 * saving the typo or discarding the whole session.
 *
 * `baseline` is the session's own read, never the latest one on screen: [`changed`] judges the
 * draft against the baseline (doc-8 §6.4 keeps 未保存入力 on the read it was made against), so for
 * the length of an 外部変更 window a gate fed the newer read would offer a removal whose save is
 * then refused with this very sentence.
 */
export function lastRemovalReason(baseline: readonly string[], reason: string): string | null {
  return baseline.length === 0 ? null : reason;
}

/**
 * Turn the session into the 更新操作 doc-5 §3 maps it to. Every facet fits one `task edit`, which is
 * doc-5 §3's "まとめられる範囲でまとめる" — and it keeps the action single-invocation, so a failure
 * cannot leave a partial application the panel would have to reconcile (doc-5 §5 部分適用).
 */
export function buildSave(session: EditSession): SavePlan {
  const taskId = session.baseline.task.id;
  if (taskId === null) {
    return { state: "refused", reason: "TASK-ID を読めないため更新操作の対象を指定できません" };
  }
  const dirty = dirtyFields(session);
  if (dirty.length === 0) return { state: "nothingToSave" };

  const draft = session.draft;
  const edit: TaskEdit = {};
  const submitted: Submitted = {};

  for (const field of dirty) {
    switch (field) {
      case "title":
        if (draft.title === "") return { state: "refused", reason: EMPTY_TITLE_REASON };
        edit.title = draft.title;
        submitted.title = draft.title;
        break;
      case "description":
        edit.description = draft.description;
        submitted.description = draft.description;
        break;
      case "status":
        edit.status = draft.status;
        submitted.status = draft.status;
        break;
      case "priority":
        edit.priority = draft.priority;
        submitted.priority = draft.priority;
        break;
      case "milestone":
        edit.milestone = draft.milestone;
        submitted.milestone = draft.milestone;
        break;
      case "assignee": {
        if (draft.assignee.length === 0) {
          return { state: "refused", reason: EMPTY_ASSIGNEE_REASON };
        }
        // A comma inside one name is not expressible: `-a` reads its value as the whole set, so the
        // name would arrive as two assignees (doc-5 §3, the same rule ラベル・タグ follow).
        const withComma = firstWithComma(draft.assignee);
        if (withComma !== undefined) {
          return { state: "refused", reason: commaReason("assignee", withComma) };
        }
        edit.assignee = [...draft.assignee];
        submitted.assignee = [...draft.assignee];
        break;
      }
      case "plan":
        edit.plan = draft.plan;
        submitted.plan = draft.plan;
        break;
      case "notes":
        if (draft.notesMode === "append") {
          edit.notes = { mode: "append", text: draft.notes };
        } else {
          edit.notes = { mode: "set", text: draft.notes };
          submitted.notes = draft.notes;
        }
        break;
      case "labels": {
        const before = session.baseline.task.labels;
        edit.addLabels = draft.labels.filter((label) => !before.includes(label));
        edit.removeLabels = before.filter((label) => !draft.labels.includes(label));
        break;
      }
      case "dependencies":
        if (draft.dependencies.length === 0) {
          return { state: "refused", reason: EMPTY_DEPENDENCIES_REASON };
        }
        edit.dependencies = [...draft.dependencies];
        submitted.dependencies = [...draft.dependencies];
        break;
      case "references":
        if (draft.references.length === 0) {
          return { state: "refused", reason: EMPTY_REFERENCES_REASON };
        }
        // 既存を含む非空全集合 (doc-5 §3): the list starts as everything the task has, so adding a
        // Pull Request URL here is the References 全置換 doc-8 §6 reduces PR 登録 to.
        edit.references = [...draft.references];
        submitted.references = [...draft.references];
        break;
      case "ac":
        if (draft.ac.mode === "delta") {
          edit.ac = { mode: "delta", ...acDeltaForCli(draft.ac.delta, session.baseline) };
        } else {
          edit.ac = {
            mode: "replace",
            existing: session.baseline.task.acceptanceCriteria.length,
            items: draft.ac.items.map((item) => ({ ...item })),
          };
          submitted.ac = draft.ac.items.map((item) => item.text);
        }
        break;
    }
  }

  return { state: "ready", action: [{ op: "taskEdit", taskId, edit }], submitted };
}

export const NOTHING_TO_SAVE_REASON = "変更はまだありません";

// --- 破棄前確認 (doc-8 §6.3) ------------------------------------------------------------------
//
// One text for all five routes — キャンセル・閉じる・別タスクを開く・前後移動・詳細配置の切替 — because
// doc-8 §6.3 requires exactly that: 文言は 5 経路で同じものを使う. Held here rather than in the panel
// because two of the five are the shell's (opening another task, switching the placement), and a
// per-caller wording is how the five would end up describing the same loss five ways.
//
// The モーダル routes TASK-86 added (doc-11 §7) share the *question* — what is lost is the same thing,
// and a second wording for it is exactly what holding these in one place rules out. Their proceed
// answer is `DISCARD_CONFIRM_CLOSE` below rather than the one above, because 続ける is as wide as it
// is only to cover five routes that do not share a destination. Also unlike the five, only some of a
// モーダル's exits reach the question at all: 変更せずに閉じる states the draft's fate in its own
// wording, so §7 leaves it out.

/**
 * What the 確認 asks. Drawn as the 上部帯 ① (doc-7 §5.3), or inside the モーダル that raised it when a
 * モーダル is up (doc-11 §7) — the question is the same one either way, whatever the answers are
 * called there.
 */
export const DISCARD_CONFIRM_QUESTION =
  "編集中の未保存入力があります。このまま進むと破棄されます。";

/** The answer that goes ahead and loses the input. */
export const DISCARD_CONFIRM_PROCEED = "破棄して続ける";

/**
 * The same answer where the モーダル asks it (doc-11 §7).
 *
 * 続ける rather than 閉じる above because doc-8 §6.3's five routes do not share a destination — three
 * of them (別タスクを開く・前後移動・詳細配置の切替) close nothing, and the word has to cover all
 * five. A モーダル's two are both ways of closing that one layer, so the wider word would name
 * something wider than what the press does. The *question* stays the one above: what is lost is the
 * same thing, and doc-8 §6.3 asks for one wording of that.
 */
export const DISCARD_CONFIRM_CLOSE = "破棄して閉じる";

/** The answer that stays where it is. */
export const DISCARD_CONFIRM_KEEP = "編集に戻る";

/**
 * The two answers, as the layer that draws them needs them (doc-11 §7). A pair rather than a flag and
 * two callbacks: the question and its answers stand or fall together, so `null` is the whole of
 * 「聞いていない」 and there is no state where one half is set and the other is not.
 *
 * The texts are not in here. The caller says *what happens* on each answer — that is the part only it
 * knows — and the layer prints the constants above, so no caller can word the same loss its own way
 * (doc-8 §6.3 文言は同じ).
 */
export interface DiscardAnswers {
  /**
    * Take the exit that was asked for, and lose the input. Printed as 破棄して続ける in the 上部帯 ① and
    * as 破棄して閉じる in a モーダル (doc-11 §7) — the layer that draws the answers picks which.
    */
  onproceed: () => void;
  /** 編集に戻る: drop the request and stay where the input is. */
  onkeep: () => void;
}

// --- 実行前確認 (doc-11 §12) ------------------------------------------------------------------
//
// The other question this app asks, and it is not the one above. 破棄前確認 asks what becomes of the
// 未保存入力 on a route that is already being taken; this one asks whether to take the act at all, and
// its 戻る answer leaves nothing behind. Held here beside the discard texts so the two cannot drift
// into wording each other's question.

/**
 * A question standing between a press and the act its 控え names (doc-11 §12).
 *
 * Three fields rather than one text because the layer needs three different things: its own
 * accessible name, the question, and the word the 進む side is answered with. §12 requires that word
 * to name the act (`アーカイブする`) rather than say 実行する, so it cannot be derived from the question.
 */
export interface IssueConfirmation {
  /** 層の名前 — the operation as its 控え names it, without the 語尾の …. */
  title: string;
  /** What the press is about to do, and what it cannot take back. */
  question: string;
  /** 進む側の答え, naming the act. */
  proceed: string;
}

/** 戻る側の答え (doc-11 §12): one word, for every question of this kind. */
export const ISSUE_CONFIRM_CANCEL = "やめる";

/**
 * 語尾の … (doc-11 §12): the mark saying this press does not reach the act.
 *
 * A function applied where the question is raised rather than a suffix stored on the 控え, because a
 * control that asks only under a condition (外部エディタ起動 while there is 未保存入力, doc-8 §7) has to
 * lose the mark when it stops asking — a mark whose question never comes predicts nothing.
 */
export function confirmMarkedLabel(label: string): string {
  return `${label}…`;
}

/**
 * Whether the save control may be pressed, and the reason when it may not. A single decision for
 * both the disabled state and the tooltip: with the two derived separately, a state that stops
 * `save()` from doing anything can still leave the button looking pressable, which is the one
 * outcome doc-5 §5 rules out — an operation is either offered or carries the reason it is not.
 */
export type SaveAvailability = { state: "ready" } | { state: "blocked"; reason: string };

export function saveAvailability(
  plan: SavePlan | null,
  context: { fileMissing: boolean; busy: boolean },
): SaveAvailability {
  // Ordered as the obstacles are: a file that is gone cannot be written whatever the plan says.
  if (context.fileMissing) return { state: "blocked", reason: FILE_MISSING_REASON };
  if (context.busy) return { state: "blocked", reason: "保存中です" };
  if (plan === null) return { state: "blocked", reason: "編集セッションを開いていません" };
  switch (plan.state) {
    case "ready":
      return { state: "ready" };
    case "nothingToSave":
      return { state: "blocked", reason: NOTHING_TO_SAVE_REASON };
    case "refused":
      return { state: "blocked", reason: plan.reason };
  }
}

/**
 * What the shell reports back after issuing an action. Narrower than the boundary's `UpdateResult`
 * on purpose: the panel's next move depends only on these three, and folding the re-read into the
 * shell keeps one owner for the snapshot the whole screen draws from.
 */
export type ApplyOutcome =
  /**
   * `view` is the operated task as the post-update re-read has it — `null` when that read no longer
   * yields the file (a 状態遷移 moves it, and an external delete would too). Carried here so the
   * 事後通知 comparison (doc-9 §5) is against the task the update was issued for, independently of
   * what the panel happens to be showing when the answer arrives: the selection can move during the
   * await, and comparing against another task — or skipping the comparison — would either invent a
   * divergence or silently drop one.
   */
  | { state: "applied"; view: TaskView | null }
  /** 更新前競合 (doc-9 §4): no CLI ran, and the screen already holds the re-read. */
  | ({ state: "conflict" } & ConflictSet)
  /**
   * 照合不能 (doc-9 §4.2): no CLI ran either, but for the opposite reason — no divergence was
   * observed, there is no defined way to look for one. Split from `failed` so the panel can put it
   * in its own family (`undetectable`, `lib/mark.ts`) instead of borrowing 不整合's, which doc-9 §5
   * forbids: the user must not read this as "a conflict happened".
   */
  | { state: "uncheckable"; detail: string }
  /** A CLI failure, an adapter refusal, or a boundary error — nothing was applied. */
  | { state: "failed"; detail: string };

/**
 * What the panel says about the last save. The two conflict-shaped states are separate values
 * because doc-9 §5 requires them to read differently: `conflict` is 防げる競合 caught before the
 * CLI ran, `diverged` is the 事後通知 of the window that cannot be closed at all.
 */
export type SaveState =
  | { state: "idle" }
  | { state: "applied" }
  | { state: "failed"; detail: string }
  | ({ state: "conflict" } & ConflictSet)
  | { state: "diverged"; fields: string[] }
  /** 照合不能 (doc-9 §4.2) — kept apart from the two conflict states, as doc-9 §5 requires. */
  | { state: "uncheckable"; detail: string };

/**
 * A CLI failure as the panel states it (doc-5 §5). The sub-command and stderr are the reason the
 * user acts on; 要再読込 is carried through because it changes what a retry means — the screen is
 * showing a state the failed action may have half-created.
 */
export function failureDetail(failure: UpdateFailure): string {
  const how = failureCause(failure.kind);
  return `${failure.command} が失敗しました（${how}）${reloadNote(failure)}: ${failure.stderr.trim()}`;
}

function failureCause(kind: FailureKind): string {
  switch (kind.kind) {
    case "spawn":
      return "起動できません";
    case "nonZero":
      return `終了コード ${kind.code ?? "不明"}`;
    case "timedOut":
      return `${Math.round(kind.afterMs / 1000)} 秒以内に終了しなかったため中断しました`;
    // 直接書き込み操作 (decision-21). No exit code to quote and no process to blame; the reason is
    // the whole of what is known, and it arrives in `stderr` like a CLI's does.
    case "write":
      return "書き込めません";
  }
}

/**
 * What 要再読込 means for *this* failure. The two cases read differently on purpose: after an earlier
 * invocation the screen can say what already landed, while a 期限到達 cannot — Atlas killed the
 * process and nothing tells it whether the write happened (decision-18). Saying "既に適用済み" there
 * would claim a fact nobody has.
 */
function reloadNote(failure: UpdateFailure): string {
  if (!failure.reloadRequired) return "";
  return failure.completedBefore > 0
    ? `（この操作の ${failure.completedBefore} 件は既に適用済みで、再読込済みです）`
    : "（この操作が管理ファイルを変更したかどうかは分かりません。再読込済みです）";
}

/**
 * A boundary failure as the panel states it. 照合不能 (doc-9 §4.2) gets its own wording on purpose:
 * doc-9 §5 requires it not to read as a conflict — no version divergence was observed, there is no
 * defined way to look for one — and forbids offering an unchecked run as the way around it.
 */
export function commandErrorDetail(error: CommandError): string {
  switch (error.kind) {
    case "updatesUnavailable":
      return readinessReason(error.readiness) ?? "backlog CLI を確認できません";
    case "updateRejected":
      return `更新アダプターが実行前に拒否しました: ${error.detail}`;
    case "uncheckableTarget":
      return (
        `照合不能: ${error.what} は書き換え対象の照合方法が定まっていないため、CLI を起動せずに` +
        `拒否しました。版がずれていることを検出したわけではありません。${error.detail}`
      );
    case "reloadFailed":
      return error.applied === null || error.applied === undefined
        ? `再読込に失敗しました（更新は実行していません）: ${error.detail}`
        : `更新は適用されましたが再読込に失敗しました。同じ操作をやり直さないでください: ${error.detail}`;
    case "versionProbeFailed":
      return `更新前競合検出の版読み取りに失敗しました: ${error.detail}`;
    case "taskNotFound":
      return `${error.task_id} は現在の読み取り結果にありません（削除・移動の可能性）`;
    case "projectNotOpen":
      return `プロジェクト ${error.slug} が開かれていません`;
    case "unknownProject":
      return `プロジェクト ${error.slug} は台帳にありません`;
    case "rootUnreadable":
      return `ルートを読めません: ${error.detail}`;
    // 外部エディタ経路 (doc-8 §7). Stated here because this is the one place a `CommandError` becomes
    // the panel's Japanese text; `external-editor.ts` re-words these three for the launch controls,
    // where "the path is not in the read result" has a specific next step (open the task again).
    case "unknownTaskFile":
      return `${error.path} は現在の読み取り結果のタスクファイルではありません（移動・削除の可能性）`;
    case "editorUnavailable":
      return `外部エディタを起動できません: ${error.detail}`;
    case "editorLaunchFailed":
      return `${error.program} を起動できません: ${error.detail}`;
    // A 台帳操作 refusal (doc-3 §4) reaching this screen is second-hand — the 台帳管理画面 is where
    // these are acted on — so the wording is taken from there rather than written a second time.
    case "ledgerRefused":
      return refusalReport(error).message;
    case "ledger":
    case "watchFailed":
      return error.detail;
    // アプリ設定 (decision-13): only a save fails, and it does not touch this task — the panel states
    // it as what it is, so a settings write failure never reads as a failed edit.
    case "settings":
      return `設定を保存できませんでした: ${error.detail}`;
    // 履歴読取の取消 (decision-19) cannot arise from an edit — it answers `task_history_read`, and
    // only the read this screen itself abandoned. It is worded rather than left out because the
    // switch is exhaustive, and a sentence that says what happened beats a variant name if a future
    // route ever does route one here.
    case "historyCancelled":
      return "Git 履歴の読み取りは画面の側で取り消されました";
    // 本文リンク (doc-8 §9.3) cannot arise from an edit either — it answers a press on a link inside a
    // 閲覧 の本文 — and the boundary's sentence already names what did not open (a refused URL, or the
    // program that failed). Prefixed rather than passed through, so ⑤ 通知 says which press it belongs
    // to: nothing else on screen changed when the browser failed to come forward.
    case "bodyLinkFailed":
      return `リンクを開けませんでした: ${error.detail}`;
  }
}

// --- 照合後競合窓の事後通知 (doc-9 §4.1/§5) -------------------------------------------------

/**
 * Which submitted values the re-read disagrees with — doc-9 §5's 事後通知, within the range it is
 * detectable in. It catches only one direction: an external write that landed *after* the CLI's
 * write shows up here, while one the CLI's read-modify-write overwrote is already gone from the
 * file and cannot be shown at all (doc-9 §4.1 情報喪失条件). Reporting it is therefore a notice
 * about the best-effort limit, never a claim that nothing was lost.
 *
 * Text is compared trimmed and lists as sets: the CLI owns the file's formatting, and reporting its
 * own normalization as someone else's change would make the notice untrustworthy for the case it
 * exists for.
 */
export function divergence(submitted: Submitted, view: TaskView | null): string[] {
  if (view === null) return ["タスクファイル（再読込結果に見当たりません）"];
  const task = view.task;
  const diverged: string[] = [];
  const text = (label: string, sent: string | undefined, got: string | null) => {
    if (sent !== undefined && sent.trim() !== (got ?? "").trim()) diverged.push(label);
  };
  text("title", submitted.title, task.title);
  text("description", submitted.description, task.description);
  text("status", submitted.status, task.status);
  text("priority", submitted.priority, task.priority);
  text("milestone", submitted.milestone, task.milestone);
  if (submitted.assignee !== undefined && !sameSet(submitted.assignee, task.assignee)) {
    diverged.push("assignee");
  }
  text("実装計画", submitted.plan, task.implementationPlan);
  text("実装ノート", submitted.notes, task.implementationNotes);
  if (submitted.references !== undefined && !sameSet(submitted.references, task.references)) {
    diverged.push("References");
  }
  if (submitted.dependencies !== undefined && !sameSet(submitted.dependencies, task.dependencies)) {
    diverged.push("dependencies");
  }
  if (
    submitted.ac !== undefined &&
    !sameSet(
      submitted.ac,
      task.acceptanceCriteria.map((item) => item.text),
    )
  ) {
    diverged.push("Acceptance Criteria");
  }
  return diverged;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const norm = (values: readonly string[]) => [...values].map((v) => v.trim()).sort();
  return sameList(norm(a), norm(b));
}

// --- 保存区分別の可否 (doc-8 §6.5) ---------------------------------------------------------

export type EditAvailability = { state: "editable" } | { state: "unavailable"; reason: string };

/** 縮退 (doc-5 §5): why updates are not offered when the CLI is missing or out of range. */
export function readinessReason(readiness: CliReadiness | null): string | null {
  if (readiness === null) return "backlog CLI の確認中です";
  switch (readiness.state) {
    case "ready":
      return null;
    // See `cliDegradedSummary`: naming PATH alone stopped being true at decision-16. `detail` names
    // the executable the resolution settled on, which is what the user has to act on.
    case "unavailable":
      return `backlog CLI の実行ファイルを解決できないため更新操作を提供しません（${readiness.detail}）`;
    case "unsupported":
      return `backlog CLI ${readiness.version} は動作確認範囲外のため更新操作を提供しません（必要: ${readiness.minimum} 以上）`;
  }
}

const DRAFT_READ_ONLY =
  "draft の内容編集は提供しません（v1.48.0 の CLI に draft の内容を編集する手段がないため）。" +
  `編集するにはタスクへ昇格するか、${EXTERNAL_EDITOR_ROUTE}から管理ファイルを直接編集します`;

const CLOSED_READ_ONLY =
  "completed・archive のタスクは、v1.48.0 の CLI が更新を受け付けないため読み取り専用です。" +
  `内容を変えるには${EXTERNAL_EDITOR_ROUTE}から管理ファイルを直接編集します`;

/**
 * The task's file left the read result while the panel was open — moved or deleted by something
 * outside Atlas. No CLI operation can be issued against it (there is no file to name), but the
 * 未保存入力 is not the file's to take: doc-8 §6.4 keeps the input, and this is the reason shown
 * beside it.
 */
export const FILE_MISSING_REASON =
  "このタスクのファイルが現在の読み取り結果にありません（外部での移動・削除の可能性）。" +
  "CLI 経由の更新はできません。未保存入力は保持しているので、必要な内容を控えてから破棄してください";

/** Whether the panel offers content editing for this task at all (doc-8 §6.5, doc-5 §5). */
export function editAvailability(
  view: TaskView,
  readiness: CliReadiness | null,
  fileMissing = false,
): EditAvailability {
  if (fileMissing) return { state: "unavailable", reason: FILE_MISSING_REASON };
  if (view.task.id === null) {
    return {
      state: "unavailable",
      reason: "TASK-ID を読めないため更新操作の対象を指定できません（解析不能）",
    };
  }
  switch (view.task.storageState) {
    case "draft":
      return { state: "unavailable", reason: DRAFT_READ_ONLY };
    case "completed":
    case "archive":
      return { state: "unavailable", reason: CLOSED_READ_ONLY };
    case null:
      return {
        state: "unavailable",
        reason: "保存区分を判別できないため更新操作を提供しません",
      };
    case "active":
      break;
  }
  const degraded = readinessReason(readiness);
  return degraded === null ? { state: "editable" } : { state: "unavailable", reason: degraded };
}

// --- 状態遷移の入口 (doc-5 §3.2/§3.3, doc-8 §6.5) -------------------------------------------

export type TransitionKind =
  | "taskDemote"
  | "taskArchive"
  | "taskComplete"
  | "draftPromote"
  | "draftArchive";

export interface TransitionOffer {
  kind: TransitionKind;
  label: string;
  /** What the transition does to 保存区分 / id / status — the parts doc-5 §3.3 measured. */
  effect: string;
  operation: UpdateOperation;
  enabled: boolean;
  /** Why it is not active. `null` when it is. */
  reason: string | null;
}

/**
 * The transitions a 保存区分 has, or why it has none. `none` is 提示しない (AC #6): completed and
 * archive have no reverse operation in v1.48.0, so no control is drawn for one.
 */
export type TransitionOffers =
  | { state: "offered"; offers: TransitionOffer[] }
  | { state: "none"; reason: string };

/** The status `task complete` requires. Matched literally: the CLI compares the frontmatter
 * value, not Atlas's 正準列 mapping, so a project whose done status is spelled otherwise would be
 * told "enabled" and then fail (doc-5 §3, doc-8 §6.5). */
const COMPLETABLE_STATUS = "Done";

export interface TransitionContext {
  readiness: CliReadiness | null;
  /** True while the session holds 未保存入力 — a transition would race the save (doc-8 §6.3). */
  hasUnsavedInput: boolean;
  /** True once the task's file has left the read result — there is nothing left to transition. */
  fileMissing?: boolean;
}

export function transitionOffers(
  view: TaskView,
  context: TransitionContext,
): TransitionOffers {
  const id = view.task.id;
  if (id === null) {
    return { state: "none", reason: "TASK-ID を読めないため状態遷移の対象を指定できません" };
  }
  const storage = view.task.storageState;
  if (storage === null) {
    return { state: "none", reason: "保存区分を判別できないため状態遷移を提供しません" };
  }
  if (storage === "completed" || storage === "archive") {
    return {
      state: "none",
      reason:
        "completed・archive から戻す操作は v1.48.0 の CLI にないため提供しません",
    };
  }

  // Ordered by how fundamental the obstacle is: a file that is gone cannot be transitioned at all,
  // no CLI means no operation, and unsaved input is the one the user can clear themselves.
  const blocked =
    (context.fileMissing === true ? FILE_MISSING_REASON : null) ??
    readinessReason(context.readiness) ??
    (context.hasUnsavedInput
      ? "未保存の入力があります。保存またはキャンセルしてから実行します"
      : null);

  const offers: TransitionOffer[] =
    storage === "draft"
      ? [
          offer("draftPromote", "タスクへ昇格", DRAFT_PROMOTE_EFFECT, {
            op: "draftPromote",
            draftId: id,
          }),
          offer("draftArchive", "アーカイブ", DRAFT_ARCHIVE_EFFECT, {
            op: "draftArchive",
            draftId: id,
          }),
        ]
      : [
          offer("taskDemote", "draft へ差し戻す", TASK_DEMOTE_EFFECT, {
            op: "taskDemote",
            taskId: id,
          }),
          offer("taskArchive", "アーカイブ", TASK_ARCHIVE_EFFECT, {
            op: "taskArchive",
            taskId: id,
          }),
          offer(
            "taskComplete",
            "完了整理",
            TASK_COMPLETE_EFFECT,
            { op: "taskComplete", taskId: id },
            view.task.status === COMPLETABLE_STATUS
              ? null
              : `status が ${COMPLETABLE_STATUS} のときのみ実行可能です（現在: ${
                  view.task.status ?? "不明"
                }）`,
          ),
        ];

  return {
    state: "offered",
    offers: offers.map((entry) =>
      blocked === null || !entry.enabled
        ? entry
        : { ...entry, enabled: false, reason: blocked },
    ),
  };
}

function offer(
  kind: TransitionKind,
  label: string,
  effect: string,
  operation: UpdateOperation,
  reason: string | null = null,
): TransitionOffer {
  return { kind, label, effect, operation, enabled: reason === null, reason };
}

// 遷移が何を変えるかだけを述べる (doc-11 §8 の結果の予告). The 写像 itself (active → archive/tasks) is
// on the button, and the storage state is on screen beside it, so what is left to say is the part a
// user cannot read off either: whether the id survives, and whether the move can be undone.
//
// **The five lines are deliberately not parallel.** Each says only what is not already answered for
// *that* transition: 昇格・差し戻し renumber, so the id is the news; draft archive keeps both, so the
// news is that nothing changes; the two one-way moves have no id question at all and the news is
// that they cannot be taken back. Making them symmetric would put a clause on each button that its
// own transition never raises.
const DRAFT_PROMOTE_EFFECT = "id は採番し直されます";
const DRAFT_ARCHIVE_EFFECT = "id・status は保持されます";
const TASK_DEMOTE_EFFECT = "id は採番し直されます";
const TASK_ARCHIVE_EFFECT = "元に戻せません";
const TASK_COMPLETE_EFFECT = "status が Done のときのみ実行可能です。元に戻せません";

/**
 * 実行前確認 (doc-11 §12) for one 状態遷移. All five ask — v1.48.0 has no way back to the state before
 * the press for any of them (the measurement is in doc-8 §6.5), so there is no line to draw inside
 * the five.
 *
 * **The question is not built from `effect` above.** That line answers 「この控えは何をするか」 before the
 * press and carries the precondition 完了整理 has (`status が Done のときのみ`), which is already
 * satisfied by the time this question can stand. What the question has to say is what is about to
 * happen and what will not be undoable — so the two texts differ per transition, not per field.
 */
export function transitionConfirmation(offer: TransitionOffer): IssueConfirmation {
  return {
    title: offer.label,
    question: TRANSITION_CONFIRM_QUESTION[offer.kind],
    proceed: TRANSITION_CONFIRM_PROCEED[offer.kind],
  };
}

// Keyed by `TransitionKind` so a sixth transition cannot be added without the compiler asking what its
// question says — the same reason `band.ts` keys its texts by `BandKind`.
//
// **The three one-way moves say 戻せません plainly, and do not name the CLI's absence** (the wording is the
// user's, from the 2026-08-11 目視). The first draft said "アーカイブから戻す操作は v1.48.0 の CLI に
// ありません" — true, and measured (doc-8 §6.5 holds that measurement, which is where a reader who needs
// the reason goes) — but a version number in a question about *this* press answers something the user did
// not ask at the moment of asking. 差し戻す・昇格 *can* be taken back, so those two say what is lost
// instead: the id.
const TRANSITION_CONFIRM_QUESTION: Record<TransitionKind, string> = {
  taskDemote: "このタスクを draft へ差し戻します。id は採番し直されます。",
  taskArchive: "このタスクをアーカイブします。この操作は戻せません。",
  taskComplete: "このタスクを完了整理します。この操作は戻せません。",
  draftPromote: "この draft をタスクへ昇格します。id は採番し直されます。",
  draftArchive: "この draft をアーカイブします。この操作は戻せません。",
};

/** 進む側は動作を名乗る (doc-11 §12). Two kinds share `アーカイブする`: the act is the same act, and the
 * layer's own name says which of the two 保存区分 it was pressed from. */
const TRANSITION_CONFIRM_PROCEED: Record<TransitionKind, string> = {
  taskDemote: "draft へ差し戻す",
  taskArchive: "アーカイブする",
  taskComplete: "完了整理する",
  draftPromote: "タスクへ昇格する",
  draftArchive: "アーカイブする",
};

// --- 選択肢 (doc-5 §3 の値域) --------------------------------------------------------------

/** `--priority` の値域 (v1.48.0 `task edit --help`). Clearing one is not offered — no CLI option. */
export const PRIORITIES = ["high", "medium", "low"] as const;

/**
 * The values a select may offer for a field the CLI can set but not unset. "未設定" is offered only
 * while the field *is* unset, where choosing it changes nothing: offering it on a set field would
 * be a clear operation v1.48.0 does not have (AC #6 — not presented rather than refused later).
 */
export interface SelectOption {
  value: string;
  label: string;
}

export function optionsFor(current: string | null, values: readonly string[]): SelectOption[] {
  const options = values.map((value) => ({ value, label: value }));
  // A value the file carries but config.yml does not declare still has to be selectable as-is,
  // otherwise opening the select would silently propose changing it (decision-4 未分類 status).
  if (current !== null && current !== "" && !values.includes(current)) {
    options.unshift({ value: current, label: `${current}（config.yml 未宣言）` });
  }
  if (current === null || current === "") {
    options.unshift({ value: "", label: "—（未設定）" });
  }
  return options;
}

export function milestoneOptions(
  snapshot: ProjectSnapshot,
  current: string | null,
): SelectOption[] {
  const named = (milestone: Milestone) => ({
    value: milestone.id,
    label: `${milestone.id} ${milestone.title}`,
  });
  const options = snapshot.milestones.map(named);
  if (current !== null && current !== "" && !snapshot.milestones.some((m) => m.id === current)) {
    options.unshift({ value: current, label: `${current}（このルートに無い）` });
  }
  if (current === null || current === "") {
    options.unshift({ value: "", label: "—（未設定）" });
  }
  return options;
}

// --- AC 項目単位表示 (doc-5 §3) ------------------------------------------------------------

/** One baseline criterion with the pending per-item operations applied, for display. */
export interface AcRow {
  number: number;
  text: string;
  /** The state it would have after the delta is applied. */
  checked: boolean;
  /** Marked for `--remove-ac`; still listed, because the save has not happened yet. */
  removed: boolean;
}

export function acRows(session: EditSession): AcRow[] {
  const delta = session.draft.ac.mode === "delta" ? session.draft.ac.delta : EMPTY_DELTA;
  return session.baseline.task.acceptanceCriteria.map((item) => ({
    number: item.number,
    text: item.text,
    checked: delta.check.includes(item.number)
      ? true
      : delta.uncheck.includes(item.number)
        ? false
        : item.checked,
    removed: delta.remove.includes(item.number),
  }));
}

/**
 * Toggle one criterion's checked state as a per-item operation. `--check-ac` and `--uncheck-ac`
 * are separate options, and asking for the state it already has is not an operation at all — so a
 * toggle back to the baseline drops the pending one instead of adding its opposite.
 */
export function toggleAcCheck(session: EditSession, number: number): EditSession {
  if (session.draft.ac.mode !== "delta") return session;
  const delta = session.draft.ac.delta;
  const baseline = session.baseline.task.acceptanceCriteria.find((item) => item.number === number);
  if (baseline === undefined) return session;
  const current = delta.check.includes(number)
    ? true
    : delta.uncheck.includes(number)
      ? false
      : baseline.checked;
  const next = !current;
  const check = delta.check.filter((n) => n !== number);
  const uncheck = delta.uncheck.filter((n) => n !== number);
  if (next !== baseline.checked) {
    (next ? check : uncheck).push(number);
  }
  return setField(session, "ac", { mode: "delta", delta: { ...delta, check, uncheck } });
}

/** Mark or unmark one criterion for `--remove-ac`. */
export function toggleAcRemoval(session: EditSession, number: number): EditSession {
  if (session.draft.ac.mode !== "delta") return session;
  const delta = session.draft.ac.delta;
  const remove = delta.remove.includes(number)
    ? delta.remove.filter((n) => n !== number)
    : [...delta.remove, number];
  return setField(session, "ac", { mode: "delta", delta: { ...delta, remove } });
}
