<script lang="ts">
  // 設定画面 (decision-13, doc-7 §2.1「設定」). The items decision-13's table lists, and nothing else.
  //
  // Two of them are written from outside this form as well — 既定の詳細配置 by the panel's switch
  // (doc-8 §2.2) and 既定の並び順 by the 絞り込み帯 (doc-7 §5.4) — which is what `mergeDraft` is for.
  //
  // The component holds a draft and issues one 保存; it never writes as the user types. Same reason the
  // detail panel uses 明示保存 (doc-8 §6.3): a half-typed editor path saved on every keystroke would be
  // the 起動指定 in force for as long as it took to finish typing.
  //
  // **The two ways out are the 下部操作行** (TASK-74): 変更せずに閉じる and 保存する, outside the body's
  // scroll so they are on screen wherever the form has been scrolled to. Before, the only 閉じる was in
  // the header and said nothing about the draft, so a user who changed a value and closed got no hint
  // that nothing had been written. The pair states the choice instead of leaving it to be inferred.
  //
  // 「ここに無い項目」— the section that stated why 列折畳み・行折畳み・行非表示 are not held (decision-13)
  // — is gone with it (AC #3). It answered a question the screen does not raise: nothing here offers
  // those switches, and the file's rules are decision-13's to state. **The three are now held after
  // all** (decision-13 の 再起動をまたぐ保持の改訂, TASK-148), which does not bring the section back: they
  // still have no control here — the grid's own controls write them, and this form only has to carry
  // them through a save (`mergeDraft`).
  import { untrack } from "svelte";
  import type { Availability } from "../lib/availability";
  import { AVAILABLE, withheld } from "../lib/availability";
  import Icon from "../lib/icons/Icon.svelte";
  import {
    CARD_DENSITIES,
    cardDensityLabel,
    cardDensityNote,
    closeWithoutSavingLabel,
    DETAIL_PLACEMENTS,
    detailPlacementLabel,
    EXTERNAL_COMMANDS,
    externalCommandHelp,
    noChangesReason,
    openLocationLabel,
    openLocationTitle,
    saveLabel,
    savingReason,
    STORAGE_SELECTIONS,
    storageSelectionLabel,
    watchOffNote,
    commandPathOf,
    editorArgsText,
    editorCommandOf,
    emptyStorageWarning,
    isDirty,
    mergeDraft,
    openLocationAvailability,
    probeSummary,
    programResolved,
    programSourceLabel,
    saveAvailability,
    statusNotice,
    toggleStorage,
  } from "../lib/settings";
  import { CARD_ORDER_CHOICES, cardOrderLabel } from "../lib/swimlane";
  import { LANGUAGES, isLanguage } from "../lib/messages";
  import { messages } from "../lib/messages-context";
  import {
    RECORDED_THEME_IDS,
    themeUnsetLabel,
    themeLabel,
  } from "../lib/theme";
  import type {
    AppSettings,
    CardDensity,
    DetailPlacement,
    ExternalProgramReport,
    LoadedSettings,
    StorageSelection,
  } from "../lib/wire";

  interface Props {
    /** The settings in force and why (decision-13). `null` while the first read is in flight. */
    loaded: LoadedSettings | null;
    /**
     * Where Atlas's own two files are (doc-3 §2.1, decision-13). Shown because both are hand-editable
     * and this 区画 is the only place that says where they live. `null` while the resolution is
     * unknown, which draws no row rather than a placeholder — the paths are resolved once at startup
     * and never retried, so nothing here is 確認中.
     *
     * **Both `null` leaves the 区画 stating no location**, since both resolutions are the same one
     * (`app_config_dir()`) and fail together. No reason is drawn for it, which is deliberate: the
     * failure is not about anything the user did or can act on here, and 場所を開く is left alone
     * because the folder is reachable whether or not this screen can name it. What the 区画 would
     * still owe a reason for is a *withheld control* (doc-11 §5), and there is none in that state.
     */
    settingsPath: string | null;
    ledgerPath: string | null;
    /**
     * Whether the folder those two files live in is there yet (doc-3 §2.1), or `null` while the
     * boundary's answer is not in hand. What withholds 場所を開く — the control opens the *folder*,
     * which the first save of either file creates, so neither file's own absence can stand in for
     * this. Asked of the shell rather than derived here: this form is given the settings, and the
     * settings' absence is precisely the fact that used to be mistaken for this one.
     */
    directoryPresent: boolean | null;
    /**
     * 解決結果の表示 (decision-29): what each 外部コマンド resolved to, and whether it starts. `null`
     * while the probe is in flight, which draws 確認中 rather than an empty panel — unlike the paths
     * above, this answer *is* retried (after every save), so "not yet" is a real state here.
     *
     * **All three, `backlog` included.** It and the 縮退帯 (`CliReadiness`) do not answer one question
     * twice: this says whether the program started, that says whether its version meets the minimum,
     * and a CLI below the minimum starts fine. Leaving it out was the first draft's mistake — with the
     * band down, the screen then said nothing at all about the one command it exists for.
     */
    programs: ExternalProgramReport[] | null;
    /**
     * Persist the draft. Resolves with the failure's text, or `null` on success.
     *
     * A *change* against the settings current at write time, not a snapshot: アプリ設定 is written from
     * outside this form too (the 詳細配置 switch, doc-8 §2.2; the 帯's 並び順, doc-7 §5.4), and by the
     * time this save reaches the file one of those values may already be in it. Only this form knows which fields are its own to impose — the ones
     * the user edited — so it decides that here rather than sending the whole document blind.
     */
    onsave: (change: (current: AppSettings) => AppSettings) => Promise<(() => string) | null>;
    /**
     * Open the アプリ設定ディレクトリ in the OS's file manager (TASK-75). Resolves with the failure's
     * text, or `null` once the launcher took it. The shell owns the call for the same reason it owns
     * `onsave`: the path is Atlas's own and is resolved at the boundary, never sent from here.
     */
    onopenLocation: () => Promise<(() => string) | null>;
    /**
     * Whether a save issued from here is still unresolved. Held by the shell rather than here, the way
     * `ProjectRegister` takes `busy`: the same flag has to withhold this form's controls *and* stop the
     * モーダル being dismissed out from under the write (`Modal.svelte`'s Escape reaches the shell, not
     * this component), and one fact must not be two flags.
     */
    saving: boolean;
    /**
     * 変更せずに閉じる: leave without writing, and without being asked again.
     *
     * No 破棄前確認 in front of this one (doc-11 §7): the question and this control's own wording say
     * the same thing, so a user who read the label and pressed it has already answered. The × and
     * Escape do go through the question — they say only 閉じる, and Escape says nothing at all — which
     * is the same 役割の別 §7 draws between this row and the corner, not an exception to it.
     *
     * It still reaches the shell's one close request, which is what refuses it while a save is
     * unresolved; the difference is carried into that request, not around it.
     */
    ondiscard: () => void;
    /**
     * Report whether the 下書き differs from the file. What the shell's guard reads — held there rather
     * than here because two of the three exits are not this form's controls.
     */
    ondirty: (dirty: boolean) => void;
    /**
     * The write landed; the モーダル may go. Its own way out rather than `ondiscard` above: that one
     * leaves the 下書き unwritten and says so, this one wrote it — nothing is being discarded either
     * way, but only one of them is true to call 変更せずに閉じる.
     */
    onsaved: () => void;
  }

  let {
    loaded,
    settingsPath,
    ledgerPath,
    directoryPresent,
    programs,
    onsave,
    onopenLocation,
    saving,
    ondiscard,
    ondirty,
    onsaved,
  }: Props = $props();

  /** The 文言表 in force (decision-35), read through the accessor so a language change redraws. */
  const t = messages();

  /** The draft the form edits. Re-seeded whenever the boundary hands back a new value. */
  let draft = $state<AppSettings | null>(null);
  /**
   * The result of the last 保存 attempt: a thunk wording its failure, or `null` once it succeeded.
   *
   * **A thunk rather than the sentence** (TASK-187, following the shell's 通知): the failure stays on
   * screen after the press that raised it, and every sentence carries a 表示言語 since the 文言表 —
   * a captured string would keep the language it was worded in while the モーダル around it redrew.
   */
  let failure = $state<(() => string) | null>(null);
  /**
   * The values the draft was seeded from — what tells a field the user edited from one they left alone
   * (`mergeDraft`). Plain, not `$state`: it is read only inside the effect below, which must not depend
   * on it.
   */
  let baseline: AppSettings | null = null;

  $effect(() => {
    // Seeded from `loaded`: a save returns a fresh `LoadedSettings`, which lands here and becomes the
    // new baseline, so 変更あり goes back to false without the form being rebuilt.
    //
    // But this screen is not the only writer any more — choosing a 詳細配置 stores it as the 既定
    // (doc-8 §2.2) while this form may be open with unsaved input — so a new value is *merged* rather
    // than assigned: untouched fields follow the file, edited ones stay as the user left them. The
    // reads are untracked because the merge writes what it reads; `loaded` is the whole dependency.
    const settings = loaded?.settings;
    untrack(() => {
      if (settings === undefined) {
        draft = null;
        baseline = null;
        failure = null;
        return;
      }
      // The editor fields are two controls over one field, so they are folded in before the merge and
      // read back out of it — otherwise a half-typed 起動指定 would be lost to an outside write.
      const current = draft === null ? null : asSaved($state.snapshot(draft));
      const merged = mergeDraft(baseline, current, settings);
      baseline = { ...settings };
      draft = merged;
      editorProgram = merged.external_editor?.program ?? "";
      editorArgs = editorArgsText(merged.external_editor);
      for (const command of EXTERNAL_COMMANDS) {
        commandPaths[command.field] = merged[command.field] ?? "";
      }
      failure = null;
    });
  });

  let notice = $derived(loaded === null ? null : statusNotice(loaded.status));
  let availability = $derived<Availability>(
    loaded === null ? withheld(t().settings.loadingReason) : saveAvailability(loaded.status),
  );
  /**
   * The draft as it would be saved: the form's own fields, plus the 外部エディタ指定 read out of its two
   * text controls. Derived rather than written back on `change`, so a program typed but not yet blurred
   * still counts as a change — otherwise 保存 would stay disabled while the cursor is in the field the
   * user just edited, and they would have to click elsewhere before the button they are aiming for
   * became pressable. Nothing is persisted from here: 保存 is still the only writer (doc-8 §6.3 の
   * 明示保存 と同じ理由).
   */
  let pending = $derived.by(() => (draft === null ? null : asSaved(draft)));
  let dirty = $derived(
    pending !== null && loaded !== null && isDirty(pending, loaded.settings),
  );
  // 未保存入力があるか (doc-8 §6.3) as the shell's guard needs it. The same value the 保存する control
  // reads, so the button that says there is nothing to save and the question that says there is
  // something to lose cannot both be right.
  $effect(() => {
    ondirty(dirty);
  });
  let storageWarning = $derived(
    draft === null ? null : emptyStorageWarning(draft.default_storage_filter),
  );
  /**
   * The theme names to offer. A stored name this build does not record — a hand-edited file, or a
   * file written by a build that had more themes — is listed too, marked as such: dropping it from
   * the list would leave the select with nothing selected and quietly rewrite the user's choice on
   * the next save. Such a name paints as 未選択 (`theme.ts` の `themeAttribute`), which is what the
   * marked option tells the user rather than leaving them with a selection that does nothing.
   */
  let themeChoices = $derived.by(() => {
    const stored = draft?.theme ?? null;
    return stored === null || RECORDED_THEME_IDS.includes(stored)
      ? RECORDED_THEME_IDS
      : [stored, ...RECORDED_THEME_IDS];
  });

  /**
   * The 表示言語 to offer, built the same way `themeChoices` is and for the same reason: a stored
   * value this build has no 文言表 for stays in the list, marked, so saving does not silently drop
   * it. Such a value draws in the OS's language until it is changed (`resolveLanguage`).
   */
  let languageChoices = $derived.by(() => {
    const stored = draft?.language ?? null;
    return stored === null || isLanguage(stored) ? LANGUAGES : [stored, ...LANGUAGES];
  });

  /**
   * The 外部エディタ指定 as two fields (see `settings.ts`: never one command line). Seeded by the merge
   * effect above rather than by an effect of their own: they are part of the same value, and a second
   * seeding effect would overwrite the merged result with the file's.
   */
  let editorProgram = $state("");
  let editorArgs = $state("");

  /**
   * The three 外部コマンド指定 as text (decision-29). Strings rather than a binding onto the draft:
   * "unset" is an *absent key* in the file, which an `<input>` cannot hold, and `commandPathOf` is
   * where that conversion is decided. Seeded by the merge effect above for the same reason the editor
   * fields are — a second seeding effect would overwrite the merged result with the file's.
   */
  let commandPaths = $state<Record<string, string>>(
    Object.fromEntries(EXTERNAL_COMMANDS.map((command) => [command.field, ""])),
  );

  /**
   * Which row's `?` is open, or `null`. One at a time: two notes open at once would push the fields
   * apart twice over, and the question each answers is about one command.
   */
  let helpOpen = $state<string | null>(null);

  /** The 解決結果 for one command, or `undefined` while the probe has not answered. */
  function reportFor(name: string): ExternalProgramReport | undefined {
    return programs?.find((report) => report.name === name);
  }

  /**
   * A settings value with the fields that live in their own controls folded back in — the 外部エディタ
   * 指定 and the three 外部コマンド指定. Used both for what would be saved and for what the merge
   * carries, so a half-typed path cannot be lost to a write from outside this form.
   */
  function asSaved(settings: AppSettings): AppSettings {
    const next: AppSettings = {
      ...settings,
      external_editor: editorCommandOf(editorProgram, editorArgs),
    };
    for (const command of EXTERNAL_COMMANDS) {
      const path = commandPathOf(commandPaths[command.field]);
      if (path === undefined) {
        delete next[command.field];
      } else {
        next[command.field] = path;
      }
    }
    return next;
  }

  /**
   * Whether 保存する may be pressed, and why not when it may not (doc-11 §5). The 保留判定 is the tag and
   * the 保留理由 rides beside it: held as a bare `string | null` the two are one value, and the day a
   * 理由文 is replaced with `null` the control silently becomes pressable — which is how the 概要区画's
   * own 保存 broke before TASK-127 (`availability.ts`).
   *
   * Ordered as the obstacles are: a settings file that cannot be written blocks 保存 whatever the form
   * holds, and 変更はありません is only worth saying once writing is possible at all.
   */
  let saveAvailable = $derived.by((): Availability => {
    if (availability.state === "withheld") {
      return availability;
    }
    if (saving) {
      return withheld(savingReason());
    }
    return dirty ? AVAILABLE : withheld(noChangesReason());
  });
  /**
   * 変更せずに閉じる is withheld while a save is unresolved. Leaving then would take away the panel that
   * is to report the write's outcome, and it would do it under a label that says nothing was written —
   * while the write already issued goes on to store the draft. The shell holds the same flag and turns
   * away Escape with it, so both ways out are closed by one fact.
   */
  let closeAvailable = $derived(saving ? withheld(savingReason()) : AVAILABLE);
  /**
   * The one line the 下部操作行 gives for a control it is withholding, and the one element both point at.
   * One rather than two, because while a save is in flight *both* are withheld by the same one
   * circumstance, and saying it twice in the same row would name one situation two ways.
   */
  let footerReason = $derived(
    closeAvailable.state === "withheld"
      ? closeAvailable.reason
      : saveAvailable.state === "withheld"
        ? saveAvailable.reason
        : null,
  );
  /**
   * Whether that line is printed. 変更はありません is not (TASK-74 AC #3): the 下部操作行 shows both
   * exits at once, so spelling out "you have changed nothing" adds a line that says what the disabled
   * 保存する already shows. It is still *reachable* — `aria-disabled` keeps the button focusable and
   * `aria-describedby` points at the text (doc-11 §5 の 2 つ目の形), which is why the element stays in
   * the DOM and is only hidden visually. The obstacles that are not the user's own doing (a file this
   * build must not overwrite, a write still running) keep their printed line.
   */
  let footerReasonPrinted = $derived(footerReason !== null && footerReason !== noChangesReason());
  const FOOTER_REASON_ID = "settings-footer-reason";

  /** The failure of the last 場所を開く, or `null`. Reported beside the button, not as a 上部帯 通知:
   *  this モーダル covers the 上部帯 (`Modal.svelte`), so a 帯 would not be read until it closed. */
  let locationFailure = $state<(() => string) | null>(null);
  /** Whether a launch has been issued and not yet answered. */
  let opening = $state(false);
  /**
   * Whether 場所を開く may be pressed, and why not. The launch in flight is one of the reasons, not a
   * state beside them: a control that goes `aria-disabled` while its `aria-describedby` stays empty is
   * the 理由の無い無効化 doc-11 §5 refuses, and a user who cannot see the pointer cannot tell it from a
   * fault. 判定 and 理由 are separate fields of the one value for the same section's other reason.
   */
  let locationAvailability = $derived(openLocationAvailability(directoryPresent, opening));
  const LOCATION_BLOCKED_ID = "settings-location-blocked";

  function setStorage(value: StorageSelection, on: boolean): void {
    if (draft === null) {
      return;
    }
    draft.default_storage_filter = toggleStorage(draft.default_storage_filter, value, on);
  }

  /**
   * 保存する: write, and close only if the write landed (TASK-74 AC #2). A failure keeps the モーダル up
   * with its text beside the button — closing on a failed save would take the draft away and leave the
   * user to find out from the next start that nothing was stored.
   *
   * `onsaved`, not `ondiscard`: the 下書き was written, so 変更せずに閉じる would be false of what just
   * happened. Nothing here reads `dirty` to tell the two apart — it is decided by which route is
   * taken, not by a value that has to have caught up with the write by the time this line runs.
   */
  async function saveAndClose(): Promise<void> {
    if (saveAvailable.state === "withheld") {
      return;
    }
    await save();
    if (failure === null) {
      onsaved();
    }
  }

  async function save(): Promise<void> {
    if (pending === null || availability.state === "withheld" || saving) {
      return;
    }
    // `pending`, not `draft`: the editor fields are part of the value being saved, and they are only
    // folded in there. A half-typed program is never the 起動指定 in force all the same — this is the
    // one place anything is written.
    //
    // Both are read before the await: the value is the one the user pressed 保存 on, and the baseline is
    // what says which of its fields they edited. `mergeDraft` then imposes only those on whatever the
    // settings are when the write is issued, so a 詳細配置 stored in the meantime survives this save.
    const value = $state.snapshot(pending);
    const base = baseline;
    // `saving` is not set here: the shell raises it around the same call, because it also has to turn
    // Escape away for as long as this is unresolved.
    failure = await onsave((current) => (base === null ? value : mergeDraft(base, value, current)));
  }

  /** 場所を開く (TASK-75 AC #1). Nothing is read or written; the OS opens the directory or says why not. */
  async function openLocation(): Promise<void> {
    if (locationAvailability.state === "withheld") {
      return;
    }
    opening = true;
    try {
      locationFailure = await onopenLocation();
    } finally {
      opening = false;
    }
  }
</script>

<div class="settings">
  <!-- 閉じる is not here any more (TASK-74): both ways out are the 下部操作行 at the foot of this box. -->
  <header>
    <h2>{t().settings.heading}</h2>
  </header>

  <!-- The one box that scrolls. Bounded by `.settings`' own height so the 下部操作行 below stays put
       (AC #1) — the backdrop's scroll, which used to move the whole モーダル, never comes into play at
       this size. -->
  <div class="body">
    {#if notice !== null}
      <!-- decision-13 既定値で動いている旨 (AC #6): stated whenever these values did not come from the
           file, so "my settings are gone" and "this build will not write your newer file" never look
           the same. -->
      <p class="warn">{notice}</p>
    {/if}

    {#if draft === null}
      <p class="hint">{t().settings.loadingHint}</p>
    {:else}
      <section>
        <h3>{t().settings.themeHeading}</h3>
        <label>
          <select bind:value={draft.theme}>
            <option value={null}>{themeUnsetLabel()}</option>
            {#each themeChoices as name (name)}
              <option value={name}>
                {themeLabel(name) ?? t().settings.unrecorded(name)}
              </option>
            {/each}
          </select>
        </label>
      </section>

      <!-- 表示言語 (decision-35). Beside 表示テーマ because the two are the same kind of item — both
           govern how the whole screen is drawn rather than what any one 区画 shows — and because
           their 未選択 options have to read alike, which is easiest to keep true when they are
           adjacent. -->
      <section>
        <h3>{t().settings.languageHeading}</h3>
        <label>
          <select bind:value={draft.language}>
            <option value={null}>{t().settings.languageUnset}</option>
            {#each languageChoices as name (name)}
              <option value={name}>
                {isLanguage(name)
                  ? t().settings.languageName[name]
                  : t().settings.unrecorded(name)}
              </option>
            {/each}
          </select>
        </label>
      </section>

      <section>
        <h3>{t().settings.cardDensityHeading}</h3>
        {#each CARD_DENSITIES as value (value)}
          <label class="choice">
            <input
              type="radio"
              name="card-density"
              checked={draft.card_density === value}
              onchange={() => draft !== null && (draft.card_density = value)}
            />
            {cardDensityLabel(value)}
          </label>
        {/each}
        <p class="hint">{cardDensityNote()}</p>
      </section>

      <section>
        <h3>{t().settings.defaultStorageHeading}</h3>
        {#each STORAGE_SELECTIONS as value (value)}
          <label class="choice">
            <input
              type="checkbox"
              checked={draft.default_storage_filter.includes(value)}
              onchange={(event) => setStorage(value, event.currentTarget.checked)}
            />
            {storageSelectionLabel(value)}
          </label>
        {/each}
        {#if storageWarning !== null}
          <p class="warn">{storageWarning}</p>
        {/if}
      </section>

      <section>
        <h3>{t().settings.defaultPlacementHeading}</h3>
        {#each DETAIL_PLACEMENTS as value (value)}
          <label class="choice">
            <input
              type="radio"
              name="detail-placement"
              checked={draft.default_detail_placement === value}
              onchange={() =>
                draft !== null && (draft.default_detail_placement = value)}
            />
            {detailPlacementLabel(value)}
          </label>
        {/each}
      </section>

      <!-- 既定の並び順 (doc-7 §5.4, decision-13). The 絞り込み帯 writes the same item, so this is the
           second place it can be set rather than the only one — which is why it is a `<select>` of the
           same ten entries, in the same order, taking its 語 from the same `cardOrderLabel`. -->
      <section>
        <h3>{t().settings.defaultOrderHeading}</h3>
        <label>
          <select bind:value={draft.default_card_order}>
            {#each CARD_ORDER_CHOICES as value (value)}
              <option {value}>{cardOrderLabel(value)}</option>
            {/each}
          </select>
        </label>
      </section>

      <section>
        <h3>{t().settings.watchHeading}</h3>
        <label class="choice">
          <input type="checkbox" bind:checked={draft.watch_external_changes} />
          {t().settings.watchToggle}
        </label>
        <p class="hint">{watchOffNote()}</p>
      </section>

      <!-- 外部コマンド (decision-29, TASK-156). One row per command: 状態の印, label, field, `?`.
           The 印 and the label's colour carry the answer the user came for — did Atlas find this
           tool — so there is no separate 解決結果 区画 restating it, and no paragraph under each
           field: what each command is *for* is behind its `?` (doc-11 §8).

           Placed before 外部エディタ指定 because that one is the fourth 外部コマンド and reads as a
           special case of this 区画 — it is the only one taking arguments, which is why it keeps its
           own. -->
      <section>
        <h3>{t().settings.externalCommandsHeading}</h3>
        <p class="hint">{t().settings.externalCommandsHint}</p>
        {#each EXTERNAL_COMMANDS as command (command.field)}
          {@const report = reportFor(command.name)}
          {@const resolved = programResolved(report?.outcome ?? null)}
          <div class="command">
            <!-- 族を持たない状態の印 / 印グリフ (doc-11 §2.4). Not inside a control, so the wrapper
                 carries `role="img"` and the word — the figure itself is `aria-hidden` and leaves
                 nothing to read. -->
            <span
              class="mark"
              class:unresolved={resolved === false}
              role="img"
              aria-label={resolved === null
                ? t().settings.probePending
                : resolved
                  ? t().settings.probeResolved
                  : t().settings.probeUnresolved}
            >
              {#if resolved === null}
                <span class="pending" aria-hidden="true">…</span>
              {:else}
                <Icon name={resolved ? "square-check" : "triangle-alert"} />
              {/if}
            </span>
            <label class:unresolved={resolved === false}>
              <span class="name">{command.label}</span>
              <input type="text" bind:value={commandPaths[command.field]} />
            </label>
            <!-- アイコンのみのボタン (doc-11 §2.4): the name is the `aria-label`, and `aria-expanded`
                 is what says the note below is this button's. -->
            <button
              type="button"
              class="help"
              aria-label={t().settings.commandHelpLabel(command.label)}
              title={t().settings.commandHelpLabel(command.label)}
              aria-expanded={helpOpen === command.field}
              onclick={() => (helpOpen = helpOpen === command.field ? null : command.field)}
            >
              <Icon name="circle-question-mark" />
            </button>
            {#if helpOpen === command.field}
              <p class="note" role="note">
                {externalCommandHelp(command.field)}
                {#if report !== undefined}
                  <br />
                  {programSourceLabel(report.source)}: {report.program}
                  <br />
                  {probeSummary(report.outcome)}
                {/if}
              </p>
            {/if}
          </div>
        {/each}
      </section>

      <section>
        <h3>{t().settings.editorHeading}</h3>
        <p class="hint">{t().settings.editorHint}</p>
        <label>
          <span>{t().settings.editorProgramLabel}</span>
          <input
            type="text"
            bind:value={editorProgram}
            placeholder={t().settings.editorProgramPlaceholder}
          />
        </label>
        <label>
          <span>{t().settings.editorArgsLabel}</span>
          <textarea rows="3" bind:value={editorArgs} placeholder="-w"></textarea>
        </label>
      </section>

      <!-- ファイルの場所 (doc-3 §2.1) — Atlas 自身が書く 2 つのファイルの保存場所を述べる唯一の区画。
           Moved out of the foot and into the form (TASK-74/75): the 下部操作行 holds the two exits and
           nothing else, and a path belongs beside the control that opens it — 開く操作の隣がパスの置き場,
           which is what doc-8 §7 already asks of the 外部エディタ経路's own path line.
           台帳ファイル joined it in TASK-136, which took the path off the 登録モーダル. Both rows sit in
           one 区画 because the control opens the *folder*, and the folder is the same one — a second
           区画 with its own heading would put the 台帳 beside a control that never mentions it. -->
      <section class="location">
        <h3>{t().settings.locationHeading}</h3>
        <dl>
          {#if settingsPath !== null}
            <dt>{t().settings.settingsFileTerm}</dt>
            <dd class="path">{settingsPath}</dd>
          {/if}
          {#if ledgerPath !== null}
            <dt>{t().settings.ledgerFileTerm}</dt>
            <dd class="path">{ledgerPath}</dd>
          {/if}
        </dl>
        <div class="row">
          <!-- `aria-disabled` rather than `disabled`, so the reason below stays reachable without a
               pointer (doc-11 §5). -->
          <button
            type="button"
            aria-disabled={locationAvailability.state === "withheld"}
            aria-describedby={locationAvailability.state === "ready" ? undefined : LOCATION_BLOCKED_ID}
            title={locationAvailability.state === "withheld"
              ? locationAvailability.reason
              : openLocationTitle()}
            onclick={openLocation}
          >
            {openLocationLabel()}
          </button>
        </div>
        {#if locationAvailability.state === "withheld"}
          <p class="hint" id={LOCATION_BLOCKED_ID}>{locationAvailability.reason}</p>
        {/if}
        {#if locationFailure !== null}
          <p class="warn">{locationFailure()}</p>
        {/if}
      </section>
    {/if}
  </div>

  <!--
    下部操作行 (TASK-74 AC #1): the two ways out of the モーダル, outside the scrolling body so they are
    on screen wherever the form has been scrolled to. 保存する is last, on the side the affirmative
    control takes on this platform.
  -->
  <footer>
    {#if failure !== null}
      <!-- Beside the press that produced it. The failure used to be printed at the top of the panel,
           which a scrolled form would have carried out of sight at the moment 保存する was pressed. -->
      <p class="warn">{t().action.saveFailed(failure())}</p>
    {/if}
    <!-- 無効化の理由 (doc-11 §5). Kept in the DOM whether or not it is printed, because a withheld
         control points at it with `aria-describedby` — a reason only rendered when it is visible
         would leave the 変更はありません case with a described-by target that is not there. -->
    <span class="hint" id={FOOTER_REASON_ID} class:unseen={!footerReasonPrinted}>
      {footerReason === null ? "" : t().modal.cannotPressNow(footerReason)}
    </span>
    <div class="actions">
      <!-- Not `.mini`: the two are peers in one row, and a smaller one drew 2px shorter than 保存する
           (and by different amounts in the two engines — the figure-less controls take their height
           from their own font size, doc-11 §2.4 の 1em と同じ理由). -->
      <button
        type="button"
        aria-disabled={closeAvailable.state === "withheld"}
        aria-describedby={closeAvailable.state === "ready" ? undefined : FOOTER_REASON_ID}
        title={closeAvailable.state === "withheld"
          ? closeAvailable.reason
          : t().settings.discardHint}
        onclick={() => closeAvailable.state === "ready" && ondiscard()}
      >
        {closeWithoutSavingLabel()}
      </button>
      <!-- `aria-disabled` rather than `disabled`: doc-11 §5 keeps a withheld control focusable when its
           reason is not printed beside it, which is the 変更はありません case. -->
      <button
        type="button"
        aria-disabled={saveAvailable.state === "withheld"}
        aria-describedby={saveAvailable.state === "ready" ? undefined : FOOTER_REASON_ID}
        title={saveAvailable.state === "withheld" ? saveAvailable.reason : t().settings.saveHint}
        onclick={saveAndClose}
      >
        {saving ? t().action.saving : saveLabel()}
      </button>
    </div>
  </footer>
</div>

<style lang="scss">
  /*
   * The box the モーダル holds. **It no longer bounds its own height** (2026-08-10): `Modal.svelte`
   * bounds the dialog and scrolls the region this box sits in (doc-11 §11), so the 下部操作行 keeps
   * itself on screen by pinning to that region rather than by sitting outside a scroll of this file's
   * own. What went is a `calc` over three numbers — the backdrop's padding, the dialog's border, and
   * the 破棄前確認's row while one stood — held in two files that had to agree, and twice did not:
   * a literal copied here is how a padding changed there left the footer below the fold, and the
   * question's row took its height off the top without this box knowing, putting the 下部操作行 under
   * the window's edge exactly while the user was asked whether to leave by it.
   *
   * **The side padding is on the three children, not here.** A scroll container clips what is painted
   * to its padding box, and a focus ring is painted outside the control it belongs to — so a control
   * flush against the scrollport's content edge had its ring cut down the left side (the 表示テーマ
   * `select`, reported from the real WKWebView). The scrollport is `Modal`'s now, and this box has no
   * side padding of its own, so the room that ring needs is exactly this declaration — read by all
   * three children, so the row and the two rules cannot drift apart.
   */
  .settings {
    --panel-inline: 0.75rem;

    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    // No bottom padding: the 下部操作行 pins to the bottom of the scrolling region, and a padding here
    // would hold it that far off the edge it pins to.
    padding: 0.6rem 0 0;
    font-size: var(--text-lg);
  }

  header,
  .body,
  footer {
    padding-inline: var(--panel-inline);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  /*
   * Pinned, as the 下部操作行 below is: the two rules say the same thing about what is between them,
   * and the heading names the layer being worked in, which is not something to lose to a scroll.
   * Opaque, or the form scrolls *through* it. The × `Modal.svelte` draws is outside this box's flow,
   * so the two do not have to be told about each other.
   */
  header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex: none;
    align-items: baseline;
    gap: 0.5rem;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid var(--line);
    background: var(--panel);

    h2 {
      margin: 0;
      font-size: var(--text-3xl);
    }
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--line);

    h3 {
      margin: 0;
      font-size: var(--text-lg);
    }
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;

    // フォーム部品の高さ (doc-11 §2.2): 1.75rem, the step the 作成モーダル and the 登録モーダル take —
    // this layer is a form the user is here to fill in. The `select`s are in it and the `textarea` is
    // not (doc-11 §1): three of these controls are `select`s whose height was the engine's alone
    // (18px in WebKit against this form's 23.19px inputs, 変更前実測), while the `textarea` is sized
    // by its `rows` and has no step to take.
    input[type="text"],
    select {
      height: 1.75rem;
    }

    /*
     * The `select`s carried no author styling at all until now, and that is not only a look: **WebKit
     * refuses an author `height` on a `select` it is still drawing as a native menulist** — measured
     * 18px here against Chromium's 28px from the one declaration above, while the same declaration on
     * the other four screens took in both engines. What those screens have and this one lacked is a
     * frame and a surface. So the frame is what makes the height hold, and it is the inputs' own.
     * `--inset` rather than the inputs' `transparent`: `transparent` leaves the menulist drawing in
     * WebKit, and the arrow that tells a `select` from an input goes with the native rendering.
     */
    select {
      padding: 0.15rem 0.3rem;
      border: 1px solid var(--line-strong);
      border-radius: 3px;
      background: var(--inset);
      color: inherit;
      font: inherit;
      font-size: var(--text-md);
    }

    input[type="text"],
    textarea {
      flex: 1;
      min-width: 12rem;
      padding: 0.15rem 0.3rem;
      border: 1px solid var(--line-strong);
      border-radius: 3px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: var(--text-md);
    }
  }

  /*
   * 下部操作行 (TASK-74 AC #1), and the 発行の行 as well (doc-11 §11) — this is the one place where the
   * two are the same row: 保存する is a 発行 and a way out, 変更せずに閉じる is its 取りやめ and the other
   * way out. Pinned to the bottom of the layer's scrolling region so it is where it is whatever the
   * form has been scrolled to. Opaque and ruled off, or the form scrolls *through* it.
   */
  footer {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 0.3rem;
    padding-top: 0.45rem;
    padding-bottom: 0.6rem;
    border-top: 1px solid var(--line);
    background: var(--panel);
  }

  // 発行の行 (doc-11 §11): centred in the row, 取りやめ then 発行. It was flush right until 2026-08-10,
  // on the side the affirmative control takes on this platform; the rule now puts every 発行 in the
  // same place whichever screen draws it, and the platform's side is what it gives up to do that.
  .actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .location {
    dl {
      margin: 0;
    }

    // Stacked rather than a label column: a path is one unbreakable token near the モーダル's own
    // width, so a column beside it would wrap every value onto a second line anyway.
    dt {
      font-size: var(--text-sm);
      opacity: 0.7;
    }

    dd + dt {
      margin-top: 0.3rem;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
  }

  /*
   * Present but not printed. Used for the 変更はありません reason (TASK-74 AC #3), which the 保存する
   * button points at with `aria-describedby` — `display: none` or an absent element would take it out
   * of the accessibility tree as well, and the reason would then exist nowhere but the `title`, which
   * doc-11 §5 refuses as the only holder.
   */
  .unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  button {
    padding: 0.1rem 0.5rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-md);
    cursor: pointer;
    // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5): a `:disabled` rule written here would outrank
    // the global one and take this screen back out of step with the rest.
  }

  .hint {
    margin: 0;
    font-size: var(--text-md);
    opacity: 0.75;
  }

  .path {
    margin: 0;
    font-size: var(--text-md);
    // パス は ui-monospace (doc-11 §2.2).
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    // The path is one long unbroken token; without this it widens the モーダル rather than wrapping.
    overflow-wrap: anywhere;
  }

  // 外部コマンド の 1 行 (decision-29). Grid rather than flex so the three fields line up on their
  // inputs whatever the label's width — the labels are 3 different lengths and a ragged left edge on
  // the inputs is what the 区画 would otherwise have.
  .command {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.3rem;

    label {
      display: grid;
      grid-template-columns: 7.5rem 1fr;
      align-items: center;
      gap: 0.4rem;
      margin: 0;
    }

    .name {
      font-size: var(--text-lg);
    }

    // 解決できない ときだけ色を持つ (doc-11 §2.4 の 印グリフ)。CLI 縮退帯 ② が同じ理由で借りている
    // 不整合の族の色をそのまま引く (decision-22): 族は色を選ぶ単位であって事象の分類ではなく、
    // 外部コマンドが起動できないことと管理ファイル 1 件の不整合が同じ対象へ同時に付くことはない。
    // 面は --panel で、族の色との 3:1 は theme.test.ts が押さえている。
    .unresolved {
      color: var(--mark-inconsistent);
    }

    // 確認中 は解決済みでも未解決でもないので、どちらの印も出さない (doc-11 §6 の 正常な不在 と
    // 同じ扱い: --faint の 1 文字だけで、警告記号も枠も付けない)。
    .pending {
      color: var(--faint);
    }

    .mark {
      display: inline-flex;
      align-items: center;
      font-size: var(--text-xl);
    }

    .help {
      display: inline-flex;
      align-items: center;
      padding: 0.15rem;
      border: 0;
      border-radius: 4px;
      background: none;
      color: var(--muted);
      font-size: var(--text-xl);
      cursor: pointer;

      &:hover {
        color: var(--fg);
      }
    }

    // 説明は行の全幅を使って下へ開く。絶対配置の浮きにしないのは、モーダルの本文が縦スクロール
    // するためで、浮かせた層はスクロールでフィールドから離れる。
    .note {
      grid-column: 1 / -1;
      margin: 0 0 0.2rem;
      padding: 0.3rem 0.4rem;
      border-radius: 3px;
      background: var(--inset);
      font-size: var(--text-md);
      // パス は ui-monospace (doc-11 §2.2) だが、この文は散文とパスが混じるので地の書体のまま。
      overflow-wrap: anywhere;
    }
  }

  // An action's own report, not one of the 印の族 (decision-6): the neutral info hue, as the shell's
  // notices use, so a settings warning never reads as 縮退.
  .warn {
    margin: 0;
    padding: 0.3rem 0.4rem;
    border-radius: 3px;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    font-size: var(--text-md);
  }

  // The last section in the body; the 下部操作行's own top border is the rule under it.
  .location {
    border-bottom: 0;
  }
</style>
