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
 *   dependencies, and every operation v1.47.1 lacks, are withheld here rather than issued and
 *   refused by the adapter.
 * - **A withheld operation says why** (doc-5 §5). Nothing is silently missing: either it is offered,
 *   or it carries the reason it is not.
 */

import type {
  AcItem,
  CliReadiness,
  CommandError,
  Milestone,
  ProjectSnapshot,
  TaskEdit,
  TaskView,
  UpdateFailure,
  UpdateOperation,
} from "./wire";

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
 * §3/§3.1 require it: v1.47.1 has no single-option "set all AC", so 全体差し替え is a composite
 * that must not be confused with the per-item operations — and per-item text editing does not
 * exist at all, which is why `delta` has no text field for an existing item.
 */
export type AcDraft = { mode: "delta"; delta: AcDelta } | { mode: "replace"; items: AcItem[] };

export interface EditDraft {
  title: string;
  description: string;
  /** Raw frontmatter status. `""` means "leave unset" — the CLI has no way to unset one. */
  status: string;
  priority: string;
  milestone: string;
  plan: string;
  notes: string;
  /** `--notes` replaces, `--append-notes` appends: two CLI options, so a mode, not a flag. */
  notesMode: "set" | "append";
  /** 通常ラベル only. Type (kind ラベル) is not edited here — see `TYPE_NOT_EDITABLE`. */
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

/** Why Type values are not editable here, stated once so the panel and the tests agree. */
export const TYPE_NOT_EDITABLE =
  "Type の編集は kind ラベルの増減になりますが、読み取り層が保持するのは接頭辞を外した値であり、" +
  "元のラベル文字列と一致する保証がないため、この画面では提供しません（通常ラベルは編集できます）";

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
    view.task.acceptanceCriteria.map((item) => `${item.number} ${item.text}`);
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

export const EMPTY_REFERENCES_REASON =
  "References は最後の 1 件を削除できません（v1.47.1 の CLI に空集合化の手段がないため）。" +
  "空にする場合は外部エディタ経路を使います（doc-5 §3.1・doc-8 §6）";

export const EMPTY_DEPENDENCIES_REASON =
  "dependencies は最後の 1 件を削除できません（v1.47.1 の CLI に空集合化の手段がないため）。" +
  "空にする場合は外部エディタ経路を使います（doc-5 §3.1・doc-8 §6）";

/**
 * Renumber a per-item AC edit for the CLI (doc-5 §3). One `task edit` resolves its AC options in
 * two different frames, measured on v1.47.1:
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
  "title は空にできません（doc-4 §3.1 の必須項目で、空にすると解析不能として縮退表示になります）";

/**
 * Whether one more removal is allowed from a 非空全置換 field (doc-5 §3.1). The last element stays:
 * `--ref ""` / `--depends-on ""` exit 0 without clearing in v1.47.1, so an "empty it" control would
 * promise something the CLI silently declines to do.
 */
export function canRemoveLast(values: readonly string[]): boolean {
  return values.length > 1;
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
  | { state: "applied" }
  /** 更新前競合 (doc-9 §4): no CLI ran, and the screen already holds the re-read. */
  | { state: "conflict"; path: string }
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
  | { state: "conflict"; path: string }
  | { state: "diverged"; fields: string[] };

/**
 * A CLI failure as the panel states it (doc-5 §5). The sub-command and stderr are the reason the
 * user acts on; `partial` is carried through because it changes what a retry means — earlier
 * invocations already landed, so the screen is showing a state the failed action half-created.
 */
export function failureDetail(failure: UpdateFailure): string {
  const how =
    failure.kind.kind === "spawn"
      ? "起動できません"
      : `終了コード ${failure.kind.code ?? "不明"}`;
  const partial = failure.partial
    ? `（この操作の ${failure.completedBefore} 件は既に適用済みで、再読込済みです）`
    : "";
  return `${failure.command} が失敗しました（${how}）${partial}: ${failure.stderr.trim()}`;
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
        `拒否しました。版がずれていることを検出したわけではありません（doc-9 §4.2）。${error.detail}`
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
    case "ledger":
    case "watchFailed":
      return error.detail;
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
    case "unavailable":
      return `PATH 上に backlog CLI が見つからないため更新操作を提供しません（${readiness.detail}）`;
    case "unsupported":
      return `backlog CLI ${readiness.version} は動作確認範囲外のため更新操作を提供しません（必要: ${readiness.minimum} 以上）`;
  }
}

const DRAFT_READ_ONLY =
  "draft の内容編集は提供しません（v1.47.1 に draft 向けの task edit 相当が無いため。doc-5 §3.3）。" +
  "編集するには draft promote でタスクへ昇格するか、外部エディタ経路を使います";

const CLOSED_READ_ONLY =
  "completed・archive のタスクは task edit が not found になるため読み取り専用です（doc-8 §6.5）。" +
  "内容を変えるには外部エディタ経路を使います";

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
      reason: "TASK-ID を読めないため更新操作の対象を指定できません（doc-4 §5 の解析不能）",
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
        reason: "保存区分を判別できないため更新操作を提供しません（doc-4 §3.4）",
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
 * archive have no reverse operation in v1.47.1, so no control is drawn for one.
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
        "completed・archive から戻す操作は v1.47.1 の CLI にないため提供しません（doc-5 §3.1）",
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
          offer("draftPromote", "タスクへ昇格 (draft promote)", DRAFT_PROMOTE_EFFECT, {
            op: "draftPromote",
            draftId: id,
          }),
          offer("draftArchive", "アーカイブ (draft archive)", DRAFT_ARCHIVE_EFFECT, {
            op: "draftArchive",
            draftId: id,
          }),
        ]
      : [
          offer("taskDemote", "draft へ差し戻す (task demote)", TASK_DEMOTE_EFFECT, {
            op: "taskDemote",
            taskId: id,
          }),
          offer("taskArchive", "アーカイブ (task archive)", TASK_ARCHIVE_EFFECT, {
            op: "taskArchive",
            taskId: id,
          }),
          offer(
            "taskComplete",
            "完了整理 (task complete)",
            TASK_COMPLETE_EFFECT,
            { op: "taskComplete", taskId: id },
            view.task.status === COMPLETABLE_STATUS
              ? null
              : `status が ${COMPLETABLE_STATUS} のときのみ能動化します（現在: ${
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

const DRAFT_PROMOTE_EFFECT =
  "draft → active。id は TASK-M へ採番し直されます。status が Draft の draft だけが既定 status へ変わり、" +
  "task demote 由来の draft は status を保持します（doc-5 §3.3）";
const DRAFT_ARCHIVE_EFFECT = "draft → archive/drafts。id・status は保持されます（doc-5 §3.3）";
const TASK_DEMOTE_EFFECT =
  "active → draft。id は DRAFT-M へ採番し直され、status は保持されます（doc-5 §3.3）";
const TASK_ARCHIVE_EFFECT =
  "active → archive/tasks。status を問わず実行できます。戻す操作は CLI にありません（doc-5 §3）";
const TASK_COMPLETE_EFFECT =
  "active → completed。status が Done のときのみ成功します。戻す操作は CLI にありません（doc-5 §3）";

// --- 選択肢 (doc-5 §3 の値域) --------------------------------------------------------------

/** `--priority` の値域 (v1.47.1 `task edit --help`). Clearing one is not offered — no CLI option. */
export const PRIORITIES = ["high", "medium", "low"] as const;

/**
 * The values a select may offer for a field the CLI can set but not unset. "未設定" is offered only
 * while the field *is* unset, where choosing it changes nothing: offering it on a set field would
 * be a clear operation v1.47.1 does not have (AC #6 — not presented rather than refused later).
 */
export interface SelectOption {
  value: string;
  label: string;
}

export function optionsFor(current: string | null, values: readonly string[]): SelectOption[] {
  const options = values.map((value) => ({ value, label: value }));
  // A value the file carries but config.yml does not declare still has to be selectable as-is,
  // otherwise opening the select would silently propose changing it (decision-4 未対応 status).
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
