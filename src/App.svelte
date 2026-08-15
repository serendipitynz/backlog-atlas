<script lang="ts">
  // The swimlane screen's shell (TASK-34 / doc-7): it owns the data the grid draws and the
  // screen-local row state, and nothing else. All placement, ordering and filtering rules live
  // in `lib/swimlane.ts` and `lib/filter.ts` as pure functions.
  //
  // Row order is deliberately *not* screen state: it is the ledger's entry order (doc-3 §2.2),
  // and a reorder is written back through `ledger_update` (doc-7 §5 allows reflecting it
  // there), so the order the user arranges survives a restart. 行非表示 と 折畳み 2 種 are the
  // opposite — doc-7 §5.1 calls them 一時状態 — and this component is the only one that writes the
  // three. It holds them rather than the grid because it is the one that stays: 実行内保持
  // (doc-7 §5.1). The 2 folds reach the grid as props for it to draw from; `hidden` never leaves,
  // since it decides which rows the grid is handed at all.
  import { onDestroy, onMount, untrack } from "svelte";
  import FilterBar from "./components/FilterBar.svelte";
  import HeaderMenu from "./components/HeaderMenu.svelte";
  import Modal from "./components/Modal.svelte";
  import ProjectDetail from "./components/ProjectDetail.svelte";
  import ProjectRegister from "./components/ProjectRegister.svelte";
  import Settings from "./components/Settings.svelte";
  import ShortcutHelp from "./components/ShortcutHelp.svelte";
  import Swimlane from "./components/Swimlane.svelte";
  import TaskDetail from "./components/TaskDetail.svelte";
  import TitleBar from "./components/TitleBar.svelte";
  import Icon from "./lib/icons/Icon.svelte";
  import {
    asCommandError,
    cliProbe,
    externalProgramsProbe,
    editorProbe,
    gitRemoteRead,
    ledgerDefaultSlug,
    ledgerList,
    ledgerLocation,
    ledgerRegister,
    ledgerRemove,
    ledgerReorder,
    ledgerUpdate,
    onProjectReloaded,
    pickDirectory,
    projectOpen,
    projectWatchStart,
    projectWatchStop,
    settingsDirectoryPresent,
    settingsLocation,
    settingsLocationOpen,
    settingsRead,
    settingsSave,
    bodyLinkOpen,
    taskFileOpen,
    taskHistoryRead,
    taskHistoryCancel,
    updateApply,
    windowTitleSet,
    workspaceOpen,
  } from "./lib/commands";
  import { REGISTERING_REASON, refusalReport, type LedgerActionResult } from "./lib/ledger";
  import type { HistoryState } from "./lib/detail";
  import { topBands } from "./lib/band";
  import { SHORTCUT_HELP_LABEL, headerMenu, type HeaderEntryId, type MenuItem } from "./lib/header";
  import {
    ariaKeyShortcuts,
    continuesHeldPress,
    matchShortcut,
    shortcutHint,
    textEntryFocused,
    type ShortcutScope,
  } from "./lib/shortcuts";
  import { MAC_KEYBOARD, OVERLAY_TITLE_BAR } from "./lib/platform";
  import { windowTitle } from "./lib/title";
  import {
    DISCARD_CONFIRM_KEEP,
    DISCARD_CONFIRM_PROCEED,
    ISSUE_CONFIRM_CANCEL,
    commandErrorDetail,
    failureDetail,
    type ApplyOutcome,
    type DiscardAnswers,
    type IssueConfirmation,
  } from "./lib/edit";
  import { issueAvailability, outcomeMessage, type IssueOutcome } from "./lib/manage";
  import {
    buildLaneTaskCreate,
    laneCreate,
    laneCreateHold,
    laneCreateStatus,
  } from "./lib/lane-create";
  import {
    buildLaneStatusEdit,
    laneDragHold,
    laneDrop,
    laneDropOptions,
    laneDropStatus,
    type DragSource,
  } from "./lib/lane-drop";
  import {
    WATCH_STOPPED_BEFORE_LAUNCH,
    launchFailureDetail,
    type OpenOutcome,
  } from "./lib/external-editor";
  import {
    conflictKeyOf,
    isInconsistent,
    type ConflictTarget,
    type VersionConflict,
  } from "./lib/mark";
  import { DEFAULT_CARD_DENSITY } from "./lib/card";
  import {
    createHistoryLoader,
    historyKeyOf,
    type HistoryInputs,
    type HistoryRead,
  } from "./lib/history-read";
  import { SAVING_REASON, openLocationFailure } from "./lib/settings";
  import { createSettingsWriter } from "./lib/settings-write";
  import { themeAttribute } from "./lib/theme";
  import {
    DEFAULT_FILTER,
    collectFacets,
    matchesFilter,
    withStorage,
    type CardFilter,
  } from "./lib/filter";
  import { lastCondition, removeLastCondition } from "./lib/token";
  import {
    CANONICAL_COLUMN_LABEL,
    DEFAULT_CARD_ORDER,
    buildSwimlane,
    columnFoldable,
    laneNeighbours,
    swimlaneTotals,
    unreadableDetail,
    type GridColumn,
  } from "./lib/swimlane";
  import type {
    AppSettings,
    CardOrder,
    CliReadiness,
    DetailPlacement,
    EditorReadiness,
    GitRemoteRead,
    LaunchMethod,
    ColumnCreateStatuses,
    LedgerResponse,
    ExternalProgramReport,
    LoadedSettings,
    ProjectEntry,
    ProjectLoad,
    ProjectSnapshot,
    RegisterRequest,
    StatusColumn,
    TaskView,
    UpdateOperation,
    UpdateRequest,
  } from "./lib/wire";
  import type { UnlistenFn } from "@tauri-apps/api/event";

  /**
   * 利用者向け画面 (doc-7・doc-10). Two, not four: TASK-55 folded the 台帳管理画面 and the
   * 文書・マイルストーン管理画面 into one プロジェクト詳細画面 per project, because the two used to
   * put「全プロジェクトの台帳」and「1 プロジェクトの文書・マイルストーン」side by side at different
   * granularities. 登録 is the one ledger-wide operation left, and it opens from the ☰'s menu
   * (doc-3 §4・doc-7 §2.1) rather than being a screen of its own.
   */
  type Screen = "swimlane" | "project";

  /**
   * Which screen is showing. The swimlane's own state (rows, filter, selection) lives in this shell,
   * so switching away and back keeps it; what does not survive is the other components' internal
   * state — including the detail panel's 編集セッション and プロジェクト詳細画面's forms, which is why
   * leaving either while dirty asks first (doc-8 §6.3).
   */
  let screen = $state<Screen>("swimlane");
  /** Which project プロジェクト詳細画面 is showing. `null` while the swimlane is up. */
  let detailSlug = $state<string | null>(null);
  /** Whether the menu's 「プロジェクトを登録」 modal is open (doc-7 §2.1). */
  let registerOpen = $state(false);
  /**
   * Whether the 登録 form holds 未保存入力 — what makes the モーダル's exits ask first (doc-8 §6.3,
   * doc-11 §7). Held here rather than in the form for the reason `settingsDirty` is: neither of the
   * two exits that would lose it is the form's own control.
   */
  let registerDirty = $state(false);
  /**
   * Whether a registration issued from that form is still unresolved. Raised around the one call, and
   * read by both of the モーダル's exits — the same shape as `settingsSaving` one screen over, and for
   * the same reason (`Modal.svelte`'s Escape reaches this layer, not the form).
   *
   * Not `ledgerBusy`: that one also stands for a command the プロジェクト詳細画面 issued, and holding a
   * モーダル closed for a write it is not reporting would give a reason that is not the one that held.
   */
  let registerSubmitting = $state(false);
  /** Whether the ☰'s メニュー is open (doc-7 §2.1). */
  let menuOpen = $state(false);
  /**
   * What プロジェクト詳細画面 last reported through its `onoverlay` — whether its 作成モーダル
   * (doc-10 §1) is up. Held beside the menu's own three because `modalOpen` reads all four, but it
   * is not one of them: this screen raises it, and `detailOverlay` is the whole of the shell's part.
   */
  let detailModalOpen = $state(false);
  /**
   * Whether the 一覧モーダル is open — where the 割り当て一覧's 画面に出す列 are read (doc-7 §2.1 holds the
   * record and this table apart). It is a モーダル and not part of the menu since TASK-67: the table is the
   * longest thing the menu held, and a reference folded under the entries pushed the entries themselves
   * out of the menu's own height.
   */
  let shortcutHelpOpen = $state(false);
  /**
   * The ☰ and the box it hangs off, so the menu can be closed back onto the control it came from.
   *
   * The ☰ is also what a モーダル hands focus back to (`raiseModal`). It is on every screen's topmost bar, so
   * it is on screen whichever route was taken into the modal — unlike the menu line that was pressed,
   * which the modal unmounts on its way up.
   */
  let menuAnchor = $state<HTMLDivElement | null>(null);
  let menuButton = $state<HTMLButtonElement | null>(null);
  /**
   * Whether the フィルタ帯's 値一覧 is open (doc-7 §5.2). Held by the shell rather than by the bar
   * because a key opens it as well (`addFilter`), and a second opener would need its own way in.
   */
  let filterPopoverOpen = $state(false);
  /**
   * A row the grid should bring into view — プロジェクト詳細画面's 「このプロジェクトのレーンへ」
   * (doc-10 §2). Held here rather than in the grid because the request outlives the screen that made
   * it: the grid is not even mounted at the moment the button is pressed.
   */
  let focusRow = $state<string | null>(null);
  let entries = $state<ProjectEntry[]>([]);
  /** The ledger file's path (doc-3 §2.1), for the 登録 panel to show. `null` until it is known. */
  let ledgerPath = $state<string | null>(null);
  /**
   * アプリ設定 and why they are what they are (decision-13). `null` until the first read answers, which
   * is why the screen waits for it before opening any root: 継続検出の可否 and 既定の保存区分 decide what
   * the first read *does*, and applying them after the fact would start a watch the user turned off.
   */
  let settings = $state<LoadedSettings | null>(null);
  /** 解決結果の表示 (decision-29). `null` until the 設定画面's own probe answers. */
  let externalPrograms = $state<ExternalProgramReport[] | null>(null);
  /**
   * Which detached refresh is current, so a slow one cannot overwrite a newer one's answer.
   *
   * The refreshes are detached (see `saveSettings`), so two can be in flight: save the `backlog` path,
   * reopen 設定, save the `git` path — which is the panel's own workflow, one command at a time. Each
   * launch is bounded at 5 s and the CLI's at 30 s (doc-5 §5), so the second can easily finish first,
   * and the first would then land its *older* answer on the 帯 and the 区画. Nothing corrects it until
   * the next probe, and a stale 帯 is not merely a display: it decides whether edit controls are
   * offered at all.
   *
   * Two counters rather than one, because the values have different writers. `saveRefresh` guards what
   * only `refreshAfterSave` writes; `programsRefresh` guards the panel, which 設定モーダルを開く also
   * refreshes. One shared counter would let an open discard an in-flight save's 帯 answer — and
   * nothing would re-issue it.
   */
  let saveRefresh = 0;
  let programsRefresh = 0;
  /** Where `settings.toml` is (decision-13), for the 設定画面 to name. `null` while unknown. */
  let settingsPath = $state<string | null>(null);
  /**
   * Whether the folder both of Atlas's own files live in is there yet (doc-3 §2.1), for the 設定画面 to
   * withhold 場所を開く with. `null` until an answer is in hand — a probe still in flight and one that
   * failed are one state to the screen, which says it has not looked rather than reporting a folder
   * it has not looked at.
   *
   * Held apart from the two paths above because the answers have different lifetimes: a path is
   * resolved once and cannot change while the app runs, while this turns true the first time either
   * file is saved (`store::replace` creates the destination's parent).
   */
  let settingsDirectory = $state<boolean | null>(null);
  /**
   * Which probe of the folder is the current one. Two can be in flight — the startup one and the one
   * a 設定 open issues over it — and without this the later *answer* wins rather than the later
   * *question*: a startup rejection landing after an open-time `true` would put the control back to
   * 確認できていません while the モーダル is up. Not `$state`: nothing renders from it.
   */
  let settingsDirectoryProbe = 0;
  /** Whether the 設定画面 is open. Opened from the menu's 設定 (doc-7 §2.1). */
  let settingsOpen = $state(false);
  /**
   * Whether a 設定 save is still unresolved. Held here rather than in the form, because it has to close
   * *both* ways out of the モーダル: the form withholds its own two controls with it, and Escape reaches
   * this layer (`Modal.svelte`), not the form. One fact, one flag.
   */
  let settingsSaving = $state(false);
  /**
   * Whether the 設定 form's 下書き differs from the file — what makes the three exits ask before they
   * discard it (doc-8 §6.3, doc-11 §7). Held here because only two of the three are the form's own
   * controls, and the third (Escape) never reaches it.
   */
  let settingsDirty = $state(false);
  let loadBySlug = $state<Record<string, ProjectLoad>>({});
  /**
   * 行非表示・行折畳み・列折畳み (doc-7 §5.1) の 3 値.
   *
   * All three are held here rather than in `Swimlane.svelte`, because 一時状態 in doc-7 §5.1 means
   * 実行内保持: the grid is unmounted whenever プロジェクト詳細画面 is entered, and again when a task is
   * opened while 既定の詳細配置 is 全面シングルビュー — a value the grid held would be back at its
   * initial state on the return, which is not what the user asked the fold for. Nothing outside this
   * component writes them, and the 2 folds are read only by the grid.
   */
  let hidden = $state<string[]>([]);
  let foldedRows = $state<string[]>([]);
  let collapsedColumns = $state<GridColumn[]>([]);
  let filter = $state<CardFilter>(DEFAULT_FILTER);
  let ledgerReadOnly = $state(false);
  let loading = $state(true);
  /** A failure that left the screen with nothing to draw, as opposed to one bad row. */
  let fatal = $state<string | null>(null);
  /** A failure of an action the user took; the grid stays usable. */
  let notice = $state<string | null>(null);
  /**
   * The open task, held as (slug, file path) rather than as the `TaskView` itself: a reload
   * replaces every view object, and a captured one would keep the detail panel showing the
   * task as it was read before the change (doc-9 §3 継続検出). The path is the key because a
   * 解析不能 task has no id (doc-4 §5) and must still be openable.
   */
  let selectedRef = $state<{ slug: string; sourcePath: string } | null>(null);
  /**
   * The Git 履歴 read the screen holds, tagged with the task and the call it came from. The panel
   * shows it only while its key matches the open task, so a selection change reads as 読み込み中
   * rather than as the previous task's commits; `history-read.ts` owns the other half — which of
   * several in-flight calls may store its answer.
   */
  let historyRead = $state<HistoryRead | null>(null);
  /**
   * The レーンセル whose 列内新規タスク入力 is open (doc-7 §4.1), or `null` while none is. One at a time
   * across the whole grid: two open inputs would both claim 発行, and the shell runs one action at a
   * time (`laneCreateBusy`).
   *
   * Held here rather than in the grid because the grid is unmounted on two ordinary routes — entering
   * プロジェクト詳細画面, and opening a task in 全面シングルビュー (doc-8 §2.1) — and a title the user had
   * typed would go with it. Keeping it in the shell means nothing is lost, so no route needs a
   * 破棄前確認 for it; doc-8 §6.3's confirmation covers the 編集セッション, and extending that rule to a
   * place doc-7 §4.1 does not name would be inventing one.
   */
  let laneCreateAt = $state<{ slug: string; column: StatusColumn } | null>(null);
  let laneCreateTitle = $state("");
  /**
   * The candidate the user picked, as typed — not necessarily the one that will be passed. What is
   * passed is `laneCreateStatus`'s answer against the *current* 候補, so an external `config.yml` edit
   * cannot leave a value here that `-s` would refuse (doc-7 §4.1).
   */
  let laneCreateHeldStatus = $state("");
  /** True while the lane's `task create` is in flight — the 発行中 the entry states (doc-5 §5). */
  let laneCreateBusy = $state(false);
  /**
   * Whether a supported `backlog` exists (doc-5 §5 縮退). `null` until the probe answers, which the
   * panel shows as "確認中" rather than as "no CLI" — the two lead to different user actions.
   */
  let readiness = $state<CliReadiness | null>(null);
  /**
   * Which 外部エディタ経路 launch methods this environment has (doc-8 §7). `null` until the probe
   * answers, which the panel shows as 確認中 rather than as "no editor" — the two differ in what the
   * user would do next.
   */
  let editorReadiness = $state<EditorReadiness | null>(null);
  /**
   * Roots whose 継続検出 is not running (doc-9 §3): the watch refused to start, so nothing pushes a
   * re-read for them and their cards are only as fresh as the last read. Recorded rather than merely
   * reported, because it changes what the screen owes the user — an explicit re-read they can press
   * (`rereadRow`), which is the only thing that will show an external save for such a root.
   */
  let unwatched = $state<string[]>([]);
  /**
   * Whether a watch-triggered re-read can reach the screen at all. The event subscription is the
   * frontend half of 継続検出 (doc-9 §3): without it every root's watch can run perfectly and still
   * change nothing here, because no one copies the emitted `ProjectLoad` into `loadBySlug`. Held
   * beside `unwatched` because it has the same consequence for the user (only an explicit re-read
   * refreshes anything) but no per-root cause — it makes *every* row stale.
   */
  let reloadFeed = $state<"live" | "unavailable">("live");
  /**
   * バージョン不整合 (doc-9) per task, keyed by (slug, source path). Owned by the shell rather than the panel
   * because the mark has to outlive the panel: a divergence observed while editing one task is
   * still true after the user goes to look at another, and the swimlane is where they would find it
   * again (AC #4 横断的に適用する). Cleared by the panel when the divergence is resolved — a clean
   * save, a restart from the latest read, a rebase onto it, or an acknowledgement.
   */
  let conflicts = $state<Record<string, VersionConflict>>({});
  /** True while the detail panel holds 未保存入力 — what makes leaving the panel ask first. */
  let detailDirty = $state(false);
  /**
   * True while プロジェクト詳細画面 holds 未保存入力 — its 台帳エントリ編集・文書編集セッション and
   * the three create forms alike. Separate from `detailDirty` because they belong to different
   * screens: only the one being left has input to protect, and one flag for both would ask about a
   * panel that is not even mounted.
   */
  let projectDirty = $state(false);
  /**
   * What the user asked for while a screen held 未保存入力, held as the continuation to run once they
   * answer the 破棄前確認 (doc-8 §6.3). One pending action rather than a tagged union of destinations,
   * because doc-8 §6.3 puts all five routes — キャンセル・閉じる・別タスクを開く・前後移動・詳細配置の
   * 切替 — behind the same question in the same words: what differs between them is only what happens
   * after "はい", which is exactly what a continuation carries.
   *
   * Screen changes go through it too: switching tabs unmounts the panel holding the input, which
   * discards it just as thoroughly as opening another task does.
   */
  let pendingDiscard = $state<(() => void) | null>(null);
  /**
   * The 実行前確認 standing right now (doc-11 §12), or `null` while nothing is being asked: the question
   * as the layer prints it, what a 進む answer runs, and the file the control it came from belongs to.
   *
   * Held by the shell for the reason the 破棄前確認 is: 被せ層 は同時に 1 枚 is the shell's to keep
   * (`raiseModal`), and a layer a 区画 raised for itself would fall outside that count. The path is
   * what makes 失効 decidable — the question is about the task the panel was pointed at when it was
   * asked (§12 の ③), and `shown` moving off that file takes the question with it.
   */
  let pendingIssue = $state<{
    path: string;
    confirmation: IssueConfirmation;
    proceed: () => void;
  } | null>(null);
  // --- 列間ドロップ の状態 (doc-7 §4.2) -------------------------------------------------------
  // Declared with the other 被せ層 state rather than beside the drop's own functions, because
  // `modalOpen` reads `dropAsk` — the 問い is one of the layers 同時に 1 枚 counts.
  /**
   * The card being dragged, or `null`. Held here rather than in the grid for the same reason
   * 列内新規タスク入力's input is: the grid is unmounted when a task opens in 全面シングルビュー, and a
   * drag that survived that would land on a grid it did not start on.
   */
  let dragSource = $state<DragSource | null>(null);
  /**
   * Which drop raised the 候補選択の問い (doc-7 §4.2), or `null`. **Only the card and the column** —
   * what that drop *resolves to* is derived below from the current read, never captured here. The
   * candidates come from `config.yml`, which 継続検出 can re-read while the layer stands (doc-9 §3),
   * and a captured list would make `laneDropStatus`'s fallback compare a value against its own
   * frozen copy — i.e. never fire. `laneCreateEntry` is derived per read for the same reason.
   */
  let dropAsk = $state<{ source: DragSource; column: StatusColumn } | null>(null);
  let dropHeldStatus = $state("");

  /**
   * 詳細配置 (doc-8 §2.1) in force. Held by the shell rather than the panel because the placement is
   * *where the panel goes*: beside the grid, over it, or instead of it — and only the shell can put it
   * there. Starts from アプリ設定 (`applySettings`) and is written back on every switch (doc-8 §2.2).
   */
  let placement = $state<DetailPlacement>("sidebar");
  /**
   * Why the last switch could not be stored as the 既定, or `null`. Kept apart from `notice` because
   * the placement did take effect — only its persistence did not — and the panel states that beside
   * the switch, where the 既定 mark is (doc-8 §2.2).
   */
  let placementFailure = $state<string | null>(null);
  /**
   * 並び順 (doc-7 §5.4) in force. Held as state rather than read straight off `settings` — the way
   * カード情報量 is — because the 帯's control has to answer even when the write does not: decision-13
   * leaves a settings file newer than this build alone, and a grid that simply did not reorder would
   * be the whole of what the user got back. The screen changes first and the file follows, like the
   * 詳細配置 switch.
   */
  let cardOrder = $state<CardOrder>(DEFAULT_CARD_ORDER);
  /**
   * Why the last choice could not be stored as the 既定, or `null`. Stated in the 帯 beside the control:
   * the order did take effect — only its persistence did not.
   */
  let cardOrderFailure = $state<string | null>(null);

  let unlisten: UnlistenFn | null = null;

  /** The operations that move a task between 保存区分 (doc-5 §3.3) — they invalidate a selection. */
  const TRANSITIONS: string[] = [
    "taskDemote",
    "taskArchive",
    "taskComplete",
    "draftPromote",
    "draftArchive",
  ];

  let order = $derived(entries.map((entry) => entry.slug));
  let loads = $derived(new Map(Object.entries(loadBySlug)));
  /**
   * 不整合 (decision-22) for one task: the read's own findings plus this shell's バージョン不整合
   * record. Defined here because that record is held here — the grid and the facet counts both ask
   * this one function, so the 不整合 facet cannot hide a card that is drawing a ⚠️.
   */
  function conflictFor(view: TaskView): VersionConflict | null {
    return conflicts[conflictKeyOf(view.task.project, view.task.sourcePath)] ?? null;
  }
  let inconsistentView = $derived((view: TaskView) => isInconsistent(view, conflictFor(view)));
  let rows = $derived(
    buildSwimlane({
      order,
      loads,
      hidden: new Set(hidden),
      filter,
      cardOrder,
      inconsistent: inconsistentView,
    }),
  );
  let allViews = $derived(
    Object.values(loadBySlug).flatMap((load) =>
      load.state === "loaded" ? load.project.tasks : [],
    ),
  );
  let facets = $derived(collectFacets(allViews, inconsistentView));
  /**
   * 総件数 for the タイトルバー (doc-7 §2.1, decision-31). `order` rather than `rows` for the lane
   * side: the ledger is what 全件 counts, so a hidden row leaves 表示数 and stays in it.
   */
  let gridTotals = $derived(swimlaneTotals(rows, order.length));
  /**
   * The one line the title bar shows, whichever of decision-31's two halves this build is in.
   * 総件数 only on the swimlane: both ratios describe the グリッド, so on プロジェクト詳細画面 they would
   * be counting a screen that is not up (doc-7 §2.1).
   */
  let titleLine = $derived(windowTitle(screen === "swimlane" ? gridTotals : null));
  /** 既定の保存区分 (decision-13) — the state 既定に戻す returns the filter to. */
  let defaultStorage = $derived(
    settings?.settings.default_storage_filter ?? DEFAULT_FILTER.storage,
  );
  // 保存区分印 goes on cards only once a division beyond active is in play (doc-7 §3).
  let showStorageMark = $derived(filter.storage.some((state) => state !== "active"));
  /**
   * The ledger entry プロジェクト詳細画面 is about, or `null` when there is none to show. Resolved
   * against the *current* ledger rather than captured on open, so an entry another window removed
   * takes the screen back to the grid instead of leaving it editing a registration that is gone.
   */
  let detailEntry = $derived(
    detailSlug === null ? null : (entries.find((entry) => entry.slug === detailSlug) ?? null),
  );
  /**
   * 継続検出の可否 (doc-9 §3.1, decision-13). Defaults to on until the settings are read, which is the
   * state a build without a settings file has always been in.
   */
  let watchEnabled = $derived(settings?.settings.watch_external_changes ?? true);
  /**
   * カード情報量 (doc-7 §3, decision-13). Read straight off the settings rather than copied into state
   * on load, so a 保存 in the 設定画面 changes the cards without the grid being rebuilt — the same
   * treatment 継続検出の可否 gets. The fallback is the doc's 既定 M, which is what the grid draws while
   * the first read is in flight and after a read that degraded to the defaults.
   */
  let cardDensity = $derived(settings?.settings.card_density ?? DEFAULT_CARD_DENSITY);
  /**
   * 表示テーマ (decision-12) applied to the document: the chosen set's name on `<html data-theme>`, or
   * the attribute removed for 未選択. Removed rather than resolved to a name, so the OS switching
   * light↔dark is followed by `app.scss`'s media query for as long as nothing has been chosen — the
   * shell has no listener to keep in step, and the first paint (before this read answers) is already
   * the right one.
   *
   * Written from an effect rather than from `applySettings`, because `<html>` is outside this
   * component's markup and the same attribute has to follow *every* path a theme can change by: the
   * 設定画面's 保存, the first read at startup, and a read that degraded to the defaults.
   */
  $effect(() => {
    const chosen = themeAttribute(settings?.settings.theme ?? null);
    if (chosen === null) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = chosen;
    }
  });
  /**
   * 総件数 into the window's own title, on every platform but macOS (decision-31). There the 帯 is drawn
   * over the OS's own bar and the title is left as `tauri.conf.json` set it, which is what Mission
   * Control and the 窓の一覧 show.
   *
   * **On Linux this is written and not drawn** (decision-31 の Linux の改訂). The write is accepted and
   * `title()` reads the new value back, while the decoration keeps the old one — a layer Atlas cannot
   * reach. It is still written, because a window list that does read the title gets the right one, and
   * because the alternative is a platform branch around a call that costs nothing.
   *
   * From an effect, like the theme above and for the same reason: the window is outside this
   * component's markup, and the title has to follow every path 総件数 or the current screen can change
   * by — a filter, a hide, a re-read, a move onto プロジェクト詳細画面 and back.
   *
   * **A refusal is reported** (⑤ 通知, doc-11 §4) rather than swallowed. Windows is the one platform
   * where the title is the only place 総件数 goes — macOS and Linux draw the 帯 — so a write it refuses
   * leaves the ratios nowhere, and doc-11 §5's refusal of a 理由の無い無効化 is the same principle.
   *
   * **Whether the title was *applied* is not checked, and that is a decision** (decision-31 の Linux の
   * 改訂). It was, until the platform it was written for turned out to accept the write and read the new
   * value back while drawing the old one — so the check answered "applied" for the very defect it
   * existed to name. What is left for it to report on Linux is a state the owner has accepted knowingly,
   * once, per run; a 帯 saying so on every start would be noise about a decision already taken.
   */
  $effect(() => {
    if (OVERLAY_TITLE_BAR) {
      return;
    }
    void windowTitleSet(titleLine).catch((error) => {
      notice = `ウィンドウのタイトルに総件数を出せません（${unreadableDetail(asCommandError(error))}）`;
    });
  });
  /**
   * The rows an external change would not reach on its own, so the manual 再読込 is offered for them.
   * Three causes converge here: the user turned 継続検出 off (every row), the event subscription is
   * dead so nothing can arrive at all (every row), or a root's own watch would not start. doc-9 §3.1
   * requires exactly this — the state and its mark are the same however it came about, and only the
   * reason differs, which `unwatchedReason` below states. Only registered rows either way: a slug
   * that left the ledger has no row to re-read.
   */
  let unwatchedRows = $derived(
    !watchEnabled || reloadFeed === "unavailable"
      ? order
      : unwatched.filter((slug) => order.includes(slug)),
  );
  /** Why 継続検出 is stopped, for the 帯. The state's name and mark stay the same (doc-9 §3.1). */
  let unwatchedReason = $derived(
    !watchEnabled
      ? "設定で継続検出を切っているため、どの行も自動では更新されません"
      : reloadFeed === "unavailable"
        ? "変更の通知を購読できていないため、どの行も自動では更新されません"
        : "変更監視が動いていない行があります",
  );
  /** Whether the open task's root is one of those (AC #7: the 外部エディタ経路 states it before opening). */
  let selectedWatchStopped = $derived(
    selectedRef !== null && unwatchedRows.includes(selectedRef.slug),
  );
  /**
   * Whether the 破棄前確認 standing right now belongs inside a モーダル rather than in the 上部帯
   * (doc-11 §7). Only the two モーダル that hold input are asked about: while one of them is up nothing
   * behind it can be pressed (the layer covers the window and keeps focus inside), so a question
   * standing at that moment is one of its own exits' — and it is drawn where it can be answered.
   *
   * The 一覧モーダル is not in the list: it holds nothing, so it raises no question, and naming it here
   * would move a question raised behind it into a layer with no way to show it.
   */
  let confirmInModal = $derived(pendingDiscard !== null && (settingsOpen || registerOpen));

  /**
   * The two answers, as the layer that draws them takes them (doc-8 §6.3). One value, so the question
   * and its answers cannot be handed over half-set; `null` while nothing is being asked.
   */
  let modalConfirm = $derived<DiscardAnswers | null>(
    confirmInModal ? { onproceed: discardConfirmed, onkeep: keepEditing } : null,
  );

  /**
   * 上部帯 (doc-11 §4) for whichever screen is up. Derived rather than drawn one `{#if}` per band,
   * because the order is a rule and not a property of the markup: 出現順に積むと、帯が増えるほど回答
   * 待ちの ① が通知 ⑤ の下へ押し出される。The shell owns every kind for both screens — プロジェクト詳細
   * 画面's own 2 帯 (doc-10 §3) are ② and ③ of this same stack, and letting that screen draw them
   * itself would put them *below* the shell's ① and ⑤ and break the fixed order.
   *
   * ④ is raised on the swimlane only: it is about grid rows — the mark and the 再読込 it points at —
   * and has nothing to name while the grid is not up.
   */
  let bands = $derived(
    topBands({
      // Not while a モーダル is up: it covers the 上部帯 (doc-7 §2.1), so the ① would stand where it
      // cannot be read or answered while `Modal.svelte` draws the same question inside the layer
      // (doc-11 §7). One question, drawn once — a band behind the layer would be a second copy of it
      // that the user meets on the way back out.
      confirming: pendingDiscard !== null && !confirmInModal,
      readiness,
      ledgerReadOnly,
      unwatchedReason:
        screen === "swimlane" && unwatchedRows.length > 0 ? unwatchedReason : null,
      notice,
    }),
  );
  /**
   * プロジェクト一覧 (doc-7 §2.1) — every ledger entry, in ledger order, with the name the read layer
   * found and whether the grid is drawing that row. Built from `order` rather than from `rows`: `rows`
   * is what the grid draws, and a hidden project has to appear here precisely because it does not
   * appear there. The name comes from the load when there is one; an unread or unreadable root has
   * none, and `projectMenuLabel` is where that falls back to the slug.
   */
  let menuProjects = $derived(
    order.map((slug) => {
      const load = loadBySlug[slug];
      return {
        slug,
        name: load?.state === "loaded" ? load.project.config.projectName : null,
        shown: !hidden.includes(slug),
      };
    }),
  );
  /**
   * The メニュー's lines (doc-7 §2.1): the 共通入口, then the line that opens the 一覧モーダル, then the
   * プロジェクト一覧 — すべてのプロジェクトを表示 and one 表示切替行 per registered project.
   */
  let menuItems = $derived(headerMenu(menuProjects));
  /**
   * Whether a モーダル is up. While one is, the shell answers no chord at all: doc-7 §2.1 keeps a modal's
   * focus inside itself, and the modal is what answers Escape and Tab there (`Modal.svelte`).
   *
   * The fourth term is プロジェクト詳細画面's 作成モーダル (doc-10 §1), which that screen raises for
   * itself — a 被せ層 is no longer only what the 共通入口 open (doc-11 §7 as TASK-117 revised it),
   * so the shell has to be told rather than to know.
   *
   * `screen` is read with it as a second lock, not as the retraction: that screen retracts its own
   * report from its effect's teardown, so a stale `true` should not outlive it. This clause is what
   * keeps a bug there from reaching the swimlane, where none of this screen's layers can be up
   * anyway — a fact worth asserting whether or not the retraction holds.
   */
  let modalOpen = $derived(
    registerOpen ||
      settingsOpen ||
      shortcutHelpOpen ||
      pendingIssue !== null ||
      dropAsk !== null ||
      (screen === "project" && detailModalOpen),
  );

  /**
   * The open 列内新規タスク入力's cell as the *current* read of its root has it (doc-7 §4.1). Resolved
   * per read rather than captured on open, so an external `config.yml` change reaches the entry: a
   * column that lost its last candidate turns into its 置かない理由 while the input is standing there,
   * instead of offering a `-s` value the CLI would now refuse (doc-5 §3).
   *
   * `null` while no entry is open, and while the row is not currently loaded — the cell is not on
   * screen then, so there is nothing to draw the entry in.
   */
  let laneCreateEntry = $derived.by(() => {
    const at = laneCreateAt;
    if (at === null) {
      return null;
    }
    const load = loadBySlug[at.slug];
    return load?.state === "loaded"
      ? laneCreate(load.project.createStatusCandidates, at.column)
      : null;
  });
  /** The candidate that will actually be passed as `-s` — what the entry shows (doc-7 §4.1). */
  let laneCreateStatusToPass = $derived(
    laneCreateEntry === null ? "" : laneCreateStatus(laneCreateEntry, laneCreateHeldStatus),
  );
  let laneCreatePlan = $derived(buildLaneTaskCreate(laneCreateTitle, laneCreateStatusToPass));
  /** The task file whose `task edit -s` has not returned — 発行中のカード (doc-7 §4.2). Declared with
   * the 列内新規タスク入力 holders rather than beside the rest of 列間ドロップ, because `gridBusy` below
   * reads it and the holders read that. */
  let dropIssuingPath = $state<string | null>(null);
  /**
   * Whether an issue started from the grid is in flight. One value for all four holders — the two
   * 列内新規タスク入力 ones and the drag — because there is one CLI per project (decision-18) and both
   * entries issue against the same root: holding only the path that started it would leave the other
   * pressable, and the second call would queue behind the first with nothing on screen saying so.
   */
  let gridBusy = $derived(laneCreateBusy || dropIssuingPath !== null);

  /**
   * Why the lane's 作成 is withheld, or `null` (doc-5 §5). Through the same `issueAvailability` the
   * 新規タスク区画 uses, so CLI 縮退 (AC #4) and 発行中 read identically on both screens.
   */
  let laneCreateBlocked = $derived.by(() => {
    const availability = issueAvailability(laneCreatePlan, { readiness, busy: gridBusy });
    return availability.state === "blocked" ? availability.reason : null;
  });
  /**
   * Why every cell's entry is withheld, or `null` — CLI 縮退 (AC #4) or an issue in flight. Separate
   * from `laneCreateBlocked` because it is what the *closed* ＋新規 of every cell states: doc-7 §4.1
   * disables the entry under 縮退, not merely its 発行.
   */
  let laneCreateHeld = $derived(laneCreateHold({ readiness, busy: gridBusy }));

  // --- 列間ドロップ (doc-7 §4.2, decision-34) ------------------------------------------------

  /** The 候補選択の問い's accessible name — what the layer is, in the words doc-7 §4.2 names it with. */
  const DROP_ASK_LABEL = "渡す status を選ぶ";
  /** Why the 問い can no longer be answered: the column stopped declaring anything the drop could pass
   * while the layer stood (doc-9 §3 継続検出). A refusal rather than a silent close — the card was
   * dropped deliberately, so the answer to that gesture is a sentence, not a layer that vanishes. */
  const DROP_ASK_WITHDRAWN_REASON =
    "この列に渡せる status が無くなりました。読み直した内容を確かめてからやり直してください。";

  /** Why no card may be picked up, or `null` — つまめないカード (doc-7 §4.2). */
  let dragHeld = $derived(laneDragHold({ readiness, busy: gridBusy }));
  /**
   * What the 問い's drop resolves to *now*. A column that lost a candidate while the layer stood
   * narrows the select — down to a single remaining one, which `dropAskCandidates` still shows — and
   * one that lost its last turns the layer into a refusal, rather than offering a `-s` the CLI would
   * refuse with exit code 1 (doc-5 §3).
   */
  let dropAskDrop = $derived.by(() => {
    const ask = dropAsk;
    if (ask === null) {
      return null;
    }
    return laneDrop(ask.source, ask.source.slug, ask.column, candidatesOf(ask.source.slug));
  });
  /** The candidates the 問い offers — the rule, and why an `issue` still contributes one, are in
   * `laneDropOptions`, beside the `laneDropStatus` it has to stay one fact with. */
  let dropAskCandidates = $derived(laneDropOptions(dropAskDrop));
  /** The candidate the 問い will pass, resolved against the 受け先's current 候補 (doc-7 §4.2). */
  let dropStatusToPass = $derived(
    dropAskDrop === null ? "" : laneDropStatus(dropAskDrop, dropHeldStatus),
  );
  /** Why the 問い cannot be answered, or `null` — the column stopped taking the card, or 縮退. */
  let dropAskBlocked = $derived.by(() => {
    if (dropAskDrop !== null && dropAskDrop.state === "ignored") {
      return DROP_ASK_WITHDRAWN_REASON;
    }
    return dragHeld;
  });

  // The open task, resolved against the *current* read of its root, so a reload refreshes the
  // panel instead of leaving it on the version the card was clicked from.
  let selectedSnapshot = $derived.by(() => {
    if (selectedRef === null) {
      return null;
    }
    const load = loadBySlug[selectedRef.slug];
    return load?.state === "loaded" ? load.project : null;
  });
  let selectedView = $derived.by(() => {
    const path = selectedRef?.sourcePath;
    if (path === undefined) {
      return null;
    }
    return selectedSnapshot?.tasks.find((view) => view.task.sourcePath === path) ?? null;
  });
  let selectedEntry = $derived(
    entries.find((entry) => entry.slug === selectedRef?.slug) ?? null,
  );
  /**
   * The open task's neighbours in the cell it is drawn in (doc-8 §2.2 前後移動). Derived from the
   * built rows, so the move follows the grid as filtered and ordered on screen; `null` while the grid
   * is not showing the task, which the panel states instead of offering a move.
   */
  let neighbours = $derived(selectedRef === null ? null : laneNeighbours(rows, selectedRef));
  /** The バージョン不整合 record for the open task, so the panel shows what its card shows. */
  let selectedConflict = $derived(
    selectedRef === null
      ? null
      : (conflicts[conflictKeyOf(selectedRef.slug, selectedRef.sourcePath)] ?? null),
  );
  /**
   * The last read that resolved the open selection. Kept because an external move — `task demote`
   * run in another window, an editor saving the file elsewhere — makes the current read stop
   * yielding the task, and doc-8 §6.4 does not let that take the panel's 未保存入力 with it.
   */
  let retained = $state<{ view: TaskView; snapshot: ProjectSnapshot } | null>(null);
  $effect(() => {
    if (selectedRef === null) {
      retained = null;
    } else if (selectedView !== null && selectedSnapshot !== null) {
      retained = { view: selectedView, snapshot: selectedSnapshot };
    }
  });
  /**
   * What the panel draws, and whether it is the current read. Deliberately one value rather than
   * two branches in the markup: moving between branches would destroy and recreate `TaskDetail`,
   * and with it the 編集セッション this exists to keep.
   */
  let shown = $derived.by(() => {
    if (selectedRef === null) {
      return null;
    }
    if (selectedView !== null && selectedSnapshot !== null) {
      return { view: selectedView, snapshot: selectedSnapshot, missing: false };
    }
    // Only while there is input to protect: with nothing unsaved, a task that left the read result
    // is better reported than shown from a stale read.
    return detailDirty && retained?.view.task.sourcePath === selectedRef.sourcePath
      ? { view: retained.view, snapshot: retained.snapshot, missing: true }
      : null;
  });
  /**
   * The inputs the open task's Git 履歴 read is computed from (doc-6 §3/§4/§6): where the search
   * runs, the 関連解決 gate, and the References each Pull Request is looked up at. `null` when there
   * is nothing to read — no selection, a task with no TASK-ID (コミット検索 keys on the id, doc-6 §3),
   * or no ledger entry for the root.
   */
  let historyInputs = $derived.by((): HistoryInputs | null => {
    if (selectedView === null || selectedView.task.id === null || selectedEntry === null) {
      return null;
    }
    return {
      projectRoot: selectedEntry.project_root,
      gitRemotePresent: selectedEntry.git_remote_present,
      references: selectedView.task.references,
    };
  });
  /**
   * Which read the panel is showing. The task alone is not enough: the backend copies these inputs
   * out of the open model, releases its locks and only then runs `git`/`gh` (decision-14), so an
   * answer computed from References or a root the screen has since left is stale. Keying on the
   * inputs makes such a change start a newer read, whose token supersedes the one in flight.
   * Serialized rather than concatenated, so no two input sets can collide into one key.
   */
  let historyKey = $derived(
    selectedView === null || selectedView.task.id === null || historyInputs === null
      ? null
      : historyKeyOf(selectedView.task.project, selectedView.task.id, historyInputs),
  );
  /** The read belonging to the *current* selection; anything else counts as not yet read. */
  let history = $derived.by((): HistoryState => {
    if (selectedView !== null && selectedView.task.id === null) {
      return { state: "noTaskId" };
    }
    return historyRead !== null && historyRead.key === historyKey
      ? historyRead.value
      : { state: "loading" };
  });

  onMount(async () => {
    // Subscribed before the first read so a change landing during startup is not missed.
    // Failing to subscribe is the same kind of failure as a watch that will not start — the
    // screen is one read behind, not unusable — so it must not take the first read down with
    // it, which would leave 読み込み中 on screen over a workspace that reads perfectly well.
    // It is *recorded* for the same reason a failed watch is: with no listener, every root's watch
    // can run and still change nothing here, so the only thing that refreshes any row is the manual
    // re-read — which the screen then has to offer for all of them (`unwatchedRows`).
    try {
      unlisten = await onProjectReloaded((event) => {
        loadBySlug[event.slug] = event.load;
      });
    } catch (error) {
      reloadFeed = "unavailable";
      notice = `変更の通知を購読できません（${unreadableDetail(asCommandError(error))}）`;
    }
    // Probed here and after every settings save, not per edit: it decides whether edit controls are
    // offered at all (doc-5 §5), and a probe per keystroke-worth of UI would spawn a process for a
    // question that changes only when アプリ設定 does — which is the save (`refreshAfterSave`, and
    // doc-5 §4 順序 1 is why a save changes it at all).
    try {
      readiness = await cliProbe();
    } catch (error) {
      readiness = { state: "unavailable", detail: unreadableDetail(asCommandError(error)) };
    }
    // The ledger file's location (doc-3 §2.1). One path resolution, and it cannot change while the
    // app runs, so it is read once here rather than each time the 設定モーダル opens. A failure leaves
    // it `null`, which draws no row — it withholds no control, since knowing the path is not what
    // makes an edit possible.
    try {
      ledgerPath = await ledgerLocation();
    } catch {
      ledgerPath = null;
    }
    // アプリ設定 (decision-13), before the first read: 継続検出の可否 decides whether `load` starts any
    // watch, and 既定の保存区分 is the filter the first cards are drawn through. Awaited rather than
    // applied later, so the screen never briefly runs on settings the user changed away from.
    // A rejection here is not fatal either (AC #6): the boundary already degrades a missing or broken
    // file to the defaults, so this only fires if the IPC call itself failed, and the defaults stand.
    try {
      applySettings(await settingsRead());
    } catch (error) {
      notice = `設定を読み込めませんでした（${unreadableDetail(asCommandError(error))}）。既定値で動きます。`;
    }
    try {
      settingsPath = await settingsLocation();
    } catch {
      settingsPath = null;
    }
    // Not awaited: nothing in startup reads the answer — it is the 設定モーダル's, and the モーダル
    // cannot be up yet — so awaiting it would only put an IPC round trip in front of the first
    // draw. Issued here all the same, so the 区画 has an answer before its first open rather than
    // showing 確認できていません for the moment that open's own probe takes.
    void refreshSettingsDirectory();
    // 外部エディタ経路 (doc-8 §7): one environment read, so it is probed once beside the CLI probe.
    // Probed *after* the settings are read, because doc-8 §7's 起動指定の解決順 starts at アプリ設定 —
    // probing first would report `$EDITOR` as the editor in effect when a setting outranks it.
    // Left `null` on failure — the panel then withholds both launch controls as 確認中, which is what
    // the state actually is; the notice says why it will stay that way.
    try {
      editorReadiness = await editorProbe();
    } catch (error) {
      notice = `外部エディタの確認に失敗しました（${unreadableDetail(asCommandError(error))}）`;
    }
    await load();
  });

  onDestroy(() => {
    unlisten?.();
    // Best-effort: the watches would end with the process anyway, but a dev-server reload
    // leaves the Rust side running, and a second start would otherwise be a no-op on a stale
    // watch.
    for (const slug of order) {
      void projectWatchStop(slug).catch(() => {});
    }
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      applyLedger(await ledgerList());

      const opened = await workspaceOpen();
      const next: Record<string, ProjectLoad> = {};
      for (const outcome of opened) {
        next[outcome.state === "loaded" ? outcome.project.slug : outcome.slug] = outcome;
      }
      loadBySlug = next;
      fatal = null;

      // 継続検出 (doc-9 §3) for every root that opened: the boundary pushes each re-read on
      // `project-reloaded`, which is what keeps the cards' 安定並び in step with the files
      // (doc-7 §7). Idempotent, so a retry can call it again.
      for (const slug of Object.keys(next)) {
        void startWatch(slug);
      }
    } catch (error) {
      fatal = unreadableDetail(asCommandError(error));
    } finally {
      loading = false;
    }
  }

  // --- アプリ設定 (decision-13, TASK-46) ------------------------------------------------------

  /**
   * Adopt a settings value the boundary returned, and apply the parts the shell owns.
   *
   * **既定の保存区分 and 既定の並び順 are applied to live state, each only while the screen is still
   * showing the one the settings put there.** Both are *initial* values (doc-7 §5.2, §5.4), so
   * adopting one over a filter the user has since narrowed, or over an order they have since chosen,
   * would undo their work at the moment they pressed 保存 in another panel. That test is also what
   * keeps a refused 並び順 write from being reverted: the write failed, so the file still holds the
   * old order, and an unrelated save that succeeds later brings it back — the screen no longer
   * matches it, so it is not taken. 継続検出の可否 is read straight off `settings` by `watchEnabled`;
   * the remaining two are stored for the screens that consume them (表示テーマ・カード情報量).
   *
   * 既定の詳細配置 is adopted on the *first* read only. It is the placement the app opens with
   * (doc-8 §2.2 再起動後も保つ); changing it later from the 設定画面 moves the 既定 without moving the
   * panel, which the switch shows as 次回起動時はこちら — the alternative would re-place an open panel
   * from another screen, and doc-8 §6.3 puts a 破棄前確認 in front of every placement change.
   */
  function applySettings(next: LoadedSettings): void {
    const previous = settings?.settings.default_storage_filter ?? DEFAULT_FILTER.storage;
    const untouched = sameStorage(filter.storage, previous);
    const previousOrder = settings?.settings.default_card_order ?? DEFAULT_CARD_ORDER;
    const orderUntouched = cardOrder === previousOrder;
    const first = settings === null;
    settings = next;
    if (first) {
      placement = next.settings.default_detail_placement;
    }
    if (untouched) {
      filter = withStorage(filter, next.settings.default_storage_filter);
    }
    if (orderUntouched) {
      cardOrder = next.settings.default_card_order;
    }
  }

  /**
   * Take another 並び順 and make it the 既定 (doc-7 §5.4). Same shape as `applyPlacement`: the grid
   * reorders first, and a refused write costs the persistence rather than the choice.
   */
  async function applyCardOrder(next: CardOrder): Promise<void> {
    cardOrder = next;
    cardOrderFailure = await writeSettings((current) => ({
      ...current,
      default_card_order: next,
    }));
  }

  /**
   * Take another 詳細配置 and make it the 既定 (doc-8 §2.2 選んだ配置はアプリ設定に保存し、再起動後も
   * 保つ). The screen changes first and the file follows: the placement is what the user asked for, and
   * a write that fails — decision-13 refuses to overwrite a settings file newer than this build — must
   * not undo a change they can see. What the failure costs is the *persistence*, which the switch then
   * states beside the 既定 mark rather than swallowing.
   */
  /**
   * Answer the switch's press (doc-8 §2.2). A press on the placement already in force changes nothing
   * on screen, so it goes straight through: there is nothing to discard, and asking anyway would give
   * the user a 破棄前確認 whose "はい" then keeps the input — a confirmation that lies about what it did.
   * It is still forwarded rather than dropped, because on a placement whose 既定 write was refused the
   * same press is the retry of that write.
   */
  function requestPlacement(next: DetailPlacement): void {
    if (next === placement) {
      void applyPlacement(next);
      return;
    }
    guardDiscard(detailDirty, () => void applyPlacement(next));
  }

  async function applyPlacement(next: DetailPlacement): Promise<void> {
    placement = next;
    // Only this one field is imposed; everything else comes from the settings as they are when the
    // write is issued, so a form save that landed in between is not carried back to its old values.
    placementFailure = await writeSettings((current) => ({
      ...current,
      default_detail_placement: next,
    }));
  }

  function sameStorage(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  /**
   * Write アプリ設定 as a *change to whatever is current*, one write at a time (`settings-write.ts` says
   * why: `settings.toml` is one document, and several controls on screen write it at once). Held here
   * beside the state it reads and adopts.
   */
  const writeSettings = createSettingsWriter({
    peek: () => untrack(() => settings?.settings ?? null),
    save: settingsSave,
    adopt: applySettings,
    describeError: (error) => unreadableDetail(asCommandError(error)),
  });

  /**
   * Persist アプリ設定 (AC #3) and make the change take effect now. Returns the failure text, or `null`
   * on success — the 設定画面 states it, the shell only owns the consequences. The 設定画面 hands in a
   * change rather than a value for the reason above: by the time its 保存 reaches the file, another
   * writer's value may already be in it, and only the form knows which fields are its own to impose.
   *
   * 継続検出 is the one item with a consequence beyond the value: turning it off has to stop the watches
   * that are already running (otherwise the setting would only take effect on the next start, while
   * the screen already says the rows are stale), and turning it on has to start them for every open
   * root.
   */
  async function saveSettings(
    change: (current: AppSettings) => AppSettings,
  ): Promise<string | null> {
    const before = watchEnabled;
    settingsSaving = true;
    let failure: string | null;
    try {
      failure = await writeSettings(change);
      if (failure === null) {
        // 発行が通った事実そのものは ⑤ 通知 に載せない (doc-11 §4). 保存する closes the モーダル only
        // when the write landed (`Settings.svelte`), so the layer coming down is the report, and a 帯
        // would restate it at the top of a screen the user is not looking at yet. Cleared rather than
        // left alone, for the reason `retry` and `move` clear it: a 帯 from before this save is no
        // longer true of the settings now in force, and beside a save that worked it reads as this
        // one having failed.
        notice = null;
        // **Inside the guard, unlike the probes below.** This one *applies* the setting rather than
        // observing what the environment now looks like: 継続検出 being off has to mean the watches are
        // actually stopped. It is also N sequential boundary calls, one per registered root, so
        // leaving it outside would reopen exactly the window detaching the probes closed — the form
        // editable and closable while a promise that will fire `onsaved` is still running.
        if (before !== watchEnabled) {
          await reconcileWatches();
        }
      }
    } finally {
      settingsSaving = false;
    }
    if (failure !== null) {
      return failure;
    }
    // **The probes are deliberately not awaited.** What 保存する waits on is the save — the write and
    // the applying of it, both inside the guard above — and `Settings.svelte` closes the モーダル when
    // this resolves. Anything awaited past this point holds the close open for as long as it takes,
    // with `settingsSaving` already false, so the user can go on editing or close and reopen the
    // form; a late resolution would then fire `onsaved` against a モーダル holding a *different* 下書き,
    // closing it with no 破棄前確認 and losing what was typed (doc-8 §6.3).
    //
    // The window existed before this change (the editor was resolved here too) but was cheap; the
    // 解決結果の表示 put four subprocess launches in it — three bounded at 5 s and the CLI's at 30 s
    // (doc-5 §5). Detaching removes it outright rather than narrowing it, and nothing is lost: every
    // value `refreshAfterSave` writes belongs to the shell, not to this form.
    void refreshAfterSave();
    return null;
  }

  /**
   * Re-read what アプリ設定 decides outside the 設定モーダル, after a save landed.
   *
   * Sequential rather than concurrent: these are subprocess launches, and three at once on a machine
   * that is already slow enough to make this visible would compete for the thing that made it slow.
   * Each failure is its own 帯 (doc-11 §4 ⑤) rather than one joint report — a `gh` that is missing and
   * an editor that is missing are separate facts, and the user acts on them separately.
   */
  async function refreshAfterSave(): Promise<void> {
    const run = (saveRefresh += 1);
    // 起動指定の解決順 starts at アプリ設定 (doc-8 §7), so the probe's answer changes with this save.
    // The panel names the editor it would launch, and a stale name would say `$EDITOR` while the
    // launch used the setting just typed.
    try {
      const probed = await editorProbe();
      if (run !== saveRefresh) {
        return;
      }
      editorReadiness = probed;
    } catch (error) {
      if (run !== saveRefresh) {
        return;
      }
      notice = `外部エディタの確認に失敗しました（${unreadableDetail(asCommandError(error))}）`;
    }
    // 外部コマンド解決の順序 starts at the 外部コマンド指定 (decision-29), so this save changes what the
    // 解決結果の表示 reports — for the same reason the editor is re-probed just above.
    await refreshExternalPrograms();
    // And the 縮退帯 with it. `backlog_cli` is the first step of the same order (doc-5 §4 順序 1), so a
    // save can turn 発行不能 into 発行できる or the other way round — and until this ran, neither took
    // effect before a restart. That is the whole of what TASK-156 is for: the user reaches the
    // setting from inside Atlas precisely because they cannot issue updates, and a fix that needs a
    // restart to be believed is not a means they can reach.
    //
    // Unconditional, not "only when `backlog_cli` changed": `saveSettings` takes a *change function*
    // rather than a value (アプリ設定 is written from outside this form too), so what the file now
    // holds is not knowable here without re-deriving it. One `--version` per save is the cost of not
    // having to know.
    //
    // Separate from the 解決結果の表示's own `backlog` row on purpose (decision-29): that row says
    // whether the program started, this says whether its version meets `MIN_VERSION`. Deriving one
    // from the other would make the band answer a question it does not ask.
    try {
      const probed = await cliProbe();
      if (run !== saveRefresh) {
        return;
      }
      readiness = probed;
    } catch (error) {
      if (run !== saveRefresh) {
        return;
      }
      notice = `Backlog CLI の確認に失敗しました（${unreadableDetail(asCommandError(error))}）`;
    }
  }

  /**
   * Re-read the 解決結果の表示 (decision-29). Set to `null` first so the 区画 says 確認中 rather than
   * holding the previous answer beside a 外部コマンド指定 that has already changed — this runs one
   * `--version` per 外部コマンド, three of them bounded at 5 s each, which is the one panel value slow
   * enough for the gap to be visible.
   *
   * A failure leaves the panel at 確認中 and states the reason on the 帯. There is no "probe failed"
   * row: the probe *is* what turns a failure into a row, so a failed probe has nothing to say per
   * command.
   */
  async function refreshExternalPrograms(): Promise<void> {
    const run = (programsRefresh += 1);
    externalPrograms = null;
    try {
      const probed = await externalProgramsProbe();
      if (run !== programsRefresh) {
        return;
      }
      externalPrograms = probed;
    } catch (error) {
      if (run !== programsRefresh) {
        return;
      }
      notice = `外部コマンドの確認に失敗しました（${unreadableDetail(asCommandError(error))}）`;
    }
  }

  /**
   * Where every way out of the 設定モーダル meets (doc-11 §7): the × `Modal.svelte` draws, the Escape it
   * answers, and the form's own 変更せずに閉じる. A *request* — what it does with it is the two lines
   * below, in that order.
   *
   * All three are refused while a save is unresolved, but only Escape is refused *here*. The panel is
   * what reports the write's outcome, and leaving takes it away while the write already issued goes on
   * to store the draft — under a control whose name says nothing was written. The two pressable exits
   * are held one step earlier by the reason this same flag produces (`closeBlocked` for the ×,
   * `saving` for the form), so each of them can say why it will not answer (doc-11 §5). Escape has no
   * control to hang a reason on, which is why this end of it only declines.
   *
   * Then the 破棄前確認 (doc-8 §6.3), for the exits that do not say what becomes of the 下書き — the ×
   * says only 閉じる and Escape says nothing at all, so the question is where the draft's fate gets
   * stated. Behind the same gate as every other route that discards input, so the モーダル cannot grow
   * a wording or a rule of its own; what is particular to it is only where the question is drawn
   * (doc-11 §7 — this layer covers the 上部帯, so `Modal.svelte` draws it).
   *
   * — except from 変更せずに閉じる, which says it already. That is what `fateStated` carries, and it is
   * a parameter rather than a route of its own so that all three exits still meet here (doc-11 §7 の
   * 出口はすべて 1 つの閉じる要求へ集まる): the 発行中 refusal above, and the layer being dropped below,
   * stay one decision made in one place. What the flag selects is only whether the question has
   * anything left to say — 下書きの行方を語で述べる出口かどうか, which is the axis §7 already draws
   * between the 下部操作行 and the corner.
   *
   * 保存する does not come through here at all: it wrote the 下書き, so 変更せずに閉じる would be false
   * of what happened, and `settingsSaved` is its own way out.
   */
  function closeSettings(fateStated: boolean): void {
    if (settingsSaving) {
      return;
    }
    guardDiscard(settingsDirty && !fateStated, dropSettingsModal);
  }

  /** The 設定 write landed (TASK-74 保存は成功したときだけ閉じる), so nothing is being discarded. */
  function settingsSaved(): void {
    dropSettingsModal();
  }

  /**
   * Take the モーダル away, and with it any 破棄前確認 one of its exits had raised.
   *
   * The question goes because it was about leaving *this* layer, and every route to here leaves it
   * one way or another — answered 破棄して閉じる (already cleared), 保存する that landed, or a draft
   * reverted to the file's values while the question stood, which lets the next press through the
   * gate unanswered. Left behind, an unanswered one would come back as the 上部帯 ① over the screen
   * the layer had been covering: a question about input that is no longer anywhere, offering a
   * continuation that has already happened. Dropping it discards nothing — the request lapses.
   */
  function dropSettingsModal(): void {
    pendingDiscard = null;
    settingsOpen = false;
  }

  /** The same for the 登録モーダル (`dropSettingsModal` says why the question goes with the layer). */
  function dropRegisterModal(): void {
    pendingDiscard = null;
    registerOpen = false;
  }

  /**
   * The same for the 登録モーダル, which has two exits rather than three: the × and Escape (doc-11 §7 —
   * 登録 writes without leaving the layer, so there is no 下部操作行 to state a fate in). Both discard
   * whatever has been typed, so both come through the one gate.
   */
  function closeRegister(): void {
    if (registerSubmitting) {
      return;
    }
    guardDiscard(registerDirty, dropRegisterModal);
  }

  /**
   * Ask the boundary whether the アプリ設定ディレクトリ is there (doc-3 §2.1). Issued at startup and
   * again each time the 設定モーダル opens, which is where the one control this withholds lives: a 登録
   * in between creates the folder, and the control must not still be reading the answer from before
   * it. A rejection leaves the state `null` rather than `false` — a probe that did not answer has not
   * established that the folder is missing.
   */
  async function refreshSettingsDirectory(): Promise<void> {
    const issued = (settingsDirectoryProbe += 1);
    try {
      const present = await settingsDirectoryPresent();
      if (issued === settingsDirectoryProbe) {
        settingsDirectory = present;
      }
    } catch {
      if (issued === settingsDirectoryProbe) {
        settingsDirectory = null;
      }
    }
  }

  /**
   * 場所を開く (TASK-75): hand the アプリ設定ディレクトリ to the OS's file manager. Returns the failure's
   * text, or `null` once the launcher took it — the 設定画面 states it, as it does for 保存, because this
   * モーダル covers the 上部帯 and a 帯 would not be read until it closed.
   *
   * Nothing is read or written here and no path is sent: the boundary resolves the directory itself.
   */
  async function openSettingsLocation(): Promise<string | null> {
    try {
      await settingsLocationOpen();
      return null;
    } catch (error) {
      return openLocationFailure(asCommandError(error));
    }
  }

  /** Bring every registered root's watch in line with 継続検出の可否 (doc-9 §3.1). */
  async function reconcileWatches(): Promise<void> {
    for (const slug of order) {
      if (watchEnabled) {
        await startWatch(slug);
      } else {
        await projectWatchStop(slug).catch(() => {});
      }
    }
    // Nothing is watched while the setting is off, so per-root failures recorded earlier no longer
    // describe anything: `unwatchedRows` already covers every row from the setting alone.
    if (!watchEnabled) {
      unwatched = [];
    }
  }

  /**
   * Start 継続検出 for one root, reporting whether it is running (doc-9 §3). A failed watch is not a
   * failed read: the row's cards are already on screen and only stay as fresh as the last read, so it
   * is reported, not escalated — but it is *recorded*, because from then on the only thing that
   * refreshes that root is an explicit re-read, and the screen has to offer one (`unwatched` below).
   */
  async function startWatch(slug: string): Promise<boolean> {
    // 継続検出を切っている間は張らない (doc-9 §3.1). Reported as "not watching" without a notice: the
    // user chose it, and `unwatchedRows` already carries every row while the setting is off, so the
    // 帯 states the reason once instead of once per root.
    if (!watchEnabled) {
      return false;
    }
    try {
      await projectWatchStart(slug);
      unwatched = unwatched.filter((candidate) => candidate !== slug);
      return true;
    } catch (error) {
      notice = `${slug}: 変更監視を開始できません（${unreadableDetail(asCommandError(error))}）`;
      if (!unwatched.includes(slug)) {
        unwatched = [...unwatched, slug];
      }
      return false;
    }
  }

  /** Retry one ルート読取不能 row (doc-7 §6). Other rows are untouched either way. */
  async function retry(slug: string): Promise<void> {
    try {
      const project = await projectOpen(slug);
      loadBySlug[slug] = { state: "loaded", project };
      notice = null;
      // Awaited, so a root re-read whose watch still refuses to start stays listed as 監視なし
      // instead of looking recovered (the notice `startWatch` sets is the report).
      await startWatch(slug);
    } catch (error) {
      const commandError = asCommandError(error);
      loadBySlug[slug] = { state: "unreadable", slug, error: commandError };
    }
  }

  /**
   * Re-read one root on demand — the manual counterpart of 継続検出 (doc-9 §3 の再読込契機). Needed
   * because a root whose watch will not start has nothing else that refreshes it: re-selecting a task
   * only resolves it out of the snapshot already in hand, so without this the screen could tell the
   * user to "look again" at a model that never changes. Shares `retry`'s path: `projectOpen` *is* the
   * re-read (doc-9 §3 funnels every trigger through one reload), and it retries the watch as well.
   */
  async function rereadRow(slug: string): Promise<void> {
    await retry(slug);
  }

  /**
   * Re-read every row 継続検出 is not covering — the 上部帯 ④'s own operation (doc-11 §4: 帯が持つ操作
   * は縮約しても帯に残し、操作へ到達するために別の場所を開かせない). Without it the band could only
   * name the state and point at a row's mark, which is unreachable while that row is scrolled out of
   * view. Sequential rather than parallel: with 継続検出 off every registered root is on this list, and
   * they read the same disks.
   */
  async function rereadUnwatched(): Promise<void> {
    for (const slug of unwatchedRows) {
      await rereadRow(slug);
    }
  }

  /**
   * Move a row past its nearest *visible* neighbour. Using the neighbour's ledger index rather
   * than `index ± 1` is what makes the button do what it looks like it does when rows in
   * between are hidden — those rows keep their ledger position, and the moved row lands on the
   * other side of the row the user can actually see.
   */
  async function move(slug: string, direction: -1 | 1): Promise<void> {
    const visible = order.filter((candidate) => !hidden.includes(candidate));
    const neighbour = visible[visible.indexOf(slug) + direction];
    if (neighbour === undefined) {
      return;
    }
    // A reorder writes the ledger like any other operation, so it queues behind one in flight
    // (`ledgerBusy`) rather than racing it. Reported rather than dropped: the row visibly did not
    // move, and the neighbour it would have passed may be different by the time the other finishes.
    if (ledgerBusy) {
      notice = "ほかの登録の更新が完了するまで待ってください。";
      return;
    }
    ledgerBusy = true;
    try {
      applyLedger(await ledgerReorder(slug, order.indexOf(neighbour)));
      notice = null;
    } catch (error) {
      notice = `行の並べ替えに失敗しました: ${unreadableDetail(asCommandError(error))}`;
    } finally {
      ledgerBusy = false;
    }
  }

  // --- 台帳操作 (doc-3 §4, TASK-39) ----------------------------------------------------------
  //
  // The shell issues these rather than the 台帳管理画面 itself, for the same reason it owns `apply`:
  // the rows, the open sessions and the watches are here, and a ledger change moves all three. The
  // screen gets back only whether the operation was done or refused, and with which reason.

  /**
   * True while a ledger command is in flight. Ledger operations are issued one at a time on purpose:
   * each command returns the ledger *it* wrote, and two in flight can answer out of order — the
   * boundary releases its lifecycle lock before joining a detached watch thread, so a removal can
   * reply after a registration that wrote later. `applyLedger` would then adopt the earlier
   * snapshot and drop an entry the ledger actually holds, until the next read put it back.
   *
   * Serializing at the point of issue is what keeps response order equal to write order, and it has
   * to live here rather than in the 台帳管理画面: the swimlane's row reorder writes the ledger too, so
   * a per-screen guard would leave that caller racing the others.
   */
  let ledgerBusy = $state(false);

  /** The answer to a ledger action asked for while another was still in flight. */
  const LEDGER_BUSY_RESULT: LedgerActionResult = {
    state: "refused",
    report: { message: "ほかの登録の更新が完了するまで待ってください。", field: null },
  };

  /** Adopt a ledger the boundary just returned: the row order and the read-only state come with it. */
  function applyLedger(response: LedgerResponse): void {
    entries = response.ledger.project;
    ledgerReadOnly = response.readOnly;
  }

  /**
   * Register a project (doc-3 §4.1) and read it into its row. `retry` is the read: it is the same
   * "open this one root and start its watch" path a failed row uses, and a newly registered root is
   * in exactly that position — nothing has been read for it yet.
   */
  async function registerProject(request: RegisterRequest): Promise<LedgerActionResult> {
    if (ledgerBusy) {
      return LEDGER_BUSY_RESULT;
    }
    ledgerBusy = true;
    // Raised here rather than in the form: the モーダル's two exits have to be turned away for as long
    // as this is unresolved, and neither of them is the form's control (`closeRegister`).
    registerSubmitting = true;
    try {
      const response = await ledgerRegister(request);
      applyLedger(response.ledger);
      await retry(response.entry.slug);
      return { state: "done", slug: response.entry.slug };
    } catch (error) {
      return { state: "refused", report: refusalReport(asCommandError(error)) };
    } finally {
      ledgerBusy = false;
      registerSubmitting = false;
    }
  }

  /**
   * Remove a project from the ledger (doc-3 §4.2) and let go of its row. The boundary has already
   * closed its session and stopped its watch; what is left here is the screen state keyed by that
   * slug, which would otherwise keep a row — and a バージョン不整合 mark — for a project Atlas no longer reads.
   */
  async function removeProject(slug: string): Promise<LedgerActionResult> {
    if (ledgerBusy) {
      return LEDGER_BUSY_RESULT;
    }
    ledgerBusy = true;
    try {
      applyLedger(await ledgerRemove(slug));
      const { [slug]: _dropped, ...remaining } = loadBySlug;
      loadBySlug = remaining;
      hidden = hidden.filter((candidate) => candidate !== slug);
      foldedRows = foldedRows.filter((candidate) => candidate !== slug);
      unwatched = unwatched.filter((candidate) => candidate !== slug);
      conflicts = Object.fromEntries(
        // The key is `JSON.stringify([slug, path])` (`mark.ts`), so the slug is its first element.
        Object.entries(conflicts).filter(([key]) => JSON.parse(key)[0] !== slug),
      );
      if (selectedRef?.slug === slug) {
        selectedRef = null;
        detailDirty = false;
      }
      // The 列内新規タスク入力 goes with the row it was in. Dropped rather than kept: the entry is held
      // in the shell so that unmounting the grid does not lose it (see `laneCreateAt`), and a title
      // left standing for an unregistered slug would reappear in a cell if that slug were registered
      // again — input the user typed for a different project.
      if (laneCreateAt?.slug === slug) {
        closeLaneCreate();
      }
      // The プロジェクト詳細画面 of a project that is no longer registered has nothing left to name,
      // so it is closed here rather than by the screen itself — and closed *without* the 破棄前確認,
      // because asking "keep your input?" about a registration that has just been removed offers a
      // choice that no longer exists.
      if (detailSlug === slug) {
        detailSlug = null;
        projectDirty = false;
        screen = "swimlane";
      }
      return { state: "done", slug };
    } catch (error) {
      return { state: "refused", report: refusalReport(asCommandError(error)) };
    } finally {
      ledgerBusy = false;
    }
  }

  /**
   * Update one ledger entry (doc-3 §4.3). Every change but a reorder is followed by a re-read of that
   * root, because both kinds of change invalidate what the row is showing: a move makes the model a
   * model of the old files (the boundary closes the session for that reason), and a 別名表 edit changes
   * the interpretation the snapshot was built with — the column a task sits in (doc-7 §4). A reorder
   * touches neither, so it only reorders the rows.
   */
  /**
   * The 概要区画's remote 現在値 (doc-10 §4.1). Resolves to a `GitRemoteRead` even when the command
   * rejects: what the line says differs between「remote が無い」and「読めなかった」(decision-6), so a
   * rejection becomes the second rather than being folded into an absence nobody observed.
   */
  async function readGitRemote(slug: string): Promise<GitRemoteRead> {
    try {
      return await gitRemoteRead(slug);
    } catch (error) {
      return { state: "unreadable", detail: commandErrorDetail(asCommandError(error)) };
    }
  }

  async function updateProject(request: UpdateRequest): Promise<LedgerActionResult> {
    if (ledgerBusy) {
      return LEDGER_BUSY_RESULT;
    }
    ledgerBusy = true;
    try {
      applyLedger(await ledgerUpdate(request));
      const reorderOnly = Object.keys(request).every(
        (key) => key === "slug" || key === "new_index",
      );
      if (!reorderOnly) {
        await retry(request.slug);
      }
      return { state: "done", slug: request.slug };
    } catch (error) {
      return { state: "refused", report: refusalReport(asCommandError(error)) };
    } finally {
      ledgerBusy = false;
    }
  }

  /** True when leaving `screen` would discard 未保存入力 held by whatever it has mounted. */
  function dirtyOn(current: Screen): boolean {
    return current === "swimlane" ? detailDirty : projectDirty;
  }

  /**
   * Do something that would lose 未保存入力 — now if there is none, after the 破棄前確認 if there is
   * (doc-8 §6.3). One gate for every such route, so none of them can grow its own wording or forget
   * to ask; the panel's キャンセル reaches it through `onconfirmDiscard`, being the one route the
   * shell cannot carry out itself.
   *
   * The モーダル's exits come through here too (TASK-86, doc-11 §7). They are not among doc-8 §6.3's
   * five and the input they lose is not the 編集セッション's, but the question and the two answers are
   * the same ones, and a second gate is how the same loss would come to be described two ways.
   */
  function guardDiscard(dirty: boolean, proceed: () => void): void {
    if (dirty) {
      pendingDiscard = proceed;
    } else {
      proceed();
    }
  }

  /**
   * The file a 実行前確認 may be asked about (doc-11 §12): the one the panel is showing a **current** read
   * of. `null` while there is no task on screen, and also while the panel is showing a `retained` read
   * (`shown.missing`) — the file has left the read result there, and every control that would ask is
   * withheld for that reason (`transitionOffers`'s `fileMissing`, `editorOffers`'s). A question left
   * standing over that state would offer, in the layer, the act the screen underneath is refusing.
   *
   * One value for both the asking and the 失効 below, so the two cannot disagree about what the question
   * is about.
   */
  let issueSubject = $derived(
    shown !== null && !shown.missing ? shown.view.task.sourcePath : null,
  );

  /**
   * Raise the 実行前確認 the panel asked for (doc-11 §12), filed against the task it is showing.
   *
   * The path is read here rather than passed in: what the question is about is whatever the panel has
   * on screen at the moment of the press, and taking the caller's word for it would let a stale path
   * decide 失効.
   */
  function askIssue(confirmation: IssueConfirmation, proceed: () => void): void {
    const path = issueSubject;
    if (path === null) {
      return;
    }
    // 被せ層 は 1 枚だけ (see `raiseModal`), and an unanswered 破棄前確認 from behind lapses under the layer
    // about to cover it — the reason `detailOverlay` and `openEntry` do the same: which layer draws a
    // question is decided by which one is frontmost (doc-11 §7). Dropping it discards nothing.
    menuOpen = false;
    filterPopoverOpen = false;
    pendingDiscard = null;
    pendingIssue = { path, confirmation, proceed };
  }

  /** 進む: close the question and take the act it was about (doc-11 §12). */
  function issueConfirmed(): void {
    const pending = pendingIssue;
    pendingIssue = null;
    pending?.proceed();
  }

  /**
   * やめる, and the layer's own exits (`×`・Escape) with it: drop the request. Nothing is lost — the act
   * never started, which is what makes this question different from the 破棄前確認 (doc-11 §12).
   */
  function cancelIssue(): void {
    pendingIssue = null;
  }

  /**
   * 失効 (doc-11 §12 の ③): the question was about one task's current read, so the panel moving off it
   * takes the question — whether by another selection or by that file leaving the read result
   * (`issueSubject`).
   *
   * Cleared rather than only hidden while the two disagree — held, it would come back the next time that
   * task is selected, and the user would meet a question they never asked twice over.
   */
  $effect(() => {
    if (pendingIssue !== null && pendingIssue.path !== issueSubject) {
      pendingIssue = null;
    }
  });

  /** Take the exit the user just confirmed, discarding the panel's 未保存入力 (doc-8 §6.3). */
  function discardConfirmed(): void {
    const proceed = pendingDiscard;
    pendingDiscard = null;
    proceed?.();
  }

  /**
   * 編集に戻る: drop the request and leave the input where it is. Named rather than written inline at
   * each place the answer is offered — the 帯 and the モーダル draw the same two answers, and only one
   * of them is a continuation the caller supplied.
   */
  function keepEditing(): void {
    pendingDiscard = null;
  }

  /**
   * Go to another screen. Asks first while the one being left holds 未保存入力 (doc-8 §6.3): its
   * panel is unmounted on the way, so the input is gone as surely as if another task had been opened.
   */
  function goToScreen(next: Screen, slug: string | null = null): void {
    if (next === screen && slug === detailSlug) {
      return;
    }
    guardDiscard(dirtyOn(screen), () => {
      // The panel holding the input is unmounted from here, so its `ondirty` will not run again to
      // retract the flag. The task selection itself is kept: coming back reopens the task, with a
      // fresh 編集セッション.
      if (screen === "swimlane") {
        detailDirty = false;
      } else {
        projectDirty = false;
      }
      detailSlug = slug;
      screen = next;
    });
  }

  /** Open プロジェクト詳細画面 (doc-10). The entry point is the レーンヘッダ行 (doc-7 §2.3). */
  function openProject(slug: string): void {
    goToScreen("project", slug);
  }

  /**
   * 出口 (doc-10 §2). `lane` is 「このプロジェクトのレーンへ」: the same return, plus a landing on the row
   * asked for.
   *
   * It used to un-hide that row first, on the grounds that 行非表示 would otherwise answer the request
   * with a row that is not there. That was written when 非表示 could not be set from this screen — the
   * detail is entered from a レーンヘッダ行, so a row had to be visible to get here, and the menu of the
   * day listed only hidden rows. TASK-131 gave the menu every project, and with it a way to hide the
   * very project whose detail is open; un-hiding on the way out would then silently undo what the user
   * pressed seconds ago, and doc-7 §2.1・§5.1 now put that state in one control. So the exit asks for a
   * landing only when there is a row to land on: asking for one on a hidden row would leave `focusRow`
   * set with nothing to clear it (`Swimlane.svelte` returns before `onfocused`), and the landing would
   * then fire late, on whichever un-hide came next. **The exit is not withheld while the row is
   * hidden** — its main job is leaving this screen, which it still does, and doc-10 §2 records why
   * (a whole screen changing is not a return that looks like nothing happened, which is the case
   * doc-7 §2.3's 一時的な強調 is for).
   */
  function leaveProject(lane: boolean): void {
    const slug = detailSlug;
    guardDiscard(projectDirty, () => {
      projectDirty = false;
      detailSlug = null;
      screen = "swimlane";
      if (lane && slug !== null && !hidden.includes(slug)) {
        focusRow = slug;
      }
    });
  }

  /** Close the detail panel (doc-8 §6.3 の 5 経路のひとつ). */
  function closeDetail(): void {
    guardDiscard(detailDirty, () => {
      // Cleared with the selection: the panel is unmounted from here on, so its own `ondirty` will
      // not run again to retract a flag left standing.
      selectedRef = null;
      detailDirty = false;
    });
  }

  /**
   * Record or clear one task's バージョン不整合 (doc-9). Reported by the panel rather than derived here:
   * 更新前競合 is visible to `apply` below, but the 事後通知 is not — it is the comparison between
   * what was submitted and what the re-read says, and only the panel holds the former.
   *
   * The task is named by the caller, never read back off `selectedRef`. An update is awaited, and
   * nothing stops the selection from moving in the meantime — a transition needs no 未保存入力, so
   * the cards stay clickable — which would file one task's divergence against another's card.
   */
  /**
   * One task as the current read of its root has it, or `null` when that read does not yield the
   * file. Keyed by path for the same reason the selection is (doc-4 §5: a 解析不能 task has no id).
   */
  function viewAt(target: ConflictTarget): TaskView | null {
    const load = loadBySlug[target.slug];
    if (load?.state !== "loaded") {
      return null;
    }
    return load.project.tasks.find((view) => view.task.sourcePath === target.sourcePath) ?? null;
  }

  /** One root's tasks as the current read has them, before any filtering. Empty when it is unreadable. */
  function tasksOf(slug: string): TaskView[] {
    const load = loadBySlug[slug];
    return load?.state === "loaded" ? load.project.tasks : [];
  }

  function noteConflict(conflict: VersionConflict | null, target: ConflictTarget): void {
    const key = conflictKeyOf(target.slug, target.sourcePath);
    if (conflict === null) {
      const { [key]: _removed, ...rest } = conflicts;
      conflicts = rest;
    } else {
      conflicts[key] = conflict;
    }
  }

  /**
   * Open one task's detail panel (doc-7 §3 カードを選ぶとタスク詳細画面を開く). A pending 編集
   * セッション is not discarded on the way: doc-8 §6.3 asks before 未保存入力 is thrown away, and
   * leaving the task is the other way to lose it.
   */
  function open(view: TaskView): void {
    const next = { slug: view.task.project, sourcePath: view.task.sourcePath };
    // 前後移動 (doc-8 §2.2) arrives here too: it is a selection change like any other, so it passes
    // the same guard rather than a second one of its own.
    const leaving =
      detailDirty && selectedRef !== null && selectedRef.sourcePath !== next.sourcePath;
    guardDiscard(leaving, () => (selectedRef = next));
  }

  /**
   * Issue one screen action for the open task (doc-5 §3, doc-9 §4). The shell owns this rather than
   * the panel because the result carries the re-read root: the grid and the panel draw from one
   * snapshot, and letting the panel keep a second copy is how the two would drift apart.
   */
  async function apply(action: UpdateOperation[]): Promise<ApplyOutcome> {
    // The whole reference, captured before the await: everything below is about the task the action
    // was issued for, and the selection can move while the CLI runs.
    const target = selectedRef;
    if (target === null) {
      return { state: "failed", detail: "対象プロジェクトを特定できません" };
    }
    const slug = target.slug;
    try {
      const result = await updateApply(slug, action);
      if (result.state === "conflict") {
        // 更新前競合 (doc-9 §5): an ordinary re-read, not 縮退 — the row and the panel both move to
        // the current file, while the panel keeps the 未保存入力 it was holding.
        loadBySlug[slug] = { state: "loaded", project: result.project };
        return { state: "conflict", diverged: result.diverged, unread: result.unread };
      }
      // Present exactly when disk moved (doc-5 §6). A failure that changed nothing leaves the
      // display as it was, which is what lets the panel offer a retry of the same input.
      if (result.project !== null) {
        loadBySlug[slug] = { state: "loaded", project: result.project };
      }
      if (result.outcome.state !== "succeeded") {
        return { state: "failed", detail: failureDetail(result.outcome) };
      }
      // A 状態遷移 moves the file and re-numbers the id (doc-5 §3.3), so the open selection — held
      // as (slug, path) — no longer names anything. Closing it here rather than letting the panel
      // fall through to "現在の読み取り結果にありません" keeps a deliberate move from reading like
      // a task that went missing.
      if (action.some((operation) => TRANSITIONS.includes(operation.op))) {
        // The バージョン不整合 record is keyed by the file path, and the transition moved the file — the old
        // key would mark a card that no longer exists while the moved task carried none.
        noteConflict(null, target);
        // Closed only if it is still the transitioned task on screen: the panel may have been
        // pointed at another task while the CLI ran, and that one did not move.
        if (selectedRef?.sourcePath === target.sourcePath) {
          selectedRef = null;
          detailDirty = false;
        }
        notice = "状態遷移を適用しました。保存区分と ID が変わるため、詳細を閉じました。";
      }
      // The operated task as of the re-read, resolved here because the shell is what holds it. The
      // panel needs it to make doc-9 §5's 事後通知 comparison against the right task even when the
      // selection moved during the await — reading it off the panel's own `view` would compare the
      // submitted values against whatever is open instead.
      return { state: "applied", view: viewAt(target) };
    } catch (error) {
      const commandError = asCommandError(error);
      // 照合不能 (doc-9 §4.2) is separated here rather than in the panel, so the panel never has to
      // recognise it from its own message text. doc-9 §5 requires it not to read as a conflict.
      return commandError.kind === "uncheckableTarget"
        ? { state: "uncheckable", detail: commandErrorDetail(commandError) }
        : { state: "failed", detail: commandErrorDetail(commandError) };
    }
  }

  /**
   * Issue one screen action against a *named* project (doc-5 §3, doc-9 §4) — the 文書・マイルストーン
   * 管理画面's counterpart of `apply`, which is bound to the open task instead. The shell owns it for
   * the same reason: the result carries the re-read root, and letting a screen keep a second copy of
   * the snapshot is how the two would drift apart.
   *
   * The three non-success states are kept apart on the way out, because doc-9 §5 requires the screen
   * to state them differently: 更新前競合 (checked, and it diverged — no CLI ran), 照合不能 (no
   * defined way to check — no CLI ran either), and an ordinary CLI failure.
   */
  async function issue(slug: string, action: UpdateOperation[]): Promise<IssueOutcome> {
    try {
      const result = await updateApply(slug, action);
      if (result.state === "conflict") {
        loadBySlug[slug] = { state: "loaded", project: result.project };
        return { state: "conflict", diverged: result.diverged, unread: result.unread };
      }
      // Present exactly when disk moved (doc-5 §6): a failure that changed nothing leaves the
      // display as it was, which is what lets the screen offer a retry of the same input.
      if (result.project !== null) {
        loadBySlug[slug] = { state: "loaded", project: result.project };
      }
      return result.outcome.state === "succeeded"
        ? { state: "applied" }
        : { state: "failed", detail: failureDetail(result.outcome) };
    } catch (error) {
      const commandError = asCommandError(error);
      return commandError.kind === "uncheckableTarget"
        ? { state: "uncheckable", detail: commandErrorDetail(commandError) }
        : { state: "failed", detail: commandErrorDetail(commandError) };
    }
  }

  // --- 列内新規タスク入力 (doc-7 §4.1) --------------------------------------------------------

  /** Open the entry on one cell, replacing whichever cell held it. Its input starts empty, and its
   * status at the column's first declared candidate (resolved by `laneCreateStatusToPass`). */
  function openLaneCreate(slug: string, column: StatusColumn): void {
    if (laneCreateAt?.slug === slug && laneCreateAt.column === column) {
      return;
    }
    laneCreateAt = { slug, column };
    laneCreateTitle = "";
    laneCreateHeldStatus = "";
  }

  function closeLaneCreate(): void {
    laneCreateAt = null;
    laneCreateTitle = "";
    laneCreateHeldStatus = "";
  }

  /**
   * 列内新規タスク入力の発行 (doc-7 §4.1): one `task create` into the clicked cell's column, through the
   * same `issue` every other 更新操作 goes through — so the root is re-read and the new card appears in
   * that column without this path having its own reload.
   *
   * The entry stays open on success with only the title cleared: creating several tasks into one
   * column is the reason the entry is *in* the cell, and the column's status has not changed. A
   * failure keeps the title too, so it can be corrected and reissued (the 新規タスク区画 does the same).
   */
  async function submitLaneCreate(): Promise<void> {
    const at = laneCreateAt;
    const plan = laneCreatePlan;
    if (at === null || plan.state !== "ready" || laneCreateBlocked !== null) {
      return;
    }
    const column = CANONICAL_COLUMN_LABEL[at.column];
    // The row's task files as of now, so the one the create adds can be told apart afterwards.
    const before = new Set(tasksOf(at.slug).map((view) => view.task.sourcePath));
    laneCreateBusy = true;
    try {
      const outcome = await issue(at.slug, plan.action);
      const created =
        outcome.state === "applied"
          ? (tasksOf(at.slug).find((view) => !before.has(view.task.sourcePath)) ?? null)
          : null;
      // 絞り込みはカードの取捨だけを行う (doc-7 §5.2), so a filter in force can take the new card away
      // the moment it is read — the one thing about this create the screen does not state, since an
      // unchanged cell is otherwise indistinguishable from a create that silently did nothing. The
      // filter is reversible from the フィルタ帯, so the card is one 解除 away rather than lost.
      const outOfFilter =
        created !== null && !matchesFilter(created, filter, inconsistentView)
          ? "（今の絞り込みでは表示されないため、カードは出ていません。フィルタ帯で条件を外すと出ます）"
          : null;
      // 発行が通った事実そのものは ⑤ 通知 に載せない (doc-11 §4): the card lands in the cell the ＋新規
      // that made it sits in, so a 帯 would repeat what the screen already shows. What stands is the
      // 帰結 above, and every outcome that is not 通った.
      notice =
        outcome.state === "applied" && outOfFilter === null
          ? null
          : outcomeMessage(outcome, `${at.slug} の ${column} 列にタスクを作成しました。`) +
            (outOfFilter ?? "");
      if (outcome.state === "applied") {
        laneCreateTitle = "";
      }
    } finally {
      laneCreateBusy = false;
    }
  }

  // --- 列間ドロップ の発行 (doc-7 §4.2) --------------------------------------------------------

  /** One row's 列の作成時 status 候補 as the current read has them; empty for a row that is not loaded. */
  function candidatesOf(slug: string): ColumnCreateStatuses[] {
    const load = loadBySlug[slug];
    return load?.state === "loaded" ? load.project.createStatusCandidates : [];
  }

  /**
   * Pick a card up (doc-7 §4.2). A task whose TASK-ID could not be read is not picked up at all: the
   * id is what `task edit` addresses, so a drag that started without one could only end in a refusal
   * after the drop — and doc-7 §4.2 refuses by not taking the card, before the gesture.
   */
  function startCardDrag(view: TaskView): void {
    const taskId = view.task.id;
    if (dragHeld !== null || taskId === null) {
      return;
    }
    dragSource = {
      slug: view.task.project,
      taskId,
      sourcePath: view.task.sourcePath,
      column: view.interpretation.status?.column ?? null,
    };
  }

  function endCardDrag(): void {
    dragSource = null;
  }

  /**
   * A card was released over one cell (doc-7 §4.2). The 受け先 test runs again here rather than
   * trusting the cell that raised the event: `dragSource` is cleared first, so anything that reaches
   * the issue below has been checked against the row and the 候補 as they are at the drop.
   */
  function dropCard(slug: string, column: StatusColumn): void {
    const source = dragSource;
    dragSource = null;
    const drop = laneDrop(source, slug, column, candidatesOf(slug));
    if (source === null || drop.state === "ignored") {
      return;
    }
    if (drop.state === "ask") {
      dropAsk = { source, column };
      dropHeldStatus = "";
      return;
    }
    void issueCardDrop(source, column, drop.status);
  }

  function cancelDropAsk(): void {
    dropAsk = null;
    dropHeldStatus = "";
  }

  /**
   * Answer the 問い (doc-7 §4.2). Everything is read *before* the layer is torn down, and the same
   * re-check `dropCard` applies is applied again: the layer can stand across a 継続検出 re-read, so
   * what was a 受け先 when the card landed need not still be one when the answer comes.
   */
  function confirmDropAsk(): void {
    const ask = dropAsk;
    const drop = dropAskDrop;
    const status = dropStatusToPass;
    const blocked = dropAskBlocked;
    if (ask === null || drop === null || drop.state === "ignored" || status === "") {
      return;
    }
    if (blocked !== null) {
      return;
    }
    dropAsk = null;
    dropHeldStatus = "";
    void issueCardDrop(ask.source, ask.column, status);
  }

  /**
   * Issue the drop's `task edit -s` (doc-5 §3), through the same `issue` every other 更新操作 goes
   * through — so the root is re-read and the card appears in its new column without this path having
   * a reload, a card position, or a conflict check of its own (doc-7 §4.2).
   *
   * 通った事実そのものは ⑤ 通知 に載せない (doc-11 §4): the card is in the cell it was dropped on, so a
   * 帯 would repeat the screen. What is stated is every outcome that is not 通った, and the one
   * 帰結 the screen cannot show — a card the filter takes away the moment the new status is read.
   */
  async function issueCardDrop(
    source: DragSource,
    column: StatusColumn,
    status: string,
  ): Promise<void> {
    dropIssuingPath = source.sourcePath;
    try {
      const outcome = await issue(source.slug, buildLaneStatusEdit(source.taskId, status));
      const moved = tasksOf(source.slug).find((view) => view.task.sourcePath === source.sourcePath);
      const outOfFilter =
        outcome.state === "applied" &&
        moved !== undefined &&
        !matchesFilter(moved, filter, inconsistentView)
          ? "（今の絞り込みでは表示されないため、カードは出ていません。フィルタ帯で条件を外すと出ます）"
          : null;
      notice =
        outcome.state === "applied" && outOfFilter === null
          ? null
          : outcomeMessage(
              outcome,
              `${source.taskId} の status を ${status} にしました。`,
            ) + (outOfFilter ?? "");
    } finally {
      dropIssuingPath = null;
    }
  }

  /**
   * Open the selected task's management file in the user's editor (doc-8 §7). The shell owns this for
   * the same reason as `apply`: the boundary resolves the file from the (slug, path) the selection is
   * held as, and nothing else knows both.
   *
   * The watch is (re)started before the launch, when 継続検出 is on. It is the whole of the 書き戻し
   * path — the editor's save reaches Atlas only because doc-9's 継続検出 picks it up — so a root whose
   * watch failed to start earlier would take the edit and show nothing. The underlying command is
   * idempotent, so this costs nothing when the watch is already running, and `startWatch` declines by
   * itself while the setting is off.
   *
   * Nothing is *reported* here. doc-8 §7 requires the user to be told 開く前に, not after the editor is
   * already up, so the panel states it beside the launch controls (`watchStopped` below) and offers
   * the re-read there — a notice from this point would arrive too late to be the warning doc-8 asks
   * for, and would repeat what the panel already says.
   */
  async function openExternally(method: LaunchMethod): Promise<OpenOutcome> {
    const ref = selectedRef;
    if (ref === null) {
      return { state: "failed", detail: "対象タスクを特定できません" };
    }
    // Read before the await: whether the panel had already told the user that nothing will bring the
    // save back. It is the difference between a warning they have read and one that appears with the
    // editor (doc-8 §7 エディタを開いてから初めて知る形にしない).
    const warned = selectedWatchStopped;
    const watching = await startWatch(ref.slug);
    if (!watching && !warned) {
      // The press is what discovered the stop — the watch had not failed yet when the panel was drawn,
      // or the startup watch had not answered. `startWatch` has now put the root in `unwatched`, so the
      // panel draws the notice and the re-read; the launch waits for the next press.
      return { state: "deferred", detail: WATCH_STOPPED_BEFORE_LAUNCH };
    }
    try {
      return { state: "launched", launch: await taskFileOpen(ref.slug, ref.sourcePath, method) };
    } catch (error) {
      return { state: "failed", detail: launchFailureDetail(asCommandError(error)) };
    }
  }

  /**
   * Open one 本文リンク (doc-8 §9.3 既定ブラウザ起動).
   *
   * **The failure goes to ⑤ 通知** (doc-11 §4). A 本文リンク is pressed inside prose, so it has no
   * 控えの隣 to put a result line in — and putting one inside the 本文ブロック would mix the file's content
   * with Atlas's report about it. **A success says nothing**: the browser coming forward is the result,
   * and doc-11 §4 keeps a success the screen already shows off the 上部帯.
   *
   * The URL is not re-checked here. The screen classified it (`bodyLinkTarget`) and the boundary checks
   * it again (`editor::browser_url`, doc-8 §9.3); a third copy of the rule in the shell would be one more
   * place for the three to disagree.
   */
  async function openBodyLink(url: string): Promise<void> {
    notice = null;
    try {
      await bodyLinkOpen(url);
    } catch (error) {
      notice = commandErrorDetail(asCommandError(error));
    }
  }

  /** Read one task's Git 履歴 (doc-6). Ordering — which in-flight call wins — is the loader's. */
  const historyLoader = createHistoryLoader({
    read: taskHistoryRead,
    cancel: taskHistoryCancel,
    peek: () => untrack(() => historyRead),
    store: (read) => (historyRead = read),
    describeError: (error) => unreadableDetail(asCommandError(error)),
  });

  // Read on a new selection, and again whenever the read's own inputs change — References are now an
  // input (they decide which Pull Requests are looked up), so a References edit or a root move must
  // not leave an answer computed from the previous ones on screen. Commits are not file state — no
  // watch reports a new one — so refreshing those is still the panel's 再取得 button. `historyKey` is
  // the whole dependency; reading the view here would re-fetch on every unrelated root's reload.
  $effect(() => {
    if (historyKey === null) {
      // Nothing to read means the panel closed (or lost its id): no next read will supersede the one
      // in flight, so the 取消 is the only thing that ends its `gh` (decision-19).
      historyLoader.abandon();
      return;
    }
    const view = untrack(() => selectedView);
    const inputs = untrack(() => historyInputs);
    if (view === null || view.task.id === null || inputs === null) {
      return;
    }
    void historyLoader.load(view.task.project, view.task.id, inputs);
  });

  /**
   * 表示切替行 の押した結果 (doc-7 §2.1): 行非表示 (doc-7 §5.1) in whichever direction the row is not in.
   * Since TASK-131 this is the only way one row's 非表示 changes — the レーンヘッダ行's 隠す and the
   * 上部帯 ⑥ both went, so the menu's tick is the state rather than a second copy of it.
   */
  function toggleProject(slug: string): void {
    hidden = hidden.includes(slug)
      ? hidden.filter((candidate) => candidate !== slug)
      : [...hidden, slug];
  }

  /** 行折畳み (doc-7 §2.3・§5.1) を、レーンヘッダ行の控えが押された行について入れ替える。 */
  function toggleRowFold(slug: string): void {
    foldedRows = foldedRows.includes(slug)
      ? foldedRows.filter((candidate) => candidate !== slug)
      : [...foldedRows, slug];
  }

  /**
   * 列折畳み (doc-7 §2.2・§5.1) を入れ替える。
   *
   * 残り 1 列は畳めない (doc-7 §2.2) is checked here and not only where the control draws its refusal:
   * the rule is about the value, and the value is on this side, so a caller that reached this without
   * checking would fold the grid shut. The control keeps its own call to the same function because it
   * has a second job — naming the refusal (doc-11 §5) — which this one does not do.
   */
  function toggleColumnFold(column: GridColumn): void {
    if (!columnFoldable(collapsedColumns, column)) {
      return;
    }
    collapsedColumns = collapsedColumns.includes(column)
      ? collapsedColumns.filter((candidate) => candidate !== column)
      : [...collapsedColumns, column];
  }

  // --- 共通入口のメニューとショートカット (doc-7 §2.1, TASK-56) ---------------------------------

  /**
   * What every モーダル the menu opens does first. Two things, and both are the shell's business
   * rather than the modal's:
   *
   * - 被せ層 は 1 枚だけ (`shortcuts.ts`): モーダル・メニュー・値一覧 all answer Escape where they are, so
   *   two open at once leaves it undecided which one a press belongs to — and a modal's trap would put
   *   the other out of reach in any case.
   * - The ☰ takes focus *before* the modal mounts, so that whichever route was taken — a menu line or a
   *   chord — the modal captures a control that is still on screen and hands focus back to it on close
   *   (doc-7 §2.1 閉じたら開く前の操作へフォーカスを戻す). The menu line the user pressed is unmounted by
   *   the line above, and a press of the chord from the grid would otherwise have nothing but `body` to
   *   go back to. The ☰ is where these operations live, so returning there is
   *   returning to where the operation was taken from.
   *
   * Held in one function because a third modal (the 一覧モーダル) arrived with TASK-67 and the second copy
   * of these two lines is where they start to differ.
   */
  function raiseModal(): void {
    menuOpen = false;
    filterPopoverOpen = false;
    menuButton?.focus();
  }

  /**
   * The same, for a 被せ層 プロジェクト詳細画面 raises itself — its 作成モーダル (doc-10 §1). Since
   * TASK-117 a 被せ層 is defined by its form rather than by which entry opened it (doc-11 §7), and
   * this is the one the 共通入口 do not open.
   *
   * **Unlike `raiseModal` this moves no focus, and must not.** `raiseModal` focuses the ☰ because the
   * menu line the user pressed is unmounted by the opening, leaving the layer nothing on screen to
   * hand focus back to; the 作成の入口 is not unmounted and needs no such stand-in. And this runs from
   * an effect *after* the layer has mounted and taken focus onto its own ×, so a `focus()` here would
   * not redirect the opener — it would put focus outside the layer that is up, which is the opposite
   * of doc-7 §2.1's フォーカスを内側に留める.
   *
   * What is left is the part that is genuinely the shell's: 被せ層 は 1 枚だけ, and the shell's own
   * メニュー sits above that screen.
   */
  function detailOverlay(open: boolean): void {
    detailModalOpen = open;
    if (!open) {
      return;
    }
    // 被せ層 は 1 枚だけ (see `raiseModal`).
    menuOpen = false;
    filterPopoverOpen = false;
    // An unanswered 破棄前確認 from behind lapses under the layer about to cover it, for the reason
    // `openEntry` spells out: which layer draws the question is decided by which one is frontmost.
    pendingDiscard = null;
  }

  /**
   * Open one 共通入口 (doc-7 §2.1). Both are モーダル over the screen that is up, never a screen of their
   * own (AC #2): the swimlane behind keeps its rows, filter and selection, and nothing is unmounted, so
   * no route in can lose 未保存入力.
   */
  function openEntry(id: HeaderEntryId): void {
    raiseModal();
    // An unanswered 破棄前確認 from the screen behind lapses here rather than being taken over by the
    // layer about to cover it. Where the question is drawn is decided by which layer is up
    // (`confirmInModal`), so one raised by another route would be drawn by this モーダル as though one
    // of its own exits had asked it — and 破棄して閉じる would then carry out that other route behind
    // it, leaving the モーダル standing over a screen that had changed underneath. Dropping it
    // discards nothing: the request lapses and the 未保存入力 it was about stays where it is.
    pendingDiscard = null;
    if (id === "register") {
      registerOpen = true;
    } else {
      settingsOpen = true;
      // Not awaited: the モーダル goes up now, and the answer lands in the 区画 when it arrives. Until
      // then 場所を開く holds the previous answer, or says it has not been confirmed on the first open
      // of a run whose startup probe has not returned.
      void refreshSettingsDirectory();
      // 解決結果の表示 (decision-29). Asked on every open rather than once: it spawns three processes
      // (one `--version` per 外部コマンド, 5 s each), so it does not belong in startup, and its answer
      // can change without Atlas doing anything — the user may have installed the tool since the last
      // look, which is the likeliest reason they opened this screen at all.
      void refreshExternalPrograms();
    }
  }

  function openMenu(): void {
    menuOpen = true;
    // 被せ層 は 1 枚だけ (see `raiseModal`).
    filterPopoverOpen = false;
  }

  function closeMenu(): void {
    menuOpen = false;
    // Back to the control the menu was opened from, so the next keystroke has somewhere to go
    // (`FilterBar` returns focus to its own opener the same way).
    menuButton?.focus();
  }

  /** Open or close the 値一覧 (doc-7 §5.2), from the フィルタ帯's button or from its chord. */
  function setFilterPopover(open: boolean): void {
    filterPopoverOpen = open;
    // 被せ層 は 1 枚だけ (see `raiseModal`).
    if (open) {
      menuOpen = false;
    }
  }

  /**
   * Take one line of the menu. A line with a 保留理由 is not pressable, so it never arrives here.
   *
   * **Whether the press closes the menu is decided by the line's 群** (doc-7 §2.1): the `layer` lines
   * close it because 被せ層 は同時に 1 枚だけ and they are raising one — `raiseModal` does that here —
   * while the `rows` lines leave it open. Setting several rows is one errand, and a menu that closed
   * on each of them would make that errand as many round trips as there are rows; doc-7 §5.2 settled
   * the same question the same way for the 値一覧ポップオーバー. Not a check on `item.group`: the switch
   * is over `kind` so that a new line has to say which of the two it is rather than inheriting an
   * answer from a field.
   *
   * **The `default` is what makes that a requirement rather than a wish.** This function returns
   * nothing, so an unhandled `kind` would compile — `lucide.ts` spells out the difference, where the
   * switch is held only because it returns a value. Assigning `item` to `never` puts the same
   * pressure on a switch that returns nothing: a fifth `MenuItem` leaves that assignment impossible
   * and the build stops, instead of drawing a line that looks pressable and does nothing.
   */
  function chooseMenuItem(item: MenuItem): void {
    switch (item.kind) {
      case "entry":
        openEntry(item.entry.id);
        break;
      case "shortcutHelp":
        raiseModal();
        shortcutHelpOpen = true;
        break;
      case "showAllProjects":
        showAllProjects();
        break;
      case "toggleProject":
        toggleProject(item.slug);
        break;
      default: {
        // Unreachable while every `kind` is answered above — and unassignable if one is not.
        const unhandled: never = item;
        throw new Error(`unhandled menu item: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /**
   * すべてのプロジェクトを表示 (doc-7 §2.1). Every hidden slug is a registered one — `removeProject`
   * prunes the list — so there is nothing here to keep back.
   */
  function showAllProjects(): void {
    hidden = [];
  }

  /** 直前の絞り込みを 1 件戻す (doc-7 §5.2) — the operation the フィルタ帯's button issues, by key. */
  function undoFilter(): void {
    if (lastCondition(filter) === null) {
      return;
    }
    filter = removeLastCondition(filter);
  }

  /**
   * The key whose default the handler below is stopping for as long as it is held (`null` while none
   * is). Outside the `$effect` because the listener is re-made whenever the effect re-runs, and a
   * press can outlive that.
   */
  let heldKey: string | null = null;

  /**
   * The 割り当て一覧 (doc-7 §2.1) as the shell answers it. One listener rather than a handler per control:
   * these operations are the screen's own (open a modal, open the menu, open or undo a 絞り込み), and a
   * key that only worked while some particular button had focus would not be a screen-wide shortcut at
   * all. Which rows are considered is decided per press by the 適用範囲 passed in, so nothing here has to
   * recognise a chord — `shortcuts.ts` owns the whole contract (IME・単独キー・修飾キー).
   *
   * Every operation reached here also has a visible control: the two 共通入口 are in the ☰'s menu and in the
   * menu, the menu has its ☰, and the 絞り込み pair are buttons on the フィルタ帯 (doc-7 §2.1
   * ショートカットだけが入口の操作を作らない / AC #9).
   *
   * [`heldKey`] is the one thing it carries between presses: the key of a press it answered and
   * stopped, so the rest of that press stays stopped as well ([`continuesHeldPress`]).
   */
  $effect(() => {
    function pressed(event: KeyboardEvent): void {
      // Only a repeat continues the press that set `heldKey`, so any other keydown ends it. Done here
      // rather than on `keyup`, because a keyup can be missed — the window can lose focus mid-press —
      // and a stale key would stop a default the user does want.
      if (!event.repeat) {
        heldKey = null;
      }
      // A press this handler answered stays its own until the key comes up, so its default is stopped
      // ahead of everything below. Ahead of the 被せ層 check as well: a layer owns the presses that
      // start under it, not the tail of the press that opened it — ⌘N's repeats reached the WebView
      // because the register modal the first press opened made this handler return before stopping
      // them. Not a `return` of its own, because a held press that still matches (Backspace) has to
      // go on running its operation below.
      if (continuesHeldPress(event, heldKey)) {
        event.preventDefault();
      }
      // 被せ層 answer their own keys where they are and consume the press (`Modal.svelte`,
      // `HeaderMenu.svelte`, `FilterPopover.svelte`). A モーダル additionally keeps focus inside itself,
      // so while one is up the shell offers no 適用範囲 and leaves the keyboard to it.
      if (modalOpen) {
        return;
      }
      const scopes: ShortcutScope[] =
        screen === "swimlane" ? ["bothScreens", "swimlane"] : ["bothScreens"];
      const binding = matchShortcut(event, {
        scopes,
        textEntry: textEntryFocused(document.activeElement),
        mac: MAC_KEYBOARD,
      });
      // A repeat whose row stopped matching lands here — `addFilter` moved focus into the 値一覧's
      // 検索欄, so §2.1 withholds the row from the caret's new position — and its default is already
      // stopped above.
      if (binding === null) {
        return;
      }
      // Stopped for a matched press whatever happens next: the key is Atlas's from here on, and letting
      // the WebView act on it as well is how ⌘N would open a modal *and* a window.
      if (binding.preventsDefault !== null) {
        event.preventDefault();
        heldKey = binding.chord.key.toLowerCase();
      }
      switch (binding.action) {
        case "openRegister":
          openEntry("register");
          break;
        case "openSettings":
          openEntry("settings");
          break;
        case "toggleMenu":
          if (menuOpen) {
            closeMenu();
          } else {
            openMenu();
          }
          break;
        case "addFilter":
          setFilterPopover(true);
          break;
        case "undoFilter":
          undoFilter();
          break;
        default:
          // The rest of the list belongs to a 被せ層 or to one of the two input surfaces, each of which
          // answers its own rows. Reached only if a new row is added with a 適用範囲 the shell passes.
          break;
      }
    }
    window.addEventListener("keydown", pressed);
    return () => window.removeEventListener("keydown", pressed);
  });
</script>

<!-- メニュー (decision-31): the 共通入口, the line to the 一覧モーダル, and the プロジェクト一覧. Since the
     固定ヘッダ went, the ☰ stands at the right end of whichever bar is the screen's topmost row — the
     フィルタ帯 (doc-7 §5.2) or プロジェクト詳細's ヘッダ行 (doc-10 §3). Written once here and handed to
     both, because the menu's state, its items and the focus a モーダル comes back to are all this
     shell's; two copies would be two ☰ that could disagree about whether the menu is up.

     アイコンのみのボタン (doc-11 §2.4): the figure carries no words, so the button names itself with
     `aria-label`, and its chord is 併記 in the `title` and as `aria-keyshortcuts` data — doc-7 §2.1's
     form for a control with no label to print beside. The 一覧モーダル the menu opens is where the
     chord can also be read as text. -->
{#snippet menuControl()}
  <div class="menu-anchor" bind:this={menuAnchor}>
    <button
      type="button"
      class="header-entry"
      bind:this={menuButton}
      aria-label="メニュー"
      aria-expanded={menuOpen}
      aria-haspopup="dialog"
      aria-keyshortcuts={ariaKeyShortcuts("toggleMenu", MAC_KEYBOARD)}
      title={`メニュー（${shortcutHint("toggleMenu", MAC_KEYBOARD)}）— 共通の入口と、${SHORTCUT_HELP_LABEL}と、プロジェクトごとの表示・非表示をまとめて開きます`}
      onclick={() => (menuOpen ? closeMenu() : openMenu())}
    >
      <Icon name="menu" />
    </button>
    {#if menuOpen}
      <HeaderMenu
        items={menuItems}
        boundary={menuAnchor}
        onchoose={chooseMenuItem}
        onclose={closeMenu}
      />
    {/if}
  </div>
{/snippet}

<main class="screen">
  {#if OVERLAY_TITLE_BAR}
    <!-- タイトルバーの帯 (decision-31), macOS only: the OS bar is transparent there and this is what
         stands in it. Everywhere else the same line is written into the window's own title by the
         effect above — and on Linux that title is accepted and then not drawn, which decision-31 の
         Linux の改訂 records as a platform where 総件数 does not reach the screen at all.

         総件数 only on the swimlane — both ratios describe the グリッド, so on プロジェクト詳細画面 they
         would be counting a screen that is not up (doc-7 §2.1). -->
    <TitleBar title={titleLine} />
  {/if}

  <!-- 台帳読取専用 is the 上部帯 ③ (doc-11 §4) and never a badge on a bar above it: as a header badge it
       sat above the 確認帯 ①, which is the ordering doc-11 §4 forbids. -->

  {#if registerOpen}
    <!-- 登録 (doc-3 §4.1) is the one ledger-wide operation left, so it opens from the 共通入口 rather
         than from the per-project detail screen (doc-3 §4) — and as a モーダル, which is where doc-7
         §2.1 puts it: モーダルの外に画面遷移を作らない (AC #2). -->
    <!-- Two exits rather than three (doc-11 §7): 登録 writes to the ledger without leaving the layer,
         so there is no 下部操作行. Both of them discard what has been typed, so both are held by the
         same flag while the registration is unresolved and both ask first when there is input. -->
    <Modal
      label="プロジェクトを登録"
      closeBlocked={registerSubmitting ? REGISTERING_REASON : null}
      confirmDiscard={modalConfirm}
      onclose={closeRegister}
    >
      <ProjectRegister
        {entries}
        readOnly={ledgerReadOnly}
        busy={ledgerBusy}
        submitting={registerSubmitting}
        onpickDirectory={pickDirectory}
        ondefaultSlug={ledgerDefaultSlug}
        onregister={registerProject}
        ondirty={(dirty) => (registerDirty = dirty)}
      />
    </Modal>
  {/if}

  {#if settingsOpen}
    <!-- Over the screen with the shell's state intact: an アプリ設定 change is about how the swimlane is
         shown, so losing the rows, filter and selection to open it would be backwards. -->
    <!-- The × this layer draws is turned away by the same fact that turns away Escape and the
         下部操作行's own 変更せずに閉じる, and it is told why: an exit that goes quiet without saying so
         is the 理由の無い無効化 doc-11 §5 refuses. One flag, three exits (doc-11 §7).
         The 破棄前確認 is a different fact and reaches only two of them: 変更せずに閉じる says what
         becomes of the 下書き in its own words, so the question would ask what the label answered. -->
    <Modal
      label="設定"
      closeBlocked={settingsSaving ? SAVING_REASON : null}
      confirmDiscard={modalConfirm}
      onclose={() => closeSettings(false)}
    >
      <Settings
        loaded={settings}
        {settingsPath}
        {ledgerPath}
        directoryPresent={settingsDirectory}
        programs={externalPrograms}
        onsave={saveSettings}
        onopenLocation={openSettingsLocation}
        saving={settingsSaving}
        ondiscard={() => closeSettings(true)}
        ondirty={(dirty) => (settingsDirty = dirty)}
        onsaved={settingsSaved}
      />
    </Modal>
  {/if}

  {#if shortcutHelpOpen}
    <!-- The 割り当て一覧's 画面に出す列 as something read (doc-7 §2.1): a モーダル like the two 共通入口,
         because it is a reference rather than a place to work — nothing behind it is unmounted, so a
         グリッド mid-filter and an open 編集セッション are both still there when it closes. -->
    <!-- Named by the same constant the menu line prints (`header.ts`): the line is named for the layer
         it opens, so a second literal here is the drift that left this modal one character away from
         its own menu line until TASK-130. -->
    <Modal label={SHORTCUT_HELP_LABEL} onclose={() => (shortcutHelpOpen = false)}>
      <ShortcutHelp />
    </Modal>
  {/if}

  {#if dropAsk !== null}
    <!-- 候補選択の問い (doc-7 §4.2): a 候補 2 件以上 受け先 has no 入力欄 for the value to be read from,
         which is what §4.1 keeps for the 入口. **Not doc-11 §12's 実行前確認** — that one asks whether to
         act and has two answers; this asks which value travels and has as many as the column declares.
         What is borrowed is the 被せ層 の作法 (同時に 1 枚, kept by this file), not §12's rules. -->
    <Modal label={DROP_ASK_LABEL} onclose={cancelDropAsk}>
      <section class="drop-ask">
        <h2>{DROP_ASK_LABEL}</h2>
        <p>
          {dropAsk.source.taskId} を {CANONICAL_COLUMN_LABEL[dropAsk.column]} 列へ移します。この列には
          status が {dropAskCandidates.length} 件宣言されています。
        </p>
        <!-- 渡す値は常に読める (doc-7 §4.1 の要求を §4.2 が引く): the chosen candidate is the string the
             `-s` will carry, so the control shows the project's own spelling and never the 正準列名.
             The options are derived from the current read, so a candidate withdrawn from `config.yml`
             while this stands leaves the list rather than staying selectable. -->
        <label>
          <span>渡す status</span>
          <select
            value={dropStatusToPass}
            disabled={dropAskCandidates.length === 0}
            onchange={(event) => (dropHeldStatus = event.currentTarget.value)}
          >
            <!-- Unkeyed, for the reason `LaneCreate.svelte` states at the 入口's own select: the
                 options are static text, and `config.yml` is hand-written and may declare the same
                 status twice — nothing on the path from `read.rs` through `create_status_candidates`
                 treats a repeat as invalid, so a keyed each would throw `each_key_duplicate` on a
                 project the 入口 renders without complaint. The two read one list; they must not
                 disagree about what it may contain. -->
            {#each dropAskCandidates as candidate}
              <option value={candidate}>{candidate}</option>
            {/each}
          </select>
        </label>
        <!-- 進む → 戻る, the order every other layer on this screen answers in (doc-11 §12). -->
        <div class="answers">
          <button type="button" disabled={dropAskBlocked !== null} onclick={confirmDropAsk}>
            この status で移す
          </button>
          <button type="button" onclick={cancelDropAsk}>{ISSUE_CONFIRM_CANCEL}</button>
        </div>
        <!-- 無効化提示 (doc-11 §5): the reason is 常時表示 beside the control rather than a `title`,
             which a disabled button cannot be reached through. -->
        {#if dropAskBlocked !== null}
          <p class="reason">{dropAskBlocked}</p>
        {/if}
      </section>
    </Modal>
  {/if}

  {#if pendingIssue !== null}
    <!-- 実行前確認 (doc-11 §12): a 被せ層 of its own, so the answer is not at the coordinates the press
         was — which is the whole of 連打で素通りできない. Raised here rather than by the 区画 that asked,
         because 被せ層 は同時に 1 枚 is this file's to keep (`raiseModal`). -->
    <!-- No 下部操作行 (doc-11 §7): this layer holds no 下書き, so what the row below carries is the two
         answers to the question and not the ways out of a form. -->
    <Modal label={pendingIssue.confirmation.title} onclose={cancelIssue}>
      <section class="issue-confirm">
        <h2>{pendingIssue.confirmation.title}</h2>
        <p>{pendingIssue.confirmation.question}</p>
        <!-- 進む → 戻る, the order the 破棄前確認 is drawn in at both of its places (doc-11 §12): the same
             question must not swap sides between the layers that ask it. The 進む answer names the act,
             so it is the caller's word rather than a 実行する this file could spell. -->
        <div class="answers">
          <button type="button" onclick={issueConfirmed}>{pendingIssue.confirmation.proceed}</button>
          <button type="button" onclick={cancelIssue}>{ISSUE_CONFIRM_CANCEL}</button>
        </div>
      </section>
    </Modal>
  {/if}

  {#if screen === "swimlane"}
    <FilterBar
      {filter}
      {facets}
      {defaultStorage}
      {cardOrder}
      {cardOrderFailure}
      popoverOpen={filterPopoverOpen}
      onpopover={setFilterPopover}
      onchange={(next) => (filter = next)}
      oncardorder={(next) => void applyCardOrder(next)}
      menu={menuControl}
    />
  {/if}

  <!-- 上部帯 (doc-11 §4), フィルタ帯の下に重要度の固定順で積む。One loop over the derived stack, so
       there is no second place where a band's position could be decided; each band's own controls
       hang off its kind. -->
  {#each bands as band (band.kind)}
    <div class="band" data-band={band.kind}>
      <span class="band-text">{band.text}</span>
      {#if band.kind === "confirm"}
        <!-- 破棄前確認 (doc-8 §6.3): one band, one wording, for all five routes — キャンセル・閉じる・
             別タスクを開く・前後移動・詳細配置の切替. It stays above the grid area, so it is readable
             and answerable while the 中央モーダル is up. -->
        <button type="button" onclick={discardConfirmed}>{DISCARD_CONFIRM_PROCEED}</button>
        <button type="button" onclick={keepEditing}>{DISCARD_CONFIRM_KEEP}</button>
      {:else if band.kind === "unwatched"}
        <!-- 帯が持つ操作は縮約しても帯に残す (doc-11 §4): 継続検出停止 is resolved by re-reading, so the
             再読込 is here and not only on each row's mark — a row that may be scrolled out of view. -->
        <button type="button" onclick={rereadUnwatched}>該当行を再読込</button>
      {:else if band.kind === "notice"}
        <!-- A 通知 carries whatever the backend said (a watch that would not start, a refused
             reorder), so it is the one band whose text is not already 縮約 — the ellipsis can hide
             the only copy of the reason. doc-11 §4 allows the one-line form only while the whole is
             readable elsewhere, which is this disclosure: keyboard-reachable, and not hover-only.
             Keyed on the text so a new 通知 starts closed rather than reusing the last one's state. -->
        {#key band.text}
          <details class="full">
            <summary>全文</summary>
            <p>{band.text}</p>
          </details>
        {/key}
        <!-- ⑤ 通知 だけが閉じられる (doc-11 §4): it reports something already finished, so dismissing
             it hides nothing that is still true. -->
        <!-- アイコンのみのボタン (doc-11 §2.4): the figure is decorative, so the name is all on
             `aria-label`. Same `x` the モーダル draws, and doc-11 §7 is explicit that this is not that
             section's contract — this closes one band, not a layer. -->
        <button type="button" class="close" aria-label="通知を閉じる" onclick={() => (notice = null)}>
          <Icon name="x" />
        </button>
      {/if}
    </div>
  {/each}

  {#if screen === "project"}
    <!-- プロジェクト詳細画面 (doc-10, TASK-55): everything that can be done to one project, in one
         screen. 概要 writes the ledger file alone; the other three write the target project's
         management files through the 更新アダプター. Both routes go through callbacks this shell
         hands down. -->
    {#if detailEntry === null}
      <!-- The ☰ comes along even here. This state has no ヘッダ行 — プロジェクト詳細画面 is not mounted,
           because there is no entry for it to be about — and doc-7 §2.1's ショートカットだけが入口の操作を
           作らない holds on every screen, so without this row 設定・プロジェクトを登録・キーボード操作一覧
           would have no visible way in for as long as the user stays here. -->
      <div class="orphan">
        <p class="status">
          このプロジェクトは登録されていません（別の画面で登録が外れた可能性）。
          <button type="button" class="link" onclick={() => leaveProject(false)}>
            スイムレーンへ戻る
          </button>
        </p>
        {@render menuControl()}
      </div>
    {:else}
      {#key detailEntry.slug}
        <ProjectDetail
          entry={detailEntry}
          load={loadBySlug[detailEntry.slug]}
          {ledgerReadOnly}
          {ledgerBusy}
          {readiness}
          onpickDirectory={pickDirectory}
          onupdate={updateProject}
          onreadGitRemote={readGitRemote}
          onremove={removeProject}
          onissue={issue}
          onopenlink={openBodyLink}
          ondirty={(dirty) => (projectDirty = dirty)}
          onoverlay={detailOverlay}
          onback={() => leaveProject(false)}
          ontoLane={() => leaveProject(true)}
          menu={menuControl}
        />
      {/key}
    {/if}
  {:else if fatal}
    <p class="fatal">読み込みに失敗しました: {fatal}</p>
    <button type="button" onclick={load}>再読み込み</button>
  {:else if loading}
    <p class="status">読み込み中…</p>
  {:else if order.length === 0}
    <p class="status">
      登録済みプロジェクトがありません。フィルタ帯右端のメニューの
      <button type="button" class="link" onclick={() => openEntry("register")}>
        プロジェクトを登録
      </button>
      から追加してください。
    </p>
  {:else}
    <!-- The grid and the detail panel share the remaining height. Which of the three ways the panel
         is placed (doc-8 §2.1) is decided here, because the placement *is* where the panel goes:
         beside the grid, over it, or instead of it. -->
    <div class="body">
      {#if placement !== "full" || selectedRef === null}
        <!-- 全面シングルビューはスイムレーンを退ける (doc-8 §2.1); the other two keep the row visible
             while a task is read. With nothing open there is nothing to give way to. -->
        <Swimlane
          {rows}
          {foldedRows}
          {collapsedColumns}
          density={cardDensity}
          {showStorageMark}
          selectedPath={selectedRef?.sourcePath ?? null}
          canReorder={!ledgerReadOnly}
          unwatched={unwatchedRows}
          conflictOf={conflictFor}
          focusSlug={focusRow}
          createOpen={laneCreateAt}
          createTitle={laneCreateTitle}
          createStatus={laneCreateStatusToPass}
          createBlocked={laneCreateBlocked}
          createHeld={laneCreateHeld}
          oncreateOpen={openLaneCreate}
          oncreateClose={closeLaneCreate}
          oncreateTitle={(value) => (laneCreateTitle = value)}
          oncreateStatus={(value) => (laneCreateHeldStatus = value)}
          oncreateSubmit={submitLaneCreate}
          {dragSource}
          {dragHeld}
          issuingPath={dropIssuingPath}
          ondragstart={startCardDrag}
          ondragend={endCardDrag}
          ondropcard={dropCard}
          onrowFold={toggleRowFold}
          oncolumnFold={toggleColumnFold}
          onselect={open}
          onmove={move}
          onretry={retry}
          onreread={rereadRow}
          onopenProject={openProject}
          onfocused={() => (focusRow = null)}
        />
      {/if}

      <!-- カードを選ぶとタスク詳細画面を開く (doc-7 §3, doc-8 §2). -->
      {#if selectedRef !== null}
        {#if placement === "modal"}
          <!-- 中央モーダル: over the grid, which stays behind it (doc-8 §2.1). The layer covers the
               grid area only, so the 上部帯 — the 破棄前確認 among them (doc-8 §6.3) — stays visible
               and answerable while the modal is up. -->
          <div class="modal-layer">{@render detailPanel()}</div>
        {:else}
          {@render detailPanel()}
        {/if}
      {/if}
    </div>
  {/if}
</main>

{#snippet detailPanel()}
  {#if selectedRef === null}
    <!-- Unreachable: every call site is already inside a selection check. -->
  {:else if shown !== null}
    {@const view = shown.view}
    <TaskDetail
      {view}
      snapshot={shown.snapshot}
      missing={shown.missing}
      entry={selectedEntry}
      {history}
      {placement}
      defaultPlacement={settings?.settings.default_detail_placement ?? placement}
      {placementFailure}
      onplacement={requestPlacement}
      {neighbours}
      {readiness}
      {editorReadiness}
      watchStopped={selectedWatchStopped}
      onreread={() => rereadRow(view.task.project)}
      onopenlink={openBodyLink}
      conflict={selectedConflict}
      onconflict={noteConflict}
      onapply={apply}
      onopenExternally={openExternally}
      onselect={open}
      onreloadHistory={() =>
        view.task.id === null || historyInputs === null
          ? undefined
          : void historyLoader.load(view.task.project, view.task.id, historyInputs)}
      ondirty={(dirty) => (detailDirty = dirty)}
      onconfirmDiscard={(proceed) => guardDiscard(true, proceed)}
      onconfirmIssue={askIssue}
      onclose={closeDetail}
    />
  {:else}
    <!-- The task was open when its root stopped yielding it — deleted, moved, or the root
         became unreadable. Distinct from an empty panel: the selection is still named. -->
    <aside class="detail-gone">
      <p>
        {selectedRef.sourcePath} は現在の読み取り結果にありません（削除・移動、または
        ルート読取不能の可能性）。
      </p>
      <button type="button" onclick={() => (selectedRef = null)}>閉じる</button>
    </aside>
  {/if}
{/snippet}

<style lang="scss">
  .screen {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  // The one screen state with no 帯 of its own to hang the ☰ off (see the markup): a row that is the
  // message and that control, and nothing else. 1 行の高さ is declared here for the same reason each
  // 帯 declares its own — the ☰ reads `--bar-control` whichever row it is standing in, and a row that
  // did not name one would size the figure by whatever it inherited.
  .orphan {
    --bar-control: 1.4rem;

    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding-right: 0.75rem;

    // The message takes the row's free space, so the ☰ ends up at the right edge without a margin of
    // its own (see `.menu-anchor`).
    p {
      flex: 1;
    }
  }

  // A button that reads as part of the sentence it sits in, for the one place a message hands the
  // user a screen to go to rather than an action to take.
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--info);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  // The ☰, which opens the menu holding 登録・設定・キーボード操作一覧 (doc-7 §2.1). It opens a layer
  // over the screen rather than switching to one, so it is drawn unlike a tab that says which screen is
  // current.
  //
  // **Sized by the row it is standing in** (decision-31): since the 固定ヘッダ went, the ☰ shares a line
  // with the controls of whichever 帯 hosts it, so it takes that row's `--bar-control` as a square —
  // the height doc-7 §5.2 keeps the フィルタ帯 to is what decides it, not this file. Its old 28.02px box
  // with 8.8px above and below is what would not fit there.
  //
  // アイコンのみのボタン (doc-11 §2.4): `font-size` sizes the figure, since the icon draws at 1em. The
  // 段 is the bar's own, the same one the two 解除 controls beside it take — a lone button's 1rem would
  // make this the one figure on the row that is bigger than the rest.
  .header-entry {
    display: inline-flex;
    width: var(--bar-control);
    height: var(--bar-control);
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }

  // The menu hangs off this box, so its own absolute position is against the ☰ and not the window — and
  // a press on the ☰ counts as inside, which is what keeps opening from closing it again.
  //
  // **No margin pushing it right.** Each 帯 already has something that takes the row's free space — the
  // フィルタ帯's `.tokens` grows, プロジェクト詳細's このプロジェクトのレーンへ carries the `auto` — so an
  // `auto` here would be a second claim on that space and the two would split it, leaving the ☰ short of
  // the edge on one row and the 出口 adrift on the other.
  //
  // `align-self: center` because a row aligned on `baseline` has nothing to align this to: a button whose
  // only child is an icon has no text to take a baseline from, so it would hang below the words beside it.
  .menu-anchor {
    position: relative;
    align-self: center;
  }

  // 上部帯 (doc-11 §4). One rule for all six: 1 行に収め、折り返さず、族の色は左端 4px だけが持つ
  // (doc-11 §2.3 の 問題の縁). The band names its family through `data-band` and never picks a hue,
  // so 不整合・読取不能・継続検出停止 cannot converge on one colour here (decision-6).
  .band {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--line);
    border-left: 4px solid var(--family);
    background: var(--panel);
    font-size: var(--text-md);

    // 折り返さない: a wrapping band would grow the top of the screen past「フィルタ帯 1 行 ＋ 上部帯
    // 6 本」, which is the ceiling doc-11 §4 relies on. The text is already 縮約 (`band.ts`), so this
    // only catches a narrow window; the full reason is at the operation itself, never hover-only.
    .band-text {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    // 控えの群 (doc-11 §2.2): the 破棄前確認's two answers stand side by side with no field between
    // them, and the band's own 閉じる joins them, so the row takes a step — 1.4rem, the one the bar
    // below it takes, since the band sits over the screen rather than being a form.
    button {
      flex: none;
      height: 1.4rem;
      padding: 0 0.4rem;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;
    }

    // アイコンのみのボタン (doc-11 §2.4). Centred explicitly: the figure is a `display: block` svg, so
    // unlike the `×` it replaced it brings no line box of its own to sit the button's padding around.
    // The `font-size` above is what sizes it, since an icon draws at 1em.
    .close {
      display: inline-flex;
      align-items: center;
      margin-left: auto;
    }

    // 全文 opens *over* the screen rather than growing the band, so the one-line ceiling
    // 「フィルタ帯 1 行 ＋ 上部帯 6 本」 holds whether it is open or closed (doc-11 §4).
    .full {
      position: relative;
      flex: none;
      margin-left: auto;
      font-size: var(--text-sm);

      summary {
        cursor: pointer;
      }

      p {
        position: absolute;
        z-index: 3;
        top: 100%;
        right: 0;
        width: min(40rem, 80vw);
        margin: 0.2rem 0 0;
        padding: 0.4rem 0.5rem;
        border: 1px solid var(--line-strong);
        border-radius: 6px;
        background: var(--panel);
        white-space: pre-wrap;
      }
    }

    // With the 全文 disclosure taking the free space, the × keeps its place at the right end.
    .full + .close {
      margin-left: 0.3rem;
    }

    // ① 確認 and ⑤ 通知 are `--info`: neither is one of decision-6's 族 (青い確認は不整合ではない).
    &[data-band="confirm"],
    &[data-band="notice"] {
      --family: var(--info);
    }

    // ② CLI 縮退 borrows 不整合's colour (decision-22): its object is the app's ability to issue
    // anything, not one task, so it is not 不整合 — but it does not get a family of its own either,
    // because a family is a unit for choosing a colour and the two never sit on the same thing.
    &[data-band="cliDegraded"] {
      --family: var(--mark-inconsistent);
    }

    &[data-band="ledgerReadOnly"] {
      --family: var(--mark-unreadable);
    }

    // 継続検出停止 は不整合ではない (doc-9 §3/§5): its own family, so it cannot be read as one. It
    // used to share the amber that is now 不整合's, which is what decision-6 forbids.
    &[data-band="unwatched"] {
      --family: var(--mark-undetectable);
    }
  }

  .fatal,
  .status {
    margin: 0;
    padding: 0.4rem 0.75rem;
    font-size: var(--text-lg);
  }

  .fatal {
    color: var(--mark-unreadable);
  }

  .status {
    opacity: 0.7;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
    align-items: stretch;
    // The 中央モーダル's layer is positioned against this box rather than the viewport, which is what
    // keeps the フィルタ帯 and the 上部帯 outside it (doc-7 §5.3 の帯は隠さない).
    position: relative;
  }

  .modal-layer {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: color-mix(in srgb, var(--fg) 28%, transparent);
  }

  /*
   * 実行前確認 (doc-11 §12) inside the 被せ層 that asks it. Laid out like the other layers' contents
   * (面の余白 0.75rem, heading first) rather than like the 破棄前確認's one-line row in `Modal.svelte`:
   * that row is an annex to a layer whose subject is elsewhere, and this layer's whole subject is the
   * question, so the text may take the lines it needs.
   *
   * The heading keeps its right end clear of the ×, using the two numbers `Modal.svelte` declares for
   * it — a long act name (an editor command among them) would otherwise run under the control.
   */
  // 候補選択の問い (doc-7 §4.2). Shares the 実行前確認's proportions because both are one question in a
  // 被せ層 with its answers below it; what differs is the control between them, which the other layer
  // has none of. **Not `@extend`d from it** — the two would then move together, and doc-7 §4.2 is
  // explicit that this is not doc-11 §12's 実行前確認.
  .drop-ask {
    padding: 0.75rem;
    font-size: var(--text-md);

    h2 {
      margin: 0 0 0.45rem;
      padding-right: calc(var(--modal-close-inset) * 2 + var(--modal-close-size));
      // 画面見出し (doc-11 §2.2 の 段の役割表). 段は変数が持つので、ここでは数を書かない。
      font-size: var(--text-3xl);
      font-weight: 650;
    }

    p {
      margin: 0 0 0.6rem;
    }

    // 渡す値は常に読める (doc-7 §4.1 の要求を §4.2 が引く), so the label and the value sit together
    // rather than the value standing alone above the answers.
    label {
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }

    // 進む → 戻る, the order every other layer on this screen answers in (doc-11 §12).
    .answers {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.8rem;

      button {
        height: 1.75rem;
      }
    }

    // 保留理由 (doc-11 §5): 常時表示 beside the control it explains, never a `title` alone.
    .reason {
      margin: 0.4rem 0 0;
      color: var(--muted);
      font-size: var(--text-sm);
    }
  }

  .issue-confirm {
    padding: 0.75rem;
    font-size: var(--text-md);

    h2 {
      margin: 0 0 0.45rem;
      padding-right: calc(var(--modal-close-inset) * 2 + var(--modal-close-size));
      // 画面見出し (doc-11 §2.2 の 段の役割表). 段は変数が持つので、ここでは数を書かない —
      // 2026-08-14 に .92rem から 1 段上がったとき、この註だけが古い数のまま残った。
      font-size: var(--text-3xl);
      font-weight: 650;
    }

    p {
      margin: 0;
    }

    // 発行の行ではない (doc-11 §11 は入力を持つ発行の話): 2 つの答えなので、順は問いの側の規則に従う。
    // 控えの群 (doc-11 §2.2): the 実行前確認's two answers. This layer is a 被せ層 like the 作成モーダル,
    // so it takes the same step those do.
    .answers {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.6rem;

      button {
        height: 1.75rem;
      }
    }

    button {
      padding: 0.15rem 0.5rem;
      border: 1px solid var(--line-strong);
      // カード・ボタン 4px (doc-11 §2.2).
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: var(--text-md);
      cursor: pointer;

      // hover は 枠線 --line → --line-strong (doc-11 §2.3); the rest is already `--line-strong`, so what
      //答える controls show on hover is the surface, like the 帯's answers do.
      &:hover {
        background: var(--inset);
      }

      &:focus-visible {
        outline: 2px solid var(--sel);
        outline-offset: 1px;
      }
    }
  }

  .detail-gone {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 0.4rem;
    width: min(30rem, 45vw);
    padding: 0.6rem 0.75rem;
    border-left: 1px solid var(--line);
    font-size: var(--text-md);

    p {
      margin: 0;
    }

    button {
      padding: 0 0.4rem;
      border: 1px solid var(--line-strong);
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;
    }
  }
</style>
