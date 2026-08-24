/**
 * アプリ設定 as the screen holds it (decision-13): the read at startup, every write, and the probes a
 * write changes the answer of.
 *
 * `settings-write.ts` owns the ordering of writes — `settings.toml` is one document and several controls
 * write it at once — and this owns everything around them: which parts of a read are adopted and which
 * are not, what a save has to *apply* beyond storing the value (継続検出 の 監視再調整), and which probes
 * stop being true when the file changes. Those three were the shell's, and each of them is a rule about
 * アプリ設定 rather than about the swimlane, which is why they are here now.
 *
 * **What it owns and what it borrows.** [`SettingsState`] is its own — nothing else writes those fields.
 * The values it can only *hand over* are ports: 既定の保存区分 lands on a live filter this file does not
 * hold, the 3 値 land on the grid's own row state (doc-7 §5.1), and 継続検出 reaches the watches. That
 * split is the same one `settings-write.ts` draws with `peek`/`adopt`.
 */

import { DEFAULT_FILTER, type StorageSelection } from "./filter";
import { msg } from "./messages";
import { openLocationFailure } from "./settings";
import { createSettingsWriter, type SettingsChange } from "./settings-write";
import { DEFAULT_CARD_ORDER, restoredColumns, unreadableDetail, type GridColumn } from "./swimlane";
import type {
  AppSettings,
  CardOrder,
  CliReadiness,
  CommandError,
  DetailPlacement,
  EditorReadiness,
  ExternalProgramReport,
  LoadedSettings,
} from "./wire";

/**
 * 行非表示・行折畳み・列折畳み (doc-7 §5.1) as one value. The grid holds these — they decide which rows
 * it is handed at all — so they travel between the file and the shell rather than living here.
 */
export interface GridRowState {
  collapsedColumns: GridColumn[];
  foldedRows: string[];
  hidden: string[];
}

export interface SettingsState {
  /**
   * アプリ設定 and why they are what they are (decision-13). `null` until the first read answers, which
   * is why the screen waits for it before opening any root: 継続検出の可否 and 既定の保存区分 decide what
   * the first read *does*, and applying them after the fact would start a watch the user turned off.
   */
  loaded: LoadedSettings | null;
  /** Where `settings.toml` is (decision-13), for the 設定画面 to name. `null` while unknown. */
  path: string | null;
  /**
   * Whether the folder both of Atlas's own files live in is there yet (doc-3 §2.1), for the 設定画面 to
   * withhold 場所を開く with. `null` until an answer is in hand — a probe still in flight and one that
   * failed are one state to the screen, which says it has not looked rather than reporting a folder it
   * has not looked at.
   *
   * Held apart from the path above because the answers have different lifetimes: a path is resolved
   * once and cannot change while the app runs, while this turns true the first time either file is
   * saved (`store::replace` creates the destination's parent).
   */
  directoryPresent: boolean | null;
  /** 解決結果の表示 (decision-29). `null` until the 設定画面's own probe answers. */
  programs: ExternalProgramReport[] | null;
  /**
   * Whether a supported `backlog` exists (doc-5 §5 縮退). `null` until the probe answers, which the
   * panel shows as "確認中" rather than as "no CLI" — the two lead to different user actions.
   */
  cli: CliReadiness | null;
  /**
   * Which 外部エディタ経路 launch methods this environment has (doc-8 §7). `null` until the probe answers,
   * which the panel shows as 確認中 rather than as "no editor" — the two differ in what the user would do
   * next.
   */
  editor: EditorReadiness | null;
  /**
   * 詳細配置 (doc-8 §2.1) in force. Starts from the first read and is written back on every switch
   * (doc-8 §2.2). Held here rather than read off `loaded` because the screen changes first and the file
   * follows: a refused write costs the persistence, not the placement.
   */
  placement: DetailPlacement;
  /**
   * Why the last switch could not be stored as the 既定, or `null`. Kept apart from ⑤ 通知 because the
   * placement did take effect — only its persistence did not — and the panel states that beside the
   * switch, where the 既定 mark is (doc-8 §2.2).
   */
  placementFailure: (() => string) | null;
  /**
   * 並び順 (doc-7 §5.4) in force. Held as state rather than read off `loaded` — the way カード情報量 is —
   * because the 帯's control has to answer even when the write does not: decision-13 leaves a settings
   * file newer than this build alone, and a grid that simply did not reorder would be the whole of what
   * the user got back.
   */
  cardOrder: CardOrder;
  /**
   * Why the last choice could not be stored as the 既定, or `null`. Stated in the 帯 beside the control:
   * the order did take effect — only its persistence did not.
   */
  cardOrderFailure: (() => string) | null;
  /**
   * 注意の抑止 (decision-45 §6): whether frontmatter の注意 has been turned off. Held here as well as in
   * the file because every read has to bring it back — the layer's own tick and the 設定画面's control
   * write the same value, and this is what both of them are read from.
   */
  noticeSuppressed: boolean;
}

export function initialSettingsState(): SettingsState {
  return {
    loaded: null,
    path: null,
    directoryPresent: null,
    programs: null,
    cli: null,
    editor: null,
    placement: "sidebar",
    placementFailure: null,
    cardOrder: DEFAULT_CARD_ORDER,
    cardOrderFailure: null,
    noticeSuppressed: false,
  };
}

export interface SettingsControllerPorts {
  read: () => Promise<LoadedSettings>;
  save: (settings: AppSettings) => Promise<LoadedSettings>;
  locate: () => Promise<string>;
  directoryPresent: () => Promise<boolean>;
  /**
   * Hand the アプリ設定ディレクトリ to the OS's file manager. The launcher's own answer is not read — what
   * the 設定画面 states is whether it was taken, so this resolves to whatever the boundary returns.
   */
  openLocation: () => Promise<unknown>;
  probeCli: () => Promise<CliReadiness>;
  probeEditor: () => Promise<EditorReadiness>;
  probePrograms: () => Promise<ExternalProgramReport[]>;
  /** Raise or take down the ⑤ 通知 (doc-11 §4). The band is the shell's — every writer reaches it here. */
  notify: (text: (() => string) | null) => void;
  /**
   * The 通知 standing right now, so a write that went through can take down *its own* refusal and
   * nothing else ([`storeGridState`]).
   */
  standingNotice: () => (() => string) | null;
  /**
   * The boundary's own typed failure for a rejection. **The classifier is a port and the wording is
   * not**: `asCommandError` lives beside the IPC calls (`commands.ts`), while `unreadableDetail` and
   * `openLocationFailure` are rules in `src/lib` that this file calls directly. Passing a worded string
   * in would lose the difference between those two wordings, which are not interchangeable.
   */
  commandError: (error: unknown) => CommandError;
  /** 保存区分 as the フィルタ帯 has it right now — what decides whether a new 既定 may be adopted. */
  peekStorageFilter: () => readonly StorageSelection[];
  /** Put a 既定の保存区分 onto the live filter (doc-7 §5.2). */
  adoptStorageFilter: (next: readonly StorageSelection[]) => void;
  /** Hand the 3 値 to the grid, on the first read only ([`adopt`] says why). */
  adoptGridState: (next: GridRowState) => void;
  /**
   * Bring every root's 継続検出 in line with the setting just saved (doc-9 §3.1). Awaited inside the
   * save's guard, because this one *applies* the setting rather than observing the environment.
   */
  reconcileWatches: () => Promise<void>;
  /**
   * Whether a save is still unresolved. The 設定モーダル's three exits are held with it (doc-11 §7) —
   * two of them are not the form's own controls — so the flag lives where those exits are configured
   * and this only reports into it.
   */
  busy: (running: boolean) => void;
}

export interface SettingsController {
  /** The first read (decision-13), awaited before any root is opened. */
  load: () => Promise<void>;
  /** Where `settings.toml` is. One resolution per run — it cannot change while the app is up. */
  locate: () => Promise<void>;
  /**
   * Ask whether the アプリ設定ディレクトリ is there (doc-3 §2.1). Issued at startup and again each time
   * the 設定モーダル opens, which is where the one control this withholds lives: a 登録 in between creates
   * the folder, and the control must not still be reading the answer from before it. A rejection leaves
   * the state `null` rather than `false` — a probe that did not answer has not established a missing
   * folder.
   */
  refreshDirectory: () => Promise<void>;
  /** 起動時の CLI probe (doc-5 §5 縮退). A rejection *is* an answer here: 発行不能, with the reason. */
  probeCli: () => Promise<void>;
  /**
   * 外部エディタ経路 の probe (doc-8 §7). Run after the settings are read, because 起動指定の解決順 starts
   * at アプリ設定 — probing first would report `$EDITOR` as the editor in effect when a setting outranks
   * it.
   */
  probeEditor: () => Promise<void>;
  /**
   * Re-read the 解決結果の表示 (decision-29). Set to `null` first so the 区画 says 確認中 rather than
   * holding the previous answer beside a 外部コマンド指定 that has already changed — this runs one
   * `--version` per 外部コマンド, three of them bounded at 5 s each, which is the one panel value slow
   * enough for the gap to be visible.
   */
  refreshPrograms: () => Promise<void>;
  /**
   * Persist アプリ設定 and make the change take effect now. Resolves with the failure's text, or `null`
   * on success — the 設定画面 states it, the shell only owns the consequences. A *change* rather than a
   * value, because by the time a 保存 reaches the file another writer's value may already be in it, and
   * only the form knows which fields are its own to impose.
   */
  save: (change: SettingsChange) => Promise<(() => string) | null>;
  /** Take another 並び順 and make it the 既定 (doc-7 §5.4). */
  applyCardOrder: (next: CardOrder) => Promise<void>;
  /**
   * 注意の抑止 (decision-45 §6, doc-11 §15 ②): record that frontmatter の注意 is not to stand again.
   *
   * Written through the same writer as the two above, so the 読み取り専用 degrade decision-13 gives the
   * settings file applies here too — **a file this build may not overwrite cannot record the tick, and
   * the notice keeps standing** rather than the tick appearing to have worked. The screen value is set
   * from the write's answer for that reason, not before it: unlike 既定の詳細配置, nothing here is
   * visible until the *next* press, so there is no change the user can see to protect from a refusal.
   *
   * **Resolves with the failure's text rather than swallowing it** (PR #157 1R [P2]). The notice
   * standing again is the only thing a caller could otherwise notice, and it does not stand until the
   * *next* press — so a discarded failure leaves the user believing a tick took effect, with the
   * contradiction arriving later and detached from the act. The caller reports it (doc-11 §5's ground:
   * an unexplained outcome cannot be told from a broken one).
   */
  suppressFrontmatterNotice: () => Promise<(() => string) | null>;
  /**
   * Take another 詳細配置 and make it the 既定 (doc-8 §2.2 選んだ配置はアプリ設定に保存し、再起動後も保つ).
   * The screen changes first and the file follows: a write that fails — decision-13 refuses to overwrite
   * a settings file newer than this build — must not undo a change the user can see. What the failure
   * costs is the *persistence*, which the switch states beside the 既定 mark rather than swallowing.
   */
  applyPlacement: (next: DetailPlacement) => Promise<void>;
  /**
   * Store the 3 値 as they now stand (doc-7 §5.1 の 押下ごとの保存, decision-13 の 再起動をまたぐ保持の改訂).
   *
   * Same shape as [`applyCardOrder`]: the screen has already changed, and a refused write costs the
   * persistence rather than the fold. **The refusal is said in the ⑤ 通知** rather than beside the
   * control: the three controls are icon-only buttons in a 列ヘッダ, a レーンヘッダ行 and a menu line
   * (doc-11 §2.4), none of which has room for a sentence, and 並べ替え's refused ledger write is already
   * reported this way.
   *
   * All three values are passed on every press, not just the one that moved: `settings.toml` is written
   * whole, and this is the change against whatever is current — reading the state at issue time is what
   * keeps two quick presses from writing the first one's value twice.
   */
  storeGridState: (next: GridRowState) => Promise<void>;
  /**
   * 場所を開く (TASK-75): hand the アプリ設定ディレクトリ to the OS's file manager. Resolves with the
   * failure's text, or `null` once the launcher took it — the 設定画面 states it, as it does for 保存,
   * because this モーダル covers the 上部帯 and a 帯 would not be read until it closed.
   *
   * Nothing is read or written here and no path is sent: the boundary resolves the directory itself.
   */
  openLocation: () => Promise<(() => string) | null>;
  /**
   * Adopt a settings value the boundary returned, and hand on the parts other holders own. Called by
   * every path a settings value arrives on — the first read, a save's answer, and a read that degraded
   * to the defaults — which is why the 適用 rules are stated once here rather than at each of them.
   */
  adopt: (next: LoadedSettings) => void;
}

/** Said when a read fails outright; the boundary's own degradation to the defaults still stands. */
function readFailed(detail: string): () => string {
  return () => msg().shell.settingsReadFailed(detail);
}

export function createSettingsController(
  state: SettingsState,
  ports: SettingsControllerPorts,
): SettingsController {
  /**
   * Which detached refresh is current, so a slow one cannot overwrite a newer one's answer.
   *
   * The refreshes are detached (see [`SettingsController.save`]), so two can be in flight: save the
   * `backlog` path, reopen 設定, save the `git` path — which is the panel's own workflow, one command at
   * a time. Each launch is bounded at 5 s and the CLI's at 30 s (doc-5 §5), so the second can easily
   * finish first, and the first would then land its *older* answer on the 帯 and the 区画. Nothing
   * corrects it until the next probe, and a stale 帯 is not merely a display: it decides whether edit
   * controls are offered at all.
   *
   * Two counters rather than one, because the values have different writers. `saveRefresh` guards what
   * only the post-save refresh writes; `programsRefresh` guards the panel, which 設定モーダルを開く also
   * refreshes. One shared counter would let an open discard an in-flight save's 帯 answer — and nothing
   * would re-issue it.
   */
  let saveRefresh = 0;
  let programsRefresh = 0;
  /**
   * Which probe of the folder is the current one. Two can be in flight — the startup one and the one a
   * 設定 open issues over it — and without this the later *answer* wins rather than the later *question*:
   * a startup rejection landing after an open-time `true` would put the control back to 確認できていません
   * while the モーダル is up.
   */
  let directoryProbe = 0;
  /**
   * The ⑤ 通知 the last failed 3 値 write raised, so a later write that goes through can take *its own*
   * refusal down and nothing else.
   */
  let gridStateFailure: (() => string) | null = null;

  const write = createSettingsWriter({
    // **No `untrack` here, where the shell had one** (`history-controller.ts` says the same of its own).
    // The guard mattered while this read sat in a component; what makes it unnecessary is the call site —
    // `settings-write.ts` reads it inside `queue.then`, so no reactive context is on the stack.
    peek: () => state.loaded?.settings ?? null,
    save: ports.save,
    adopt: (loaded) => adopt(loaded),
    describeError: (error) => () => unreadableDetail(ports.commandError(error)),
  });

  function sameStorage(a: readonly StorageSelection[], b: readonly StorageSelection[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  /**
   * **既定の保存区分 and 既定の並び順 are applied to live state, each only while the screen is still
   * showing the one the settings put there.** Both are *initial* values (doc-7 §5.2, §5.4), so adopting
   * one over a filter the user has since narrowed, or over an order they have since chosen, would undo
   * their work at the moment they pressed 保存 in another panel. That test is also what keeps a refused
   * 並び順 write from being reverted: the write failed, so the file still holds the old order, and an
   * unrelated save that succeeds later brings it back — the screen no longer matches it, so it is not
   * taken. 継続検出の可否 and カード情報量 are read straight off `loaded` by whoever draws them.
   *
   * 既定の詳細配置 and the 3 値 are adopted on the *first* read only. The placement is the one the app
   * opens with (doc-8 §2.2 再起動後も保つ); changing it later from the 設定画面 moves the 既定 without
   * moving the panel, which the switch shows as 次回起動時はこちら. Every later read of the 3 値 is the
   * answer to a write this screen just made, and re-seeding from it would undo a fold made while the
   * save was in flight.
   */
  function adopt(next: LoadedSettings): void {
    const previous = state.loaded?.settings.default_storage_filter ?? DEFAULT_FILTER.storage;
    const untouched = sameStorage(ports.peekStorageFilter(), previous);
    const previousOrder = state.loaded?.settings.default_card_order ?? DEFAULT_CARD_ORDER;
    const orderUntouched = state.cardOrder === previousOrder;
    const first = state.loaded === null;
    state.loaded = next;
    if (first) {
      state.placement = next.settings.default_detail_placement;
      // **The columns are normalized here and the rows are not** — `restoredColumns` needs nothing but
      // the value, while the rows are checked against the ledger, which has not been read yet at this
      // point in startup. That half runs on every ledger answer instead (`LedgerControllerPorts`'s
      // `pruneRowState`), which is also what makes 登録解除 drop the row's values.
      ports.adoptGridState({
        collapsedColumns: restoredColumns(next.settings.collapsed_columns),
        foldedRows: [...next.settings.folded_rows],
        hidden: [...next.settings.hidden_rows],
      });
    }
    if (untouched) {
      ports.adoptStorageFilter(next.settings.default_storage_filter);
    }
    if (orderUntouched) {
      state.cardOrder = next.settings.default_card_order;
    }
    // Taken from **every** read, unlike 既定の保存区分 and 既定の並び順 above (this file's own note on
    // those two): they are *initial* values a live screen may have moved on from, while 注意の抑止 is
    // the current setting itself — there is no live value here for the file to overwrite.
    state.noticeSuppressed = next.settings.suppress_frontmatter_notice;
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
    // 起動指定の解決順 starts at アプリ設定 (doc-8 §7), so the probe's answer changes with this save. The
    // panel names the editor it would launch, and a stale name would say `$EDITOR` while the launch used
    // the setting just typed.
    try {
      const probed = await ports.probeEditor();
      if (run !== saveRefresh) {
        return;
      }
      state.editor = probed;
    } catch (error) {
      if (run !== saveRefresh) {
        return;
      }
      const detail = unreadableDetail(ports.commandError(error));
      ports.notify(() => msg().shell.editorProbeFailed(detail));
    }
    // 外部コマンド解決の順序 starts at the 外部コマンド指定 (decision-29), so this save changes what the
    // 解決結果の表示 reports — for the same reason the editor is re-probed just above.
    await refreshPrograms();
    // And the 縮退帯 with it. `backlog_cli` is the first step of the same order (doc-5 §4 順序 1), so a
    // save can turn 発行不能 into 発行できる or the other way round — and until this ran, neither took
    // effect before a restart. That is the whole of what TASK-156 is for: the user reaches the setting
    // from inside Atlas precisely because they cannot issue updates, and a fix that needs a restart to
    // be believed is not a means they can reach.
    //
    // Unconditional, not "only when `backlog_cli` changed": a save takes a *change function* rather than
    // a value (アプリ設定 is written from outside the form too), so what the file now holds is not
    // knowable here without re-deriving it. One `--version` per save is the cost of not having to know.
    //
    // Separate from the 解決結果の表示's own `backlog` row on purpose (decision-29): that row says whether
    // the program started, this says whether its version meets `MIN_VERSION`. Deriving one from the other
    // would make the band answer a question it does not ask.
    try {
      const probed = await ports.probeCli();
      if (run !== saveRefresh) {
        return;
      }
      state.cli = probed;
    } catch (error) {
      if (run !== saveRefresh) {
        return;
      }
      const detail = unreadableDetail(ports.commandError(error));
      ports.notify(() => msg().shell.cliProbeFailed(detail));
    }
  }

  async function refreshPrograms(): Promise<void> {
    const run = (programsRefresh += 1);
    state.programs = null;
    try {
      const probed = await ports.probePrograms();
      if (run !== programsRefresh) {
        return;
      }
      state.programs = probed;
    } catch (error) {
      if (run !== programsRefresh) {
        return;
      }
      const detail = unreadableDetail(ports.commandError(error));
      ports.notify(() => msg().shell.externalProbeFailed(detail));
    }
  }

  return {
    async load(): Promise<void> {
      // A rejection here is not fatal: the boundary already degrades a missing or broken file to the
      // defaults, so this only fires if the IPC call itself failed, and the defaults stand.
      try {
        adopt(await ports.read());
      } catch (error) {
        ports.notify(readFailed(unreadableDetail(ports.commandError(error))));
      }
    },
    async locate(): Promise<void> {
      // A failure leaves it `null`, which draws no row — it withholds no control, since knowing the
      // path is not what makes an edit possible.
      try {
        state.path = await ports.locate();
      } catch {
        state.path = null;
      }
    },
    async refreshDirectory(): Promise<void> {
      const issued = (directoryProbe += 1);
      try {
        const present = await ports.directoryPresent();
        if (issued === directoryProbe) {
          state.directoryPresent = present;
        }
      } catch {
        if (issued === directoryProbe) {
          state.directoryPresent = null;
        }
      }
    },
    async probeCli(): Promise<void> {
      try {
        state.cli = await ports.probeCli();
      } catch (error) {
        state.cli = { state: "unavailable", detail: unreadableDetail(ports.commandError(error)) };
      }
    },
    async probeEditor(): Promise<void> {
      // Left `null` on failure — the panel then withholds both launch controls as 確認中, which is what
      // the state actually is; the notice says why it will stay that way.
      try {
        state.editor = await ports.probeEditor();
      } catch (error) {
        const detail = unreadableDetail(ports.commandError(error));
        ports.notify(() => msg().shell.editorProbeFailed(detail));
      }
    },
    refreshPrograms,
    async save(change: SettingsChange): Promise<(() => string) | null> {
      const before = state.loaded?.settings.watch_external_changes ?? true;
      ports.busy(true);
      let failure: (() => string) | null;
      try {
        failure = await write(change);
        if (failure === null) {
          // 発行が通った事実そのものは ⑤ 通知 に載せない (doc-11 §4). 保存する closes the モーダル only when
          // the write landed, so the layer coming down is the report, and a 帯 would restate it at the
          // top of a screen the user is not looking at yet. Cleared rather than left alone, for the
          // reason a reorder clears it: a 帯 from before this save is no longer true of the settings now
          // in force, and beside a save that worked it reads as this one having failed.
          ports.notify(null);
          // **Inside the guard, unlike the probes below.** This one *applies* the setting rather than
          // observing what the environment now looks like: 継続検出 being off has to mean the watches are
          // actually stopped. It is also N sequential boundary calls, one per registered root, so
          // leaving it outside would reopen exactly the window detaching the probes closed — the form
          // editable and closable while a promise that will fire `onsaved` is still running.
          if (before !== (state.loaded?.settings.watch_external_changes ?? true)) {
            await ports.reconcileWatches();
          }
        }
      } finally {
        ports.busy(false);
      }
      if (failure !== null) {
        return failure;
      }
      // **The probes are deliberately not awaited.** What 保存する waits on is the save — the write and
      // the applying of it, both inside the guard above — and `Settings.svelte` closes the モーダル when
      // this resolves. Anything awaited past this point holds the close open for as long as it takes,
      // with the busy flag already down, so the user can go on editing or close and reopen the form; a
      // late resolution would then fire `onsaved` against a モーダル holding a *different* 下書き, closing
      // it with no 破棄前確認 and losing what was typed (doc-8 §6.3).
      //
      // The window existed before 解決結果の表示 but was cheap; that put four subprocess launches in it —
      // three bounded at 5 s and the CLI's at 30 s (doc-5 §5). Detaching removes it outright rather than
      // narrowing it, and nothing is lost: every value the refresh writes belongs to this controller,
      // not to that form.
      void refreshAfterSave();
      return null;
    },
    async applyCardOrder(next: CardOrder): Promise<void> {
      state.cardOrder = next;
      state.cardOrderFailure = await write((current) => ({
        ...current,
        default_card_order: next,
      }));
    },
    async suppressFrontmatterNotice(): Promise<(() => string) | null> {
      return await write((current) => ({ ...current, suppress_frontmatter_notice: true }));
    },
    async applyPlacement(next: DetailPlacement): Promise<void> {
      state.placement = next;
      // Only this one field is imposed; everything else comes from the settings as they are when the
      // write is issued, so a form save that landed in between is not carried back to its old values.
      state.placementFailure = await write((current) => ({
        ...current,
        default_detail_placement: next,
      }));
    },
    async storeGridState(next: GridRowState): Promise<void> {
      const failure = await write((current) => ({
        ...current,
        collapsed_columns: [...next.collapsedColumns],
        folded_rows: [...next.foldedRows],
        hidden_rows: [...next.hidden],
      }));
      if (failure !== null) {
        ports.notify(failure);
        gridStateFailure = failure;
        return;
      }
      // A write that went through supersedes the failure the last one reported, so leaving it up would
      // have the 帯 state a refusal that no longer holds — the next press *is* the retry. Cleared by
      // identity rather than unconditionally, which is what a reorder does for the ledger: a press here
      // is frequent and is not the retry of whatever else may have raised a 通知 since, so an unrelated
      // report must not be swallowed by it.
      if (gridStateFailure !== null && ports.standingNotice() === gridStateFailure) {
        ports.notify(null);
      }
      gridStateFailure = null;
    },
    async openLocation(): Promise<(() => string) | null> {
      try {
        await ports.openLocation();
        return null;
      } catch (error) {
        // Worded where it is read, not here: the failure outlives this press (TASK-187).
        const failed = ports.commandError(error);
        return () => openLocationFailure(failed);
      }
    },
    adopt,
  };
}
