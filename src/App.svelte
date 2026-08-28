<script lang="ts">
  // The swimlane screen's shell (TASK-34 / doc-7): it owns the data the grid draws, the screen-local row
  // state, and the wiring between the two screens and the five controllers. All placement, ordering and
  // filtering rules live in `lib/swimlane.ts` and `lib/filter.ts` as pure functions.
  //
  // **What is left here is what no controller can answer** (TASK-92): which screen is showing, which
  // task and row are selected, what the grid is being handed, and the two 起動/終了 orders — those two
  // because their reasons are about what the *next* step needs, so they are stated at the sequences
  // themselves. Each controller in `src/lib` takes the state it owns as its first argument and reaches
  // everything else through ports; `settings-write.ts` and `history-read.ts` take ports for both,
  // because the values they touch are the shell's, so a `peek`/`adopt` pair is the whole of their
  // contact with it.
  //
  // Row order is deliberately *not* screen state: it is the ledger's entry order (doc-3 §2.2), written
  // back through `ledger_update`. Why the three row values below are held here rather than in the grid
  // is stated at their declaration, and this component is their only writer.
  import { onDestroy, onMount, untrack } from "svelte";
  import type { Availability } from "./lib/availability";
  import { AVAILABLE, withheld } from "./lib/availability";
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
    bodyImageRead,
    bodyLinkOpen,
    releaseNoticeRead,
    releasePageOpen,
    managedFileOpen,
    taskHistoryRead,
    taskHistoryCancel,
    updateApply,
    windowTitleSet,
    workspaceOpen,
  } from "./lib/commands";
  import type { ImageReader } from "./lib/markdown-image";
  import { registeringReason } from "./lib/ledger";
  import type { RemoteLine } from "./lib/git-remote-read";
  import type { ReleaseNotice } from "./lib/wire";
  import { topBands } from "./lib/band";
  import {
    shortcutHelpLabel,
    headerMenu,
    externalOpenEntry,
    menuName,
    type MenuItem,
  } from "./lib/header";
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
    discardConfirmKeep,
    discardConfirmProceed,
    issueConfirmCancel,
    commandErrorDetail,
    failureDetail,
    type ApplyOutcome,
  } from "./lib/edit";
  import { issueAvailability, outcomeMessage, type IssueOutcome } from "./lib/manage";
  import {
    buildLaneTaskCreate,
    laneCreate,
    laneCreateAvailability,
    laneCreateStatus,
  } from "./lib/lane-create";
  import {
    buildLaneStatusEdit,
    laneDragAvailability,
    laneDrop,
    laneDropOptions,
    laneDropStatus,
    type DragSource,
  } from "./lib/lane-drop";
  import {
    asksBeforeOpening,
    externalOpenAvailability,
    launchFailureDetail,
    openNotice as openNoticeFor,
    type ExternalOpenRow,
    type OpenTarget,
  } from "./lib/external-editor";
  import {
    conflictKeyOf,
    isInconsistent,
    type ConflictTarget,
    type VersionConflict,
  } from "./lib/mark";
  import { DEFAULT_CARD_DENSITY } from "./lib/card";
  import { createHistoryController, initialHistoryState } from "./lib/history-controller";
  import { createLedgerController, initialLedgerState } from "./lib/ledger-controller";
  import { createOverlayController, initialOverlayState } from "./lib/overlay-controller";
  import { createWorkspaceController, initialWorkspaceState } from "./lib/workspace-controller";
  import { savingReason } from "./lib/settings";
  import {
    createSettingsController,
    initialSettingsState,
  } from "./lib/settings-controller";
  import { messages, provideMessages } from "./lib/messages-context";
  import { osLanguage, resolveLanguage } from "./lib/messages";
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
    buildSwimlane,
    columnFoldable,
    laneNeighbours,
    restoredColumns,
    restoredRows,
    swimlaneTotals,
    unreadableDetail,
    type GridColumn,
  } from "./lib/swimlane";
  import type {
    DetailPlacement,
    LaunchMethod,
    ProjectSnapshot,
    StatusColumn,
    TaskView,
    UpdateOperation,
  } from "./lib/wire";

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
  /**
   * 被せ層 and 未保存確認 (doc-7 §2.1, doc-8 §6.3, doc-11 §7・§12) as the screen holds them.
   * `overlay-controller.ts` holds which layer may be up, where a 破棄前確認 is drawn, and when an
   * unanswered one lapses — one subject, because every one of those sentences names both halves.
   */
  let overlayState = $state(initialOverlayState());
  const overlay = createOverlayController(overlayState, {
    focusOpener: () => menuButton?.focus(),
    onSettingsOpened: () => {
      // Neither is awaited: the モーダル goes up now, and each answer lands in its 区画 when it arrives.
      // Until then 場所を開く holds the previous answer, or says it has not been confirmed on the first
      // open of a run whose startup probe has not returned.
      void settingsCtl.refreshDirectory();
      void settingsCtl.refreshPrograms();
    },
  });
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
   * A row the grid should bring into view — プロジェクト詳細画面's 「このプロジェクトのレーンへ」
   * (doc-10 §2). Held here rather than in the grid because the request outlives the screen that made
   * it: the grid is not even mounted at the moment the button is pressed.
   */
  let focusRow = $state<string | null>(null);
  /**
   * プロジェクト台帳 (doc-3 §4) as the screen holds it — the entries, their order, 台帳読取専用, and the
   * one-at-a-time guard the four operations share. `ledger-controller.ts` holds all four.
   */
  let ledgerState = $state(initialLedgerState());
  const ledger = createLedgerController(ledgerState, {
    list: ledgerList,
    locate: ledgerLocation,
    register: ledgerRegister,
    remove: ledgerRemove,
    update: ledgerUpdate,
    reorder: ledgerReorder,
    notify: (text) => (notice = text),
    commandError: asCommandError,
    reread: (slug) => workspace.reread(slug),
    forget: (slug) => workspace.forget(slug),
    pruneRowState: (slugs) => pruneRowState(slugs),
    releaseRow: (slug) => releaseRow(slug),
    hiddenSlugs: () => untrack(() => hidden),
    registering: (running) => (overlayState.registerSubmitting = running),
  });
  /**
   * アプリ設定 as the screen holds it (decision-13): the read, the writes, and the probes a write
   * changes the answer of. Held as the controller's state — `settings-controller.ts` says which parts
   * of a read are adopted, what a save applies beyond storing the value, and which probes stop being
   * true when the file changes, all of which used to stand in this file.
   */
  let settingsState = $state(initialSettingsState());
  const settingsCtl = createSettingsController(settingsState, {
    read: settingsRead,
    save: settingsSave,
    locate: settingsLocation,
    directoryPresent: settingsDirectoryPresent,
    openLocation: settingsLocationOpen,
    probeCli: cliProbe,
    probeEditor: editorProbe,
    probePrograms: externalProgramsProbe,
    notify: (text) => (notice = text),
    standingNotice: () => untrack(() => notice),
    commandError: asCommandError,
    peekStorageFilter: () => untrack(() => filter.storage),
    adoptStorageFilter: (next) => (filter = withStorage(filter, next)),
    adoptGridState: (next) => {
      collapsedColumns = next.collapsedColumns;
      foldedRows = next.foldedRows;
      hidden = next.hidden;
    },
    reconcileWatches: () => workspace.reconcileWatches(),
    busy: (running) => (overlayState.settingsSaving = running),
  });
  /**
   * Every registered root's latest read, and how fresh it is (doc-9 §3). `workspace-controller.ts` holds
   * the read, the re-read, 継続検出 and the event that carries a watch's re-read back here.
   */
  let workspaceState = $state(initialWorkspaceState());
  const workspace = createWorkspaceController(workspaceState, {
    openAll: workspaceOpen,
    openOne: projectOpen,
    watchStart: projectWatchStart,
    watchStop: projectWatchStop,
    subscribe: onProjectReloaded,
    notify: (text) => (notice = text),
    commandError: asCommandError,
    watchEnabled: () => untrack(() => watchEnabled),
    registeredSlugs: () => untrack(() => order),
    readLedger: () => ledger.read(),
  });
  /**
   * 行非表示・行折畳み・列折畳み (doc-7 §5.1) の 3 値.
   *
   * All three are held here rather than in `Swimlane.svelte`, because 実行内保持 (doc-7 §5.1): the grid is
   * unmounted whenever プロジェクト詳細画面 is entered, and again when a task is opened while 既定の詳細配置
   * is 全面シングルビュー — a value the grid held would be back at its initial state on the return, which
   * is not what the user asked the fold for. Nothing outside this component writes them, and the 2 folds
   * are read only by the grid.
   *
   * **Since 2026-08-18 they also survive a restart**, through アプリ設定 (decision-13 の 再起動をまたぐ
   * 保持の改訂). This component is still the only writer: each toggle stores the new value the way the
   * 並び順 control does, and what comes back from the file passes 復元時の正規化 — the columns where the
   * settings arrive (`settings-controller.ts`) and the rows against the ledger, which is why the row half
   * is `pruneRowState` below, on every ledger answer, rather than on a settings read (the settings are
   * read first, before any slug is known).
   */
  let hidden = $state<string[]>([]);
  let foldedRows = $state<string[]>([]);
  let collapsedColumns = $state<GridColumn[]>([]);
  let filter = $state<CardFilter>(DEFAULT_FILTER);
  /**
   * A failure of an action the user took; the grid stays usable.
   *
   * **A thunk, not the sentence.** A 通知 outlives the press that raised it, so a stored string would
   * keep the 表示言語 that was in force when it was raised while the screen around it redrew
   * (decision-35). The closure holds the values the sentence needs and words it where it is read, so
   * the band follows the language like everything else. `null` is 通知なし.
   */
  let notice = $state<(() => string) | null>(null);

  /**
   * 新しい版 (decision-44), or `null` — which is both 照会の縮退 and a build that is already the
   * published one. The 照会 runs once at startup and nothing re-runs it, so this holds its answer for
   * the life of the process.
   *
   * Kept in the shell rather than in a controller: it is one value with no operation of its own, and
   * the two places that read it — the ☰'s name and the menu's リリースページ line — are both here.
   */
  let releaseNotice = $state<ReleaseNotice | null>(null);
  /**
   * The open task, held as (slug, file path) rather than as the `TaskView` itself: a reload
   * replaces every view object, and a captured one would keep the detail panel showing the
   * task as it was read before the change (doc-9 §3 継続検出). The path is the key because a
   * 解析不能 task has no id (doc-4 §5) and must still be openable.
   */
  let selectedRef = $state<{ slug: string; sourcePath: string } | null>(null);
  /**
   * The Git 履歴 read the screen holds (doc-6 §3). Held as the controller's state rather than as fields
   * of this shell: which read may be stored, and which task an answer is about, are one sequencing
   * problem, and `history-controller.ts` is where it is stated and tested.
   */
  let historyState = $state(initialHistoryState());
  /** Read one task's Git 履歴 (doc-6). Ordering — which in-flight call wins — is the controller's. */
  const historyReads = createHistoryController(historyState, {
    read: taskHistoryRead,
    cancel: taskHistoryCancel,
    describeError: (error) => unreadableDetail(asCommandError(error)),
  });
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
   * バージョン不整合 (doc-9) per task, keyed by (slug, source path). Owned by the shell rather than the panel
   * because the mark has to outlive the panel: a divergence observed while editing one task is
   * still true after the user goes to look at another, and the swimlane is where they would find it
   * again (AC #4 横断的に適用する). Cleared by the panel when the divergence is resolved — a clean
   * save, a restart from the latest read, a rebase onto it, or an acknowledgement.
   */
  let conflicts = $state<Record<string, VersionConflict>>({});
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

  /** The operations that move a task between 保存区分 (doc-5 §3.3) — they invalidate a selection. */
  const TRANSITIONS: string[] = [
    "taskDemote",
    "taskArchive",
    "taskComplete",
    "draftPromote",
    "draftArchive",
  ];

  let order = $derived(ledgerState.entries.map((entry) => entry.slug));
  let loads = $derived(new Map(Object.entries(workspaceState.loadBySlug)));
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
      cardOrder: settingsState.cardOrder,
      inconsistent: inconsistentView,
    }),
  );
  let allViews = $derived(
    Object.values(workspaceState.loadBySlug).flatMap((load) =>
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
    settingsState.loaded?.settings.default_storage_filter ?? DEFAULT_FILTER.storage,
  );
  // 保存区分印 goes on cards only once a division beyond active is in play (doc-7 §3).
  let showStorageMark = $derived(filter.storage.some((state) => state !== "active"));
  /**
   * The ledger entry プロジェクト詳細画面 is about, or `null` when there is none to show. Resolved
   * against the *current* ledger rather than captured on open, so an entry another window removed
   * takes the screen back to the grid instead of leaving it editing a registration that is gone.
   */
  let detailEntry = $derived(
    detailSlug === null ? null : (ledgerState.entries.find((entry) => entry.slug === detailSlug) ?? null),
  );
  /**
   * 継続検出の可否 (doc-9 §3.1, decision-13). Defaults to on until the settings are read, which is the
   * state a build without a settings file has always been in.
   */
  let watchEnabled = $derived(settingsState.loaded?.settings.watch_external_changes ?? true);
  /**
   * カード情報量 (doc-7 §3, decision-13). Read straight off the settings rather than copied into state
   * on load, so a 保存 in the 設定画面 changes the cards without the grid being rebuilt — the same
   * treatment 継続検出の可否 gets. The fallback is the doc's 既定 M, which is what the grid draws while
   * the first read is in flight and after a read that degraded to the defaults.
   */
  let cardDensity = $derived(settingsState.loaded?.settings.card_density ?? DEFAULT_CARD_DENSITY);
  /**
   * 表示テーマ (decision-12) applied to the document: the chosen set's name on `<html data-theme>`, or
   * the attribute removed for 未選択. Removed rather than resolved to a name, so the OS switching
   * light↔dark is followed by `app.scss`'s media query for as long as nothing has been chosen — the
   * shell has no listener to keep in step, and the first paint (before this read answers) is already
   * the right one.
   *
   * Written from an effect rather than from wherever a settings value is adopted, because `<html>` is
   * outside this component's markup and the same attribute has to follow *every* path a theme can change
   * by: the 設定画面's 保存, the first read at startup, and a read that degraded to the defaults.
   */
  $effect(() => {
    const chosen = themeAttribute(settingsState.loaded?.settings.theme ?? null);
    if (chosen === null) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = chosen;
    }
  });
  /**
   * 表示言語 (decision-35), resolved for every path a language can change by — the same three the
   * theme effect above covers. 言語未選択 resolves against the OS here rather than being left unset,
   * because unlike the theme there is no stylesheet fallback to defer to: some language has to be
   * drawn.
   *
   * `lang` on `<html>` as well as the 文言表, so the webview hyphenates and the OS reads the page in
   * the right language.
   */
  let language = $derived(resolveLanguage(settingsState.loaded?.settings.language ?? null, osLanguage()));
  provideMessages(() => language);

  /** The 文言表 in force, read through the accessor so a 表示言語 change redraws this shell too. */
  const t = messages();
  // `lang` on `<html>` only: `provideMessages` above handed the same 表示言語 to `messages.ts`, so the
  // 文言表 follows it without an effect — and it has to, since an effect runs after the first render.
  $effect(() => {
    document.documentElement.lang = language;
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
   * **A refusal is reported** (⑤ 通知, doc-11 §4) rather than swallowed. **Windows is the only platform
   * this line reaches the screen on** — macOS draws the 帯, and Linux shows the ratios nowhere at all
   * (decision-31 の Linux の改訂) — so a write it refuses leaves them with no destination, and doc-11
   * §5's refusal of a 理由の無い無効化 is the same principle.
   *
   * **Whether the title was *applied* is not checked** (decision-31 の Linux の改訂). The check used to
   * exist and answered "applied" for the very defect it was there to name, because Linux accepts the
   * write and reads the new value back while drawing the old one.
   */
  $effect(() => {
    if (OVERLAY_TITLE_BAR) {
      return;
    }
    void windowTitleSet(titleLine).catch((error) => {
      const detail = unreadableDetail(asCommandError(error));
      notice = () => t().shell.titleCountFailed(detail);
    });
  });
  /**
   * The rows an external change would not reach on its own, so the manual 再読込 is offered for them.
   * Three causes converge here: the user turned 継続検出 off (every row), the event subscription is
   * dead so nothing can arrive at all (every row), or a root's own watch would not start. One value for
   * all three, because doc-9 §3.1 makes the state and its mark the same however it came about; only the
   * reason differs, which `unwatchedReason` below states. Only registered rows either way: a slug that
   * left the ledger has no row to re-read.
   */
  let unwatchedRows = $derived(
    !watchEnabled || workspaceState.reloadFeed === "unavailable"
      ? order
      : workspaceState.unwatched.filter((slug) => order.includes(slug)),
  );
  /** Why 継続検出 is stopped, for the 帯. The state's name and mark stay the same (doc-9 §3.1). */
  let unwatchedReason = $derived(
    !watchEnabled
      ? t().shell.watchOffAll
      : workspaceState.reloadFeed === "unavailable"
        ? t().shell.feedUnavailable
        : t().shell.someRowsUnwatched,
  );
  /** Whether the open task's root is one of those (AC #7: the 外部エディタ経路 states it before opening). */
  /**
   * 選択中の管理ファイル (decision-45 §1) as プロジェクト詳細画面 holds it: the file its **open 区画** has
   * selected, or `null`. Reported up rather than derived here, because the three selections are that
   * screen's own state (doc-10 §5・§6・§10) and only it knows which 区画 is open — a chain over the
   * three would hand over a document to a user looking at a milestone (PR #157 1R [P1]).
   *
   * The 未保存入力 flag comes with it, and it is that file's own rather than the screen's: doc-8 §6.4's
   * 二重取り込み is about editing the *same* file twice, and `overlayState.projectDirty` aggregates
   * every 区画 including 概要, whose input goes to `projects.toml` (PR #157 1R [P2]).
   */
  let projectSelection = $state<{ target: OpenTarget; dirty: boolean } | null>(null);
  let selectedWatchStopped = $derived(
    selectedRef !== null && unwatchedRows.includes(selectedRef.slug),
  );
  /**
   * The 破棄前確認's two answers as the layer that draws them takes them (doc-8 §6.3), or `null` while
   * the question is not a モーダル's to draw. Which of the two places it is drawn in is the overlay
   * controller's rule (doc-11 §7).
   */
  let modalConfirm = $derived(overlay.modalConfirm());

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
      confirming: overlay.confirmingInBand(),
      readiness: settingsState.cli,
      ledgerReadOnly: ledgerState.readOnly,
      unwatchedReason:
        screen === "swimlane" && unwatchedRows.length > 0 ? unwatchedReason : null,
      notice: notice?.() ?? null,
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
    order.map((slug) => ({
      slug,
      name: workspace.snapshotOf(slug)?.config.projectName ?? null,
      shown: !hidden.includes(slug),
    })),
  );
  /**
   * Whether a モーダル is up. While one is, the shell answers no chord at all: doc-7 §2.1 keeps a modal's
   * focus inside itself, and the modal is what answers Escape and Tab there (`Modal.svelte`).
   *
   * **The 候補選択の問い is counted here rather than by the controller**, because it is the grid's own layer
   * (doc-7 §4.2): the drop that raised it is this file's, and `dropAsk` never leaves it. Everything the
   * 共通入口 or プロジェクト詳細画面 raises is the controller's side of the same 1 枚 rule.
   */
  let modalOpen = $derived(overlay.modalOpen(screen === "project") || dropAsk !== null);

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
    const candidates = workspace.candidatesOf(at.slug);
    // `null` while the row is not currently loaded — the cell is not on screen then, so there is
    // nothing to draw the entry in, and an empty 候補 would read as a column that declares none.
    return workspace.snapshotOf(at.slug) === null ? null : laneCreate(candidates, at.column);
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
   * Whether the lane's 作成 may go out, and why not when it may not (doc-5 §5). Through the same
   * `issueAvailability` the 新規タスク区画 uses, so CLI 縮退 (AC #4) and 発行中 read identically on both
   * screens.
   */
  let laneCreateIssue = $derived.by((): Availability => {
    const availability = issueAvailability(laneCreatePlan, { readiness: settingsState.cli, busy: gridBusy });
    return availability.state === "blocked" ? withheld(availability.reason) : AVAILABLE;
  });
  /**
   * Whether every cell's entry may be opened — CLI 縮退 (AC #4) or an issue in flight holds them all.
   * Separate from `laneCreateIssue` because it is what the *closed* ＋新規 of every cell states:
   * doc-7 §4.1 disables the entry under 縮退, not merely its 発行.
   */
  let laneEntryAvailable = $derived(laneCreateAvailability({ readiness: settingsState.cli, busy: gridBusy }));

  // --- 列間ドロップ (doc-7 §4.2, decision-34) ------------------------------------------------

  /** The 候補選択の問い's accessible name — what the layer is, in the words doc-7 §4.2 names it with. */

  /** Why the 問い can no longer be answered: the column stopped declaring anything the drop could pass
   * while the layer stood (doc-9 §3 継続検出). A refusal rather than a silent close — the card was
   * dropped deliberately, so the answer to that gesture is a sentence, not a layer that vanishes. */

  /** Whether any card may be picked up — つまめないカード (doc-7 §4.2). */
  let dragHeld = $derived(laneDragAvailability({ readiness: settingsState.cli, busy: gridBusy }));
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
    return laneDrop(ask.source, ask.source.slug, ask.column, workspace.candidatesOf(ask.source.slug));
  });
  /** The candidates the 問い offers — the rule, and why an `issue` still contributes one, are in
   * `laneDropOptions`, beside the `laneDropStatus` it has to stay one fact with. */
  let dropAskCandidates = $derived(laneDropOptions(dropAskDrop));
  /** The candidate the 問い will pass, resolved against the 受け先's current 候補 (doc-7 §4.2). */
  let dropStatusToPass = $derived(
    dropAskDrop === null ? "" : laneDropStatus(dropAskDrop, dropHeldStatus),
  );
  /** Whether the 問い can be answered — the column may have stopped taking the card, or 縮退 stands. */
  let dropAskAvailable = $derived.by((): Availability => {
    if (dropAskDrop !== null && dropAskDrop.state === "ignored") {
      return withheld(t().shell.dropAskWithdrawn);
    }
    return dragHeld;
  });

  // The open task, resolved against the *current* read of its root, so a reload refreshes the
  // panel instead of leaving it on the version the card was clicked from.
  let selectedSnapshot = $derived.by(() => {
    if (selectedRef === null) {
      return null;
    }
    return workspace.snapshotOf(selectedRef.slug);
  });
  let selectedView = $derived.by(() => {
    const path = selectedRef?.sourcePath;
    if (path === undefined) {
      return null;
    }
    return selectedSnapshot?.tasks.find((view) => view.task.sourcePath === path) ?? null;
  });
  let selectedEntry = $derived(
    ledgerState.entries.find((entry) => entry.slug === selectedRef?.slug) ?? null,
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
    return overlayState.detailDirty && retained?.view.task.sourcePath === selectedRef.sourcePath
      ? { view: retained.view, snapshot: retained.snapshot, missing: true }
      : null;
  });

  /**
   * 選択中の管理ファイル (decision-45 §1): the one file 外部で開く hands over. Read off the screen that
   * is up — the two never stand together, so at most one of the four routes answers, and gating on the
   * screen is what makes a task left selected behind プロジェクト詳細 stop being the target.
   *
   * Declared after `shown` because it reads it: the panel's own value is what says whether a task is
   * being drawn at all, and `selectedRef` alone outlives the read that resolved it.
   */
  let openTarget = $derived<OpenTarget | null>(
    screen === "project"
      ? (projectSelection?.target ?? null)
      : shown === null
        ? null
        : selectedRef,
  );
  /**
   * The selected file has left the read result (doc-8 §7 の 保留理由). Only the task side can be in this
   * state: プロジェクト詳細's three selections are derived from the current read and drop when the file
   * goes (doc-10 §5), so there is no retained value there to be stale.
   */
  let openFileMissing = $derived(screen !== "project" && shown !== null && shown.missing);
  /**
   * What 外部で開く reads (decision-45). Assembled once here because the submenu and the layer have to
   * agree: the layer decides whether to stand from the same 未保存入力 and 抑止 the rows were drawn with.
   */
  let externalOpenContext = $derived({
    target: openTarget,
    fileMissing: openFileMissing,
    watchStopped: openTarget !== null && unwatchedRows.includes(openTarget.slug),
    // **The target's own 未保存入力, not the screen's** (doc-8 §6.4, PR #157 1R [P2]). On the swimlane the
    // two coincide — the panel's dirty flag is the open task's — but プロジェクト詳細 holds four 区画's
    // input in one flag, and a name typed in 概要 has nothing to do with a 文書 opened externally.
    hasUnsavedInput:
      screen === "project" ? (projectSelection?.dirty ?? false) : overlayState.detailDirty,
    noticeSuppressed: settingsState.noticeSuppressed,
  });
  /**
   * The 抑止できる注意 layer standing over a press, with what the press was for (doc-11 §15). Held as
   * one value so the 進む answer cannot be answered against a different row than the one that raised it.
   */
  /**
   * Whether 今後表示しない is ticked on the layer that is up. Reset when the layer rises rather than when
   * it falls: a tick left set from a previous press would suppress the notice on a press that never
   * ticked it, which is the one mistake this value must not make.
   */
  let suppressTicked = $state(false);
  let openNoticeLayer = $state<{
    notice: NonNullable<ReturnType<typeof openNoticeFor>>;
    row: ExternalOpenRow;
    target: OpenTarget;
  } | null>(null);
  /**
   * 問いは、それを立てた対象が替わったら失効する (doc-11 §12 ③, §15). The same rule as 実行前確認's, and it
   * has to be here too: while 未保存入力 stands the panel keeps drawing a file that has left the read
   * (`shown.missing`), so the path does *not* change — and the group itself is what turns 保留 in that
   * state. A layer left standing would offer the very act the screen behind it is refusing.
   */
  $effect(() => {
    const pending = openNoticeLayer;
    if (pending === null) {
      return;
    }
    if (
      externalOpenContext.target?.sourcePath !== pending.target.sourcePath ||
      externalOpenAvailability(externalOpenContext).state === "withheld"
    ) {
      openNoticeLayer = null;
    }
  });
  /**
   * The メニュー's lines (doc-7 §2.1): the 共通入口, then the line that opens the 一覧モーダル, then the
   * プロジェクト一覧 — すべてのプロジェクトを表示 and one 表示切替行 per registered project.
   */
  let menuItems = $derived(
    headerMenu(
      menuProjects,
      releaseNotice,
      externalOpenEntry(settingsState.editor, externalOpenContext),
    ),
  );
  let historyInputs = $derived(historyReads.inputsOf(selectedView, selectedEntry));
  let historyKey = $derived(historyReads.keyOf(selectedView, historyInputs));
  let history = $derived(historyReads.shown(selectedView, historyKey));

  /**
   * 起動順序 (doc-9 §3.1, doc-5 §5, doc-8 §7). **The order is the contract and it is stated here**, one
   * step per line, rather than inside the controllers: each step's reason is about what the *next* step
   * needs, which no single controller can see, and `App.component.test.ts` reads this list to hold it.
   */
  onMount(async () => {
    await workspace.subscribe();
    // Probed here and after every settings save, not per edit: it decides whether edit controls are
    // offered at all (doc-5 §5), and a probe per keystroke-worth of UI would spawn a process for a
    // question that changes only when アプリ設定 does — which is the save (doc-5 §4 順序 1 is why a save
    // changes it at all).
    await settingsCtl.probeCli();
    // The ledger file's location (doc-3 §2.1). One path resolution, and it cannot change while the app
    // runs, so it is read once here rather than each time the 設定モーダル opens.
    await ledger.locate();
    // アプリ設定 (decision-13), before the first read: 継続検出の可否 decides whether `load` starts any
    // watch, and 既定の保存区分 is the filter the first cards are drawn through. Awaited rather than
    // applied later, so the screen never briefly runs on settings the user changed away from.
    await settingsCtl.load();
    await settingsCtl.locate();
    // Not awaited: nothing in startup reads the answer — it is the 設定モーダル's, and the モーダル
    // cannot be up yet — so awaiting it would only put an IPC round trip in front of the first
    // draw. Issued here all the same, so the 区画 has an answer before its first open rather than
    // showing 確認できていません for the moment that open's own probe takes.
    void settingsCtl.refreshDirectory();
    // 外部エディタ経路 (doc-8 §7): one environment read, so it is probed once beside the CLI probe.
    // **Probed after the settings are read**, because doc-8 §7's 起動指定の解決順 starts at アプリ設定 —
    // probing first would report `$EDITOR` as the editor in effect when a setting outranks it. The
    // order is stated here rather than inside the controller because the order *is* the contract, and
    // `App.component.test.ts` reads this list to hold it.
    await settingsCtl.probeEditor();
    // 版照会 (decision-44 §1). **Not awaited**, for `refreshDirectory`'s reason — nothing in startup
    // reads the answer, so awaiting it would only put a `gh` launch in front of the first draw.
    //
    // **Issued before the read rather than after it, and it therefore overlaps the read.** Both
    // orders are correct — no step depends on this one in either direction — and this one is the
    // cheaper of the two: after an awaited `load` the `gh` launch would not start until the whole
    // first read had finished.
    void readReleaseNotice();
    await workspace.load();
  });

  onDestroy(() => workspace.release());

  // --- アプリ設定 (decision-13, TASK-46) ------------------------------------------------------

  /**
   * Answer the 詳細配置 switch's press (doc-8 §2.2). A press on the placement already in force changes
   * nothing on screen, so it goes straight through: there is nothing to discard, and asking anyway would
   * give the user a 破棄前確認 whose "はい" then keeps the input — a confirmation that lies about what it
   * did. It is still forwarded rather than dropped, because on a placement whose 既定 write was refused
   * the same press is the retry of that write.
   *
   * Kept in the shell rather than in the controller: what stands between the press and the write is the
   * 破棄前確認, and the panel holding the input is this file's.
   */
  function requestPlacement(next: DetailPlacement): void {
    if (next === settingsState.placement) {
      void settingsCtl.applyPlacement(next);
      return;
    }
    overlay.guardDiscard(overlayState.detailDirty, () => void settingsCtl.applyPlacement(next));
  }

  /**
   * The 概要区画's remote 現在値 (doc-10 §4.1). Resolves to a `RemoteLine` even when the command rejects:
   * what the line says differs between「remote が無い」and「読めなかった」(decision-6), so a rejection becomes
   * the second rather than being folded into an absence nobody observed.
   */
  async function readGitRemote(slug: string): Promise<RemoteLine> {
    try {
      return await gitRemoteRead(slug);
    } catch (error) {
      return { state: "unaskable", detail: commandErrorDetail(asCommandError(error)) };
    }
  }

  /** True when leaving `screen` would discard 未保存入力 held by whatever it has mounted. */
  function dirtyOn(current: Screen): boolean {
    return current === "swimlane" ? overlayState.detailDirty : overlayState.projectDirty;
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

  // 失効 (doc-11 §12 の ③): the question was about one task's current read, so the panel moving off it
  // takes the question — whether by another selection or by that file leaving the read result.
  $effect(() => overlay.lapseIssue(issueSubject));

  /**
   * Go to another screen. Asks first while the one being left holds 未保存入力 (doc-8 §6.3): its
   * panel is unmounted on the way, so the input is gone as surely as if another task had been opened.
   */
  function goToScreen(next: Screen, slug: string | null = null): void {
    if (next === screen && slug === detailSlug) {
      return;
    }
    overlay.guardDiscard(dirtyOn(screen), () => {
      // The panel holding the input is unmounted from here, so its `ondirty` will not run again to
      // retract the flag. The task selection itself is kept: coming back reopens the task, with a
      // fresh 編集セッション.
      if (screen === "swimlane") {
        overlayState.detailDirty = false;
      } else {
        overlayState.projectDirty = false;
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
   * 復元時の正規化 の行の側 (doc-7 §5.1), as the ledger controller reaches it: the two row values are the
   * grid's, so the prune runs here and the write-back is アプリ設定's.
   *
   * **A prune that dropped something is written back.** Left in the file, the slug outlives the
   * registration: registering that slug again — through 登録 or by hand in the ledger (doc-3 §2.2) — brings
   * the row up folded or hidden, which is the state doc-7 §5.1 says 登録解除 drops. Writing only when
   * something was dropped is what keeps this off an ordinary start: `settings.toml` is then never written
   * by a launch that had nothing to correct.
   */
  function pruneRowState(slugs: readonly string[]): void {
    const keptFolded = restoredRows(foldedRows, slugs);
    const keptHidden = restoredRows(hidden, slugs);
    const dropped = keptFolded.length !== foldedRows.length || keptHidden.length !== hidden.length;
    foldedRows = keptFolded;
    hidden = keptHidden;
    if (dropped) {
      storeGridState();
    }
  }

  /**
   * Everything keyed by a slug that has left the ledger (doc-3 §4.2). 行非表示・行折畳み went with
   * `pruneRowState` above — the ledger the removal returned no longer names this row.
   */
  function releaseRow(slug: string): void {
    conflicts = Object.fromEntries(
      // The key is `JSON.stringify([slug, path])` (`mark.ts`), so the slug is its first element.
      Object.entries(conflicts).filter(([key]) => JSON.parse(key)[0] !== slug),
    );
    if (selectedRef?.slug === slug) {
      selectedRef = null;
      overlayState.detailDirty = false;
    }
    // The 列内新規タスク入力 goes with the row it was in. Dropped rather than kept: the entry is held in the
    // shell so that unmounting the grid does not lose it (see `laneCreateAt`), and a title left standing
    // for an unregistered slug would reappear in a cell if that slug were registered again — input the
    // user typed for a different project.
    if (laneCreateAt?.slug === slug) {
      closeLaneCreate();
    }
    // The プロジェクト詳細画面 of a project that is no longer registered has nothing left to name, so it is
    // closed here rather than by the screen itself — and closed *without* the 破棄前確認, because asking
    // "keep your input?" about a registration that has just been removed offers a choice that no longer
    // exists.
    if (detailSlug === slug) {
      detailSlug = null;
      overlayState.projectDirty = false;
      screen = "swimlane";
    }
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
    overlay.guardDiscard(overlayState.projectDirty, () => {
      overlayState.projectDirty = false;
      detailSlug = null;
      screen = "swimlane";
      if (lane && slug !== null && !hidden.includes(slug)) {
        focusRow = slug;
      }
    });
  }

  /** Close the detail panel (doc-8 §6.3 の 5 経路のひとつ). */
  function closeDetail(): void {
    overlay.guardDiscard(overlayState.detailDirty, () => {
      // Cleared with the selection: the panel is unmounted from here on, so its own `ondirty` will
      // not run again to retract a flag left standing.
      selectedRef = null;
      overlayState.detailDirty = false;
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
      overlayState.detailDirty && selectedRef !== null && selectedRef.sourcePath !== next.sourcePath;
    overlay.guardDiscard(leaving, () => (selectedRef = next));
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
      return { state: "failed", detail: t().shell.projectUnidentified };
    }
    const slug = target.slug;
    try {
      const result = await updateApply(slug, action);
      if (result.state === "conflict") {
        // 更新前競合 (doc-9 §5): an ordinary re-read, not 縮退 — the row and the panel both move to
        // the current file, while the panel keeps the 未保存入力 it was holding.
        workspace.adopt(slug, result.project);
        return { state: "conflict", diverged: result.diverged, unread: result.unread };
      }
      // Present exactly when disk moved (doc-5 §6). A failure that changed nothing leaves the
      // display as it was, which is what lets the panel offer a retry of the same input.
      if (result.project !== null) {
        workspace.adopt(slug, result.project);
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
          overlayState.detailDirty = false;
        }
        notice = () => t().shell.transitionClosedDetail;
      }
      // The operated task as of the re-read, resolved here because the shell is what holds it. The
      // panel needs it to make doc-9 §5's 事後通知 comparison against the right task even when the
      // selection moved during the await — reading it off the panel's own `view` would compare the
      // submitted values against whatever is open instead.
      return { state: "applied", view: workspace.viewAt(target) };
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
        workspace.adopt(slug, result.project);
        return { state: "conflict", diverged: result.diverged, unread: result.unread };
      }
      // Present exactly when disk moved (doc-5 §6): a failure that changed nothing leaves the
      // display as it was, which is what lets the screen offer a retry of the same input.
      if (result.project !== null) {
        workspace.adopt(slug, result.project);
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
    if (at === null || plan.state !== "ready" || laneCreateIssue.state === "withheld") {
      return;
    }
    const column = CANONICAL_COLUMN_LABEL[at.column];
    // The row's task files as of now, so the one the create adds can be told apart afterwards.
    const before = new Set(workspace.tasksOf(at.slug).map((view) => view.task.sourcePath));
    laneCreateBusy = true;
    try {
      const outcome = await issue(at.slug, plan.action);
      const created =
        outcome.state === "applied"
          ? (workspace.tasksOf(at.slug).find((view) => !before.has(view.task.sourcePath)) ?? null)
          : null;
      // 絞り込みはカードの取捨だけを行う (doc-7 §5.2), so a filter in force can take the new card away
      // the moment it is read — the one thing about this create the screen does not state, since an
      // unchanged cell is otherwise indistinguishable from a create that silently did nothing. The
      // filter is reversible from the フィルタ帯, so the card is one 解除 away rather than lost.
      const outOfFilter = created !== null && !matchesFilter(created, filter, inconsistentView);
      // 発行が通った事実そのものは ⑤ 通知 に載せない (doc-11 §4): the card lands in the cell the ＋新規
      // that made it sits in, so a 帯 would repeat what the screen already shows. What stands is the
      // 帰結 above, and every outcome that is not 通った.
      notice =
        outcome.state === "applied" && !outOfFilter
          ? null
          : () =>
              outcomeMessage(outcome, t().shell.taskCreated(at.slug, column)) +
              (outOfFilter ? t().shell.outOfFilter : "");
      if (outcome.state === "applied") {
        laneCreateTitle = "";
      }
    } finally {
      laneCreateBusy = false;
    }
  }

  // --- 列間ドロップ の発行 (doc-7 §4.2) --------------------------------------------------------

  /**
   * Pick a card up (doc-7 §4.2). A task whose TASK-ID could not be read is not picked up at all: the
   * id is what `task edit` addresses, so a drag that started without one could only end in a refusal
   * after the drop — and doc-7 §4.2 refuses by not taking the card, before the gesture.
   */
  function startCardDrag(view: TaskView): void {
    const taskId = view.task.id;
    if (dragHeld.state === "withheld" || taskId === null) {
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
    const drop = laneDrop(source, slug, column, workspace.candidatesOf(slug));
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
    const answerable = dropAskAvailable;
    if (ask === null || drop === null || drop.state === "ignored" || status === "") {
      return;
    }
    if (answerable.state === "withheld") {
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
      const moved = workspace.tasksOf(source.slug).find((view) => view.task.sourcePath === source.sourcePath);
      const outOfFilter =
        outcome.state === "applied" &&
        moved !== undefined &&
        !matchesFilter(moved, filter, inconsistentView);
      notice =
        outcome.state === "applied" && !outOfFilter
          ? null
          : () =>
              outcomeMessage(outcome, t().shell.statusChanged(source.taskId, status)) +
              (outOfFilter ? t().shell.outOfFilter : "");
    } finally {
      dropIssuingPath = null;
    }
  }

  /**
   * 外部で開く の 1 行を行う (doc-8 §7, decision-45). The shell owns the call because it holds the
   * (slug, path) the boundary resolves against, and because the layer this may raise first is the
   * shell's (doc-11 §15 ①).
   *
   * The watch is (re)started before the launch, when 継続検出 is on. It is the whole of the 書き戻し
   * path — the editor's save reaches Atlas only because doc-9's 継続検出 picks it up — so a root whose
   * watch failed to start earlier would take the edit and show nothing. The underlying command is
   * idempotent, so this costs nothing when the watch is already running, and `startWatch` declines by
   * itself while the setting is off.
   *
   * **Nothing is reported on success** (decision-45 §7): what comes forward is the program that was
   * started, and doc-11 §4 keeps a success the screen already shows off the 上部帯. **The failure is
   * ⑤ 通知**, because the menu closed itself before the answer arrived.
   *
   * **There is no 差し控え here any more** (decision-45 §9). The submenu draws the 継続検出停止 note from
   * the state it was opened with, so the note is on screen before the press rather than produced by it.
   */
  async function launchExternally(
    row: ExternalOpenRow,
    target: OpenTarget,
  ): Promise<string | null> {
    if (row.availability.state === "withheld") {
      return null;
    }
    await workspace.startWatch(target.slug);
    try {
      await managedFileOpen(target.slug, target.sourcePath, row.method);
      return null;
    } catch (error) {
      // Returned rather than written to the 帯 here, so one press produces one 帯 even when both halves
      // of it failed — the caller is the only place that knows whether a suppression write failed too.
      return launchFailureDetail(asCommandError(error));
    }
  }

  /**
   * Put one press's failures on the ⑤ 通知 as one line, or clear it when the press succeeded.
   *
   * One 帯 per press even when both halves failed (PR #157 1R [P2]): each half is a whole sentence from
   * the 文言表, so a space is all that goes between them and no separator needs wording — unlike the
   * lists `taskDetail.postCheckMismatch` joins, where the 中黒 differs by language.
   */
  function reportOpen(failures: readonly string[]): void {
    const said = failures.filter((text) => text.length > 0);
    const joined = said.join(" ");
    notice = joined === "" ? null : () => joined;
  }

  /**
   * A press on one submenu row (doc-7 §2.1, decision-45 §6). The layer comes first when there is one to
   * raise — the row's own label names it, so the 進む answer says what will happen — and the tick it
   * carries writes 注意の抑止 before the launch, not after: a user who ticked it and then saw the notice
   * again on the next press would have no way to tell whether the tick took.
   */
  function chooseExternalRow(row: ExternalOpenRow): void {
    const target = openTarget;
    if (target === null || row.availability.state === "withheld") {
      return;
    }
    // Captured before anything can be awaited, like every other issue on this shell: the launch is for
    // the file that was selected when it was asked for.
    const notice = openNoticeFor(row, externalOpenContext);
    overlay.closeMenu();
    if (notice === null) {
      void launchExternally(row, target).then((failure) => reportOpen(failure === null ? [] : [failure]));
      return;
    }
    suppressTicked = false;
    openNoticeLayer = { notice, row, target };
  }

  /**
   * 進む on the 注意 layer: the tick is honoured first, then the launch runs (decision-45 §6).
   *
   * **Awaited, and its failure reported** (PR #157 1R [P2]). The settings file degrades to read-only on
   * an unknown higher `schema_version` (decision-13), so the write can be refused — and the only thing
   * that would otherwise reveal it is the notice standing again on the *next* press, long after the tick.
   * The report goes to ⑤ 通知 for the reason the launch's does: the layer closed before the answer.
   *
   * **The launch still runs.** 進む is what the user pressed; the tick is a request beside it, and
   * failing to record a preference is no reason to withhold the file they asked to open.
   */
  async function proceedWithOpen(suppress: boolean): Promise<void> {
    const pending = openNoticeLayer;
    openNoticeLayer = null;
    if (pending === null) {
      return;
    }
    const suppressFailure = suppress ? await settingsCtl.suppressFrontmatterNotice() : null;
    const launchFailure = await launchExternally(pending.row, pending.target);
    reportOpen([suppressFailure?.() ?? "", launchFailure ?? ""]);
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
      const detail = commandErrorDetail(asCommandError(error));
      notice = () => detail;
    }
  }

  /**
   * 版照会 (decision-44 §1), whose answer is the 版の告知.
   *
   * **A rejection is swallowed and nothing is drawn** — not even ⑤ 通知 (decision-44 §5). The command
   * itself never rejects; what can is the IPC around it, and outside a Tauri window every boundary call
   * does. Either way the outcome is the one 照会の縮退 already has.
   */
  async function readReleaseNotice(): Promise<void> {
    try {
      releaseNotice = await releaseNoticeRead();
    } catch {
      releaseNotice = null;
    }
  }

  /**
   * Open リリースページ (decision-44 §4).
   *
   * **The failure goes to ⑤ 通知** (doc-11 §4), unlike the 照会's: this one was pressed, and the menu
   * that held the line closes before the browser answers — 押した層が結果より先に閉じるもの is what ⑤ is
   * for. A success says nothing, as 本文リンク's does.
   */
  async function openReleasePage(): Promise<void> {
    notice = null;
    try {
      await releasePageOpen();
    } catch (error) {
      const detail = commandErrorDetail(asCommandError(error));
      notice = () => detail;
    }
  }

  /** One reader per registered project, so the prop `Body` receives keeps its identity (below). */
  const imageReaders = new Map<string, ImageReader>();

  /**
   * The bytes of one 添付画像, for one project (doc-8 §9.2).
   *
   * **Curried by slug rather than taking one**, because the component that ends up calling it is
   * `Body.svelte`, which is handed a 本文 and nothing else — it does not know which project the string
   * came from, and giving it the slug would be telling it something it has no other use for.
   *
   * **Nothing is caught here.** Unlike 既定ブラウザ起動 above, a refusal is not ⑤ 通知: doc-8 §9.2 leaves
   * the 本文画像 at its 状態の印, which is already on screen, and `markdown-image.ts` is where the
   * rejection stops. A notice would be Atlas reporting on a file's content beside that content.
   */
  function imageReaderFor(slug: string): ImageReader {
    // **Memoized so the prop keeps its identity.** Svelte re-evaluates a prop expression through a
    // getter, so a fresh closure per read would re-run `Body.svelte`'s image effect on any snapshot
    // change. Keyed by slug and never evicted: one closure per registered project.
    //
    // **This removes one trigger, not the class of them** — `Body.svelte`'s other dependency is a
    // `$derived` that yields a fresh object every recompute, so that effect still re-runs on an
    // unchanged 本文. What makes the re-run harmless is `releaseImages` keeping any URL whose `<img>`
    // is still displayed; this is here so a stable prop is not one more thing to re-derive.
    let reader = imageReaders.get(slug);
    if (reader === undefined) {
      reader = (reference) => bodyImageRead(slug, reference);
      imageReaders.set(slug, reader);
    }
    return reader;
  }

  // Read on a new selection, and again whenever the read's own inputs change — References are now an
  // input (they decide which Pull Requests are looked up), so a References edit or a root move must
  // not leave an answer computed from the previous ones on screen. Commits are not file state — no
  // watch reports a new one — so refreshing those is still the panel's 再取得 button. `historyKey` is
  // the whole dependency; reading the view here would re-fetch on every unrelated root's reload,
  // which is why the other two are read through `untrack`.
  $effect(() => {
    historyReads.follow(
      historyKey,
      untrack(() => selectedView),
      untrack(() => historyInputs),
    );
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
    storeGridState();
  }

  /** 行折畳み (doc-7 §2.3・§5.1) を、レーンヘッダ行の控えが押された行について入れ替える。 */
  function toggleRowFold(slug: string): void {
    foldedRows = foldedRows.includes(slug)
      ? foldedRows.filter((candidate) => candidate !== slug)
      : [...foldedRows, slug];
    storeGridState();
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
    storeGridState();
  }

  /**
   * Store the 3 値 as they now stand (doc-7 §5.1 の 押下ごとの保存, decision-13 の 再起動をまたぐ保持の改訂).
   * The rule — and why a refusal is said in the ⑤ 通知 rather than beside the control — is the
   * controller's; this only names the three values it sends, which is the whole of the shell's part.
   */
  function storeGridState(): void {
    void settingsCtl.storeGridState({ collapsedColumns, foldedRows, hidden });
  }

  // --- 共通入口のメニューとショートカット (doc-7 §2.1, TASK-56) ---------------------------------

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
      case "externalOpen":
        // Nothing happens on the parent row: it opens the サブメニュー, which `HeaderMenu.svelte` owns
        // (decision-45 §3 — the submenu is a 係留された part of this same 被せ層, so raising it is not a
        // press this shell carries out). The rows inside arrive through `chooseExternalRow`.
        break;
      case "entry":
        overlay.openEntry(item.entry.id);
        break;
      case "shortcutHelp":
        overlay.openShortcutHelp();
        break;
      case "releasePage":
        // **Closed before the launch** (doc-7 §2.1 の 群 ごとの閉じる規則). Nothing rises to displace it —
        // the destination is outside Atlas — so it has to be closed here; the browser comes forward over
        // a window whose menu would otherwise still be up when the user comes back. Closing it is also
        // what puts the failure on ⑤ 通知 rather than beside the line (doc-11 §4).
        overlay.closeMenu();
        void openReleasePage();
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
    storeGridState();
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
          overlay.openEntry("register");
          break;
        case "openSettings":
          overlay.openEntry("settings");
          break;
        case "toggleMenu":
          if (overlayState.menuOpen) {
            overlay.closeMenu();
          } else {
            overlay.openMenu();
          }
          break;
        case "addFilter":
          overlay.setFilterPopover(true);
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
      class:has-notice={releaseNotice !== null}
      aria-label={menuName(t().action.menu, releaseNotice !== null)}
      aria-expanded={overlayState.menuOpen}
      aria-haspopup="dialog"
      aria-keyshortcuts={ariaKeyShortcuts("toggleMenu", MAC_KEYBOARD)}
      title={t().shell.menuHint(shortcutHint("toggleMenu", MAC_KEYBOARD), shortcutHelpLabel())}
      onclick={() => (overlayState.menuOpen ? overlay.closeMenu() : overlay.openMenu())}
    >
      <Icon name="menu" />
    </button>
    {#if overlayState.menuOpen}
      <HeaderMenu
        items={menuItems}
        boundary={menuAnchor}
        onchoose={chooseMenuItem}
        onchooseRow={chooseExternalRow}
        asksFirst={(row) => asksBeforeOpening(row, externalOpenContext)}
        onclose={overlay.closeMenu}
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

  {#if overlayState.registerOpen}
    <!-- 登録 (doc-3 §4.1) is the one ledger-wide operation left, so it opens from the 共通入口 rather
         than from the per-project detail screen (doc-3 §4) — and as a モーダル, which is where doc-7
         §2.1 puts it: モーダルの外に画面遷移を作らない (AC #2). -->
    <!-- Two exits rather than three (doc-11 §7): 登録 writes to the ledger without leaving the layer,
         so there is no 下部操作行. Both of them discard what has been typed, so both are held by the
         same flag while the registration is unresolved and both ask first when there is input. -->
    <Modal
      label={t().projectRegister.heading}
      closeAvailability={overlayState.registerSubmitting ? withheld(registeringReason()) : AVAILABLE}
      confirmDiscard={modalConfirm}
      onclose={overlay.closeRegister}
    >
      <ProjectRegister
        entries={ledgerState.entries}
        readOnly={ledgerState.readOnly}
        busy={ledgerState.busy}
        submitting={overlayState.registerSubmitting}
        onpickDirectory={pickDirectory}
        ondefaultSlug={ledgerDefaultSlug}
        onregister={ledger.register}
        ondirty={(dirty) => (overlayState.registerDirty = dirty)}
      />
    </Modal>
  {/if}

  {#if overlayState.settingsOpen}
    <!-- Over the screen with the shell's state intact: an アプリ設定 change is about how the swimlane is
         shown, so losing the rows, filter and selection to open it would be backwards. -->
    <!-- The × this layer draws is turned away by the same fact that turns away Escape and the
         下部操作行's own 変更せずに閉じる, and it is told why: an exit that goes quiet without saying so
         is the 理由の無い無効化 doc-11 §5 refuses. One flag, three exits (doc-11 §7).
         The 破棄前確認 is a different fact and reaches only two of them: 変更せずに閉じる says what
         becomes of the 下書き in its own words, so the question would ask what the label answered. -->
    <Modal
      label={t().settings.heading}
      closeAvailability={overlayState.settingsSaving ? withheld(savingReason()) : AVAILABLE}
      confirmDiscard={modalConfirm}
      onclose={() => overlay.closeSettings(false)}
    >
      <Settings
        loaded={settingsState.loaded}
        settingsPath={settingsState.path}
        ledgerPath={ledgerState.path}
        directoryPresent={settingsState.directoryPresent}
        programs={settingsState.programs}
        onsave={settingsCtl.save}
        onopenLocation={settingsCtl.openLocation}
        saving={overlayState.settingsSaving}
        ondiscard={() => overlay.closeSettings(true)}
        ondirty={(dirty) => (overlayState.settingsDirty = dirty)}
        onsaved={overlay.settingsSaved}
      />
    </Modal>
  {/if}

  {#if overlayState.shortcutHelpOpen}
    <!-- The 割り当て一覧's 画面に出す列 as something read (doc-7 §2.1): a モーダル like the two 共通入口,
         because it is a reference rather than a place to work — nothing behind it is unmounted, so a
         グリッド mid-filter and an open 編集セッション are both still there when it closes. -->
    <!-- Named by the same constant the menu line prints (`header.ts`): the line is named for the layer
         it opens, so a second literal here is the drift that left this modal one character away from
         its own menu line until TASK-130. -->
    <Modal label={shortcutHelpLabel()} onclose={overlay.closeShortcutHelp}>
      <ShortcutHelp />
    </Modal>
  {/if}

  {#if dropAsk !== null}
    <!-- 候補選択の問い (doc-7 §4.2): a 候補 2 件以上 受け先 has no 入力欄 for the value to be read from,
         which is what §4.1 keeps for the 入口. **Not doc-11 §12's 実行前確認** — that one asks whether to
         act and has two answers; this asks which value travels and has as many as the column declares.
         What is borrowed is the 被せ層 の作法 (同時に 1 枚, kept by this file), not §12's rules. -->
    <Modal label={t().shell.dropAskLabel} onclose={cancelDropAsk}>
      <section class="drop-ask">
        <h2>{t().shell.dropAskLabel}</h2>
        <p>
          {t().shell.dropAskLead(
            dropAsk.source.taskId,
            CANONICAL_COLUMN_LABEL[dropAsk.column],
            dropAskCandidates.length,
          )}
        </p>
        <!-- 渡す値は常に読める (doc-7 §4.1 の要求を §4.2 が引く): the chosen candidate is the string the
             `-s` will carry, so the control shows the project's own spelling and never the 正準列名.
             The options are derived from the current read, so a candidate withdrawn from `config.yml`
             while this stands leaves the list rather than staying selectable. -->
        <label>
          <span>{t().shell.dropAskSelectLabel}</span>
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
          <button type="button" disabled={dropAskAvailable.state === "withheld"} onclick={confirmDropAsk}>
            {t().shell.dropAskConfirm}
          </button>
          <button type="button" onclick={cancelDropAsk}>{issueConfirmCancel()}</button>
        </div>
        <!-- 無効化提示 (doc-11 §5): the reason is 常時表示 beside the control rather than a `title`,
             which a disabled button cannot be reached through. -->
        {#if dropAskAvailable.state === "withheld"}
          <p class="reason">{dropAskAvailable.reason}</p>
        {/if}
      </section>
    </Modal>
  {/if}

  {#if overlayState.pendingIssue !== null}
    <!-- 実行前確認 (doc-11 §12): a 被せ層 of its own, so the answer is not at the coordinates the press
         was — which is the whole of 連打で素通りできない. Raised here rather than by the 区画 that asked,
         because 被せ層 は同時に 1 枚 is this file's to keep (`overlay.raiseModal`). -->
    <!-- No 下部操作行 (doc-11 §7): this layer holds no 下書き, so what the row below carries is the two
         answers to the question and not the ways out of a form. -->
    <Modal label={overlayState.pendingIssue.confirmation.title} onclose={overlay.cancelIssue}>
      <section class="issue-confirm">
        <h2>{overlayState.pendingIssue.confirmation.title}</h2>
        <p>{overlayState.pendingIssue.confirmation.question}</p>
        <!-- 進む → 戻る, the order the 破棄前確認 is drawn in at both of its places (doc-11 §12): the same
             question must not swap sides between the layers that ask it. The 進む answer names the act,
             so it is the caller's word rather than a 実行する this file could spell. -->
        <div class="answers">
          <button type="button" onclick={overlay.issueConfirmed}>{overlayState.pendingIssue.confirmation.proceed}</button>
          <button type="button" onclick={overlay.cancelIssue}>{issueConfirmCancel()}</button>
        </div>
      </section>
    </Modal>
  {/if}

  {#if openNoticeLayer !== null}
    <!-- 抑止できる注意 (doc-11 §15, decision-45 §6). A layer of its own for §15 ①'s reason — the same one
         §12 gives — and **one layer for both halves** (§15 ③): the two sentences are different facts, and
         two layers for one press would make the second answer a reflex.
         **The tick reaches only the suppressible half**, which is why it is absent when only 実行前確認
         stands: a tick beside that question would read as turning that question off. -->
    <Modal label={openNoticeLayer.notice.title} onclose={() => (openNoticeLayer = null)}>
      <section class="issue-confirm">
        <h2>{openNoticeLayer.notice.title}</h2>
        {#if openNoticeLayer.notice.frontmatter !== null}
          <p>{openNoticeLayer.notice.frontmatter}</p>
        {/if}
        {#if openNoticeLayer.notice.unsavedInput !== null}
          <p>{openNoticeLayer.notice.unsavedInput}</p>
        {/if}
        {#if openNoticeLayer.notice.suppress !== null}
          <p class="suppress">
            <label>
              <input type="checkbox" bind:checked={suppressTicked} />
              {openNoticeLayer.notice.suppress}
            </label>
          </p>
        {/if}
        <!-- 進む → 戻る, as every other layer that asks (doc-11 §12). The 進む answer names the act, so
             it is the row's own label. -->
        <div class="answers">
          <button type="button" onclick={() => void proceedWithOpen(suppressTicked)}>
            {openNoticeLayer.notice.proceed}
          </button>
          <button type="button" onclick={() => (openNoticeLayer = null)}>{issueConfirmCancel()}</button>
        </div>
      </section>
    </Modal>
  {/if}

  {#if screen === "swimlane"}
    <FilterBar
      {filter}
      {facets}
      {defaultStorage}
      cardOrder={settingsState.cardOrder}
      cardOrderFailure={settingsState.cardOrderFailure?.() ?? null}
      popoverOpen={overlayState.filterPopoverOpen}
      onpopover={overlay.setFilterPopover}
      onchange={(next) => (filter = next)}
      oncardorder={(next) => void settingsCtl.applyCardOrder(next)}
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
        <button type="button" onclick={overlay.discardConfirmed}>{discardConfirmProceed()}</button>
        <button type="button" onclick={overlay.keepEditing}>{discardConfirmKeep()}</button>
      {:else if band.kind === "unwatched"}
        <!-- 帯が持つ操作は縮約しても帯に残す (doc-11 §4): 継続検出停止 is resolved by re-reading, so the
             再読込 is here and not only on each row's mark — a row that may be scrolled out of view. -->
        <button type="button" onclick={() => void workspace.rereadAll(unwatchedRows)}>
          {t().shell.rereadUnwatched}
        </button>
      {:else if band.kind === "notice"}
        <!-- A 通知 carries whatever the backend said (a watch that would not start, a refused
             reorder), so it is the one band whose text is not already 縮約 — the ellipsis can hide
             the only copy of the reason. doc-11 §4 allows the one-line form only while the whole is
             readable elsewhere, which is this disclosure: keyboard-reachable, and not hover-only.
             Keyed on the text so a new 通知 starts closed rather than reusing the last one's state. -->
        {#key band.text}
          <details class="full">
            <summary>{t().shell.noticeFull}</summary>
            <p>{band.text}</p>
          </details>
        {/key}
        <!-- ⑤ 通知 だけが閉じられる (doc-11 §4): it reports something already finished, so dismissing
             it hides nothing that is still true. -->
        <!-- アイコンのみのボタン (doc-11 §2.4): the figure is decorative, so the name is all on
             `aria-label`. Same `x` the モーダル draws, and doc-11 §7 is explicit that this is not that
             section's contract — this closes one band, not a layer. -->
        <button type="button" class="close" aria-label={t().shell.noticeClose} onclick={() => (notice = null)}>
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
          {t().shell.projectUnregistered}
          <button type="button" class="link" onclick={() => leaveProject(false)}>
            {t().action.backToSwimlane}
          </button>
        </p>
        {@render menuControl()}
      </div>
    {:else}
      {#key detailEntry.slug}
        <ProjectDetail
          entry={detailEntry}
          load={workspaceState.loadBySlug[detailEntry.slug]}
          ledgerReadOnly={ledgerState.readOnly}
          ledgerBusy={ledgerState.busy}
          readiness={settingsState.cli}
          onpickDirectory={pickDirectory}
          onupdate={ledger.update}
          onreadGitRemote={readGitRemote}
          onremove={ledger.remove}
          onissue={issue}
          onopenlink={openBodyLink}
          readimage={imageReaderFor(detailEntry.slug)}
          ondirty={(dirty) => (overlayState.projectDirty = dirty)}
          onoverlay={overlay.detailOverlay}
          onback={() => leaveProject(false)}
          ontoLane={() => leaveProject(true)}
          onselectManaged={(selection) =>
            (projectSelection =
              selection === null
                ? null
                : { target: { slug: selection.slug, sourcePath: selection.sourcePath }, dirty: selection.dirty })}
          onreread={() => void workspace.reread(detailEntry.slug)}
          watchStopped={unwatchedRows.includes(detailEntry.slug)}
          menu={menuControl}
        />
      {/key}
    {/if}
  {:else if workspaceState.fatal}
    <p class="fatal">{t().shell.fatal(workspaceState.fatal())}</p>
    <button type="button" onclick={() => void workspace.load()}>{t().action.reload}</button>
  {:else if workspaceState.loading}
    <p class="status">{t().state.loading}</p>
  {:else if order.length === 0}
    <p class="status">
      {t().shell.noProjects.lead}
      <button type="button" class="link" onclick={() => overlay.openEntry("register")}>
        {t().projectRegister.heading}
      </button>
      {t().shell.noProjects.tail}
    </p>
  {:else}
    <!-- The grid and the detail panel share the remaining height. Which of the three ways the panel
         is placed (doc-8 §2.1) is decided here, because the placement *is* where the panel goes:
         beside the grid, over it, or instead of it. -->
    <div class="body">
      {#if settingsState.placement !== "full" || selectedRef === null}
        <!-- 全面シングルビューはスイムレーンを退ける (doc-8 §2.1); the other two keep the row visible
             while a task is read. With nothing open there is nothing to give way to. -->
        <Swimlane
          {rows}
          {foldedRows}
          {collapsedColumns}
          density={cardDensity}
          {showStorageMark}
          selectedPath={selectedRef?.sourcePath ?? null}
          canReorder={!ledgerState.readOnly}
          unwatched={unwatchedRows}
          conflictOf={conflictFor}
          focusSlug={focusRow}
          createOpen={laneCreateAt}
          createTitle={laneCreateTitle}
          createStatus={laneCreateStatusToPass}
          createAvailability={laneCreateIssue}
          entryAvailability={laneEntryAvailable}
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
          onmove={ledger.move}
          onretry={workspace.reread}
          onreread={workspace.reread}
          onopenProject={openProject}
          onfocused={() => (focusRow = null)}
        />
      {/if}

      <!-- カードを選ぶとタスク詳細画面を開く (doc-7 §3, doc-8 §2). -->
      {#if selectedRef !== null}
        {#if settingsState.placement === "modal"}
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
      placement={settingsState.placement}
      defaultPlacement={settingsState.loaded?.settings.default_detail_placement ??
        settingsState.placement}
      placementFailure={settingsState.placementFailure?.() ?? null}
      onplacement={requestPlacement}
      {neighbours}
      readiness={settingsState.cli}
      editorReadiness={settingsState.editor}
      watchStopped={selectedWatchStopped}
      onreread={() => workspace.reread(view.task.project)}
      onopenlink={openBodyLink}
      readimage={imageReaderFor(view.task.project)}
      conflict={selectedConflict}
      onconflict={noteConflict}
      onapply={apply}
      onselect={open}
      onreloadHistory={() => historyReads.reread(view, historyInputs)}
      ondirty={(dirty) => (overlayState.detailDirty = dirty)}
      onconfirmDiscard={(proceed) => overlay.guardDiscard(true, proceed)}
      onconfirmIssue={(confirmation, proceed) =>
        overlay.askIssue(issueSubject, confirmation, proceed)}
      onclose={closeDetail}
    />
  {:else}
    <!-- The task was open when its root stopped yielding it — deleted, moved, or the root
         became unreadable. Distinct from an empty panel: the selection is still named. -->
    <aside class="detail-gone">
      <p>{t().shell.detailGone(selectedRef.sourcePath)}</p>
      <button type="button" onclick={() => (selectedRef = null)}>{t().action.close}</button>
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

  // 版の告知 の印 (decision-44 §3): the ☰ carries a filled dot while a 新しい版 stands.
  //
  // **図形の外側の塗り** (doc-11 §2.4) — an アイコンのみのボタン may not say a persistent state in words,
  // and the same fact is in the button's `aria-label` because neither a fill nor a stroke reaches a
  // screen reader. Drawn as a pseudo-element rather than a second `Icon`: doc-11 §2.4's 同じ図形を別の
  // 操作へ与えない is about figures, and a mark is not one — this dot names no operation.
  //
  // `--info` because the family colours are decision-6's three degradations (不整合・読取不能・
  // 継続検出停止) and this is none of them; the 上部帯 ① and ⑤ take the same value for the same reason.
  .header-entry.has-notice {
    position: relative;

    // **Placed off the figure, not over it** — §2.4 asks for a mark outside it, and the corner the
    // figure leaves is the whole of the room there is. Measured on the real shell: the control is
    // 24.625px and the figure 11.953px centred in it, so the corner is 6.33px; offsets resolve against
    // the padding box, so a 5px dot at 0 spans 1–6px and clears the figure by 0.33px. **5px is
    // therefore the largest that clears it** — and both numbers move with the 地の 1rem (doc-11's note
    // on its px values), so a base change is a re-measurement rather than an arithmetic adjustment.
    //
    // **Kept inside the control** rather than half outside it: `main.screen` clips, and the ☰ stands at
    // the right edge of whichever 帯 is topmost — a negative offset would be a mark that disappears at
    // some window widths and not at others.
    &::after {
      position: absolute;
      top: 0;
      right: 0;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--info);
      content: "";
    }
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
