<script lang="ts">
  // 設定画面 (decision-13, doc-7 §2.1「設定」). The six items decision-13 lists, and nothing else.
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
  // those switches, and the file's rules are decision-13's to state.
  import { untrack } from "svelte";
  import {
    CARD_DENSITY_LABEL,
    CARD_DENSITY_NOTE,
    CLOSE_WITHOUT_SAVING_LABEL,
    DETAIL_PLACEMENT_LABEL,
    DETAIL_PLACEMENT_NOTE,
    NO_CHANGES_REASON,
    OPEN_LOCATION_LABEL,
    OPEN_LOCATION_TITLE,
    SAVE_LABEL,
    SAVING_REASON,
    STARTUP_READ_NOTE,
    STORAGE_SELECTIONS,
    STORAGE_SELECTION_LABEL,
    WATCH_OFF_NOTE,
    editorArgsText,
    editorCommandOf,
    emptyStorageWarning,
    isDirty,
    mergeDraft,
    openLocationBlocked,
    saveAvailability,
    statusNotice,
    toggleStorage,
  } from "../lib/settings";
  import {
    RECORDED_THEME_IDS,
    THEME_LIST_NOTE,
    THEME_UNSET_LABEL,
    themeLabel,
  } from "../lib/theme";
  import type {
    AppSettings,
    CardDensity,
    DetailPlacement,
    LoadedSettings,
    StorageSelection,
  } from "../lib/wire";

  interface Props {
    /** The settings in force and why (decision-13). `null` while the first read is in flight. */
    loaded: LoadedSettings | null;
    /** Where `settings.toml` is — shown because it is Atlas's own file and hand-editable. */
    path: string | null;
    /**
     * Persist the draft. Resolves with the failure's text, or `null` on success.
     *
     * A *change* against the settings current at write time, not a snapshot: アプリ設定 has a second
     * writer (the 詳細配置 switch, doc-8 §2.2), and by the time this save reaches the file that writer's
     * value may already be in it. Only this form knows which fields are its own to impose — the ones
     * the user edited — so it decides that here rather than sending the whole document blind.
     */
    onsave: (change: (current: AppSettings) => AppSettings) => Promise<string | null>;
    /**
     * Open the アプリ設定ディレクトリ in the OS's file manager (TASK-75). Resolves with the failure's
     * text, or `null` once the launcher took it. The shell owns the call for the same reason it owns
     * `onsave`: the path is Atlas's own and is resolved at the boundary, never sent from here.
     */
    onopenLocation: () => Promise<string | null>;
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
    path,
    onsave,
    onopenLocation,
    saving,
    ondiscard,
    ondirty,
    onsaved,
  }: Props = $props();

  /** The draft the form edits. Re-seeded whenever the boundary hands back a new value. */
  let draft = $state<AppSettings | null>(null);
  /** The result of the last 保存 attempt: its failure text, or `null` once it succeeded. */
  let failure = $state<string | null>(null);
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
      const current =
        draft === null
          ? null
          : {
              ...$state.snapshot(draft),
              external_editor: editorCommandOf(editorProgram, editorArgs),
            };
      const merged = mergeDraft(baseline, current, settings);
      baseline = { ...settings };
      draft = merged;
      editorProgram = merged.external_editor?.program ?? "";
      editorArgs = editorArgsText(merged.external_editor);
      failure = null;
    });
  });

  let notice = $derived(loaded === null ? null : statusNotice(loaded.status));
  let availability = $derived(
    loaded === null
      ? { enabled: false, reason: "設定を読み込んでいます" }
      : saveAvailability(loaded.status),
  );
  /**
   * The draft as it would be saved: the form's own fields, plus the 外部エディタ指定 read out of its two
   * text controls. Derived rather than written back on `change`, so a program typed but not yet blurred
   * still counts as a change — otherwise 保存 would stay disabled while the cursor is in the field the
   * user just edited, and they would have to click elsewhere before the button they are aiming for
   * became pressable. Nothing is persisted from here: 保存 is still the only writer (doc-8 §6.3 の
   * 明示保存 と同じ理由).
   */
  let pending = $derived.by(() =>
    draft === null
      ? null
      : { ...draft, external_editor: editorCommandOf(editorProgram, editorArgs) },
  );
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
   * The 外部エディタ指定 as two fields (see `settings.ts`: never one command line). Seeded by the merge
   * effect above rather than by an effect of their own: they are part of the same value, and a second
   * seeding effect would overwrite the merged result with the file's.
   */
  let editorProgram = $state("");
  let editorArgs = $state("");

  /**
   * なぜ押せないか、押せないときだけ (doc-11 §5). Derived as a string rather than left as a boolean so
   * that the same value drives the withheld state and the reason bound to it: a disabled state computed
   * separately from its reason is how a 理由の無い無効化 gets in.
   *
   * Ordered as the obstacles are: a settings file that cannot be written blocks 保存 whatever the form
   * holds, and 変更はありません is only worth saying once writing is possible at all.
   */
  let saveBlocked = $derived(
    availability.reason ?? (saving ? SAVING_REASON : dirty ? null : NO_CHANGES_REASON),
  );
  /**
   * 変更せずに閉じる is withheld while a save is unresolved. Leaving then would take away the panel that
   * is to report the write's outcome, and it would do it under a label that says nothing was written —
   * while the write already issued goes on to store the draft. The shell holds the same flag and turns
   * away Escape with it, so both ways out are closed by one fact.
   */
  let closeBlocked = $derived(saving ? SAVING_REASON : null);
  /**
   * The one line the 下部操作行 gives for a control it is withholding, and the one element both point at.
   * One rather than two, because while a save is in flight *both* are withheld by the same one
   * circumstance, and saying it twice in the same row would name one situation two ways.
   */
  let footerReason = $derived(closeBlocked ?? saveBlocked);
  /**
   * Whether that line is printed. 変更はありません is not (TASK-74 AC #3): the 下部操作行 shows both
   * exits at once, so spelling out "you have changed nothing" adds a line that says what the disabled
   * 保存する already shows. It is still *reachable* — `aria-disabled` keeps the button focusable and
   * `aria-describedby` points at the text (doc-11 §5 の 2 つ目の形), which is why the element stays in
   * the DOM and is only hidden visually. The obstacles that are not the user's own doing (a file this
   * build must not overwrite, a write still running) keep their printed line.
   */
  let footerReasonPrinted = $derived(footerReason !== null && footerReason !== NO_CHANGES_REASON);
  const FOOTER_REASON_ID = "settings-footer-reason";

  /** The failure of the last 場所を開く, or `null`. Reported beside the button, not as a 上部帯 通知:
   *  this モーダル covers the 上部帯 (`Modal.svelte`), so a 帯 would not be read until it closed. */
  let locationFailure = $state<string | null>(null);
  /** Whether a launch has been issued and not yet answered. */
  let opening = $state(false);
  /**
   * Why 場所を開く cannot be pressed, or `null`. The launch in flight is one of the reasons, not a state
   * beside them: a control that goes `aria-disabled` while its `aria-describedby` stays empty is the
   * 理由の無い無効化 doc-11 §5 refuses, and a user who cannot see the pointer cannot tell it from a fault.
   */
  let locationBlocked = $derived(
    loaded === null ? null : openLocationBlocked(loaded.status, opening),
  );
  const LOCATION_BLOCKED_ID = "settings-location-blocked";

  function setStorage(value: StorageSelection, on: boolean): void {
    if (draft === null) return;
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
    if (saveBlocked !== null) return;
    await save();
    if (failure === null) onsaved();
  }

  async function save(): Promise<void> {
    if (pending === null || !availability.enabled || saving) return;
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
    if (locationBlocked !== null) return;
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
    <h2>設定</h2>
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
      <p class="hint">設定を読み込んでいます…</p>
    {:else}
      <section>
        <h3>表示テーマ</h3>
        <label>
          <select bind:value={draft.theme}>
            <option value={null}>{THEME_UNSET_LABEL}</option>
            {#each themeChoices as name (name)}
              <option value={name}>
                {themeLabel(name) ?? `${name}（このビルドには収録されていません）`}
              </option>
            {/each}
          </select>
        </label>
        <p class="hint">{THEME_LIST_NOTE}</p>
      </section>

      <section>
        <h3>カード情報量</h3>
        {#each Object.entries(CARD_DENSITY_LABEL) as [value, label] (value)}
          <label class="choice">
            <input
              type="radio"
              name="card-density"
              checked={draft.card_density === value}
              onchange={() => draft !== null && (draft.card_density = value as CardDensity)}
            />
            {label}
          </label>
        {/each}
        <p class="hint">{CARD_DENSITY_NOTE}</p>
      </section>

      <section>
        <h3>既定の保存区分（フィルタの初期値）</h3>
        {#each STORAGE_SELECTIONS as value (value)}
          <label class="choice">
            <input
              type="checkbox"
              checked={draft.default_storage_filter.includes(value)}
              onchange={(event) => setStorage(value, event.currentTarget.checked)}
            />
            {STORAGE_SELECTION_LABEL[value]}
          </label>
        {/each}
        {#if storageWarning !== null}
          <p class="warn">{storageWarning}</p>
        {/if}
      </section>

      <section>
        <h3>既定の詳細配置</h3>
        {#each Object.entries(DETAIL_PLACEMENT_LABEL) as [value, label] (value)}
          <label class="choice">
            <input
              type="radio"
              name="detail-placement"
              checked={draft.default_detail_placement === value}
              onchange={() =>
                draft !== null && (draft.default_detail_placement = value as DetailPlacement)}
            />
            {label}
          </label>
        {/each}
        <p class="hint">{DETAIL_PLACEMENT_NOTE}</p>
      </section>

      <section>
        <h3>ファイル監視で外部変更を取り込む（継続検出）</h3>
        <label class="choice">
          <input type="checkbox" bind:checked={draft.watch_external_changes} />
          継続検出を使う
        </label>
        <p class="hint">{WATCH_OFF_NOTE}</p>
        <p class="hint">{STARTUP_READ_NOTE}</p>
      </section>

      <section>
        <h3>外部エディタ指定</h3>
        <p class="hint">
          指定があればこれを使い、無ければ $VISUAL・$EDITOR を使います（doc-8 §7）。
          引数は 1 行に 1 つ書きます（シェルへ渡さないため、空白では区切りません）。
          空欄にすると指定を解除します。
        </p>
        <label>
          <span>プログラム</span>
          <input type="text" bind:value={editorProgram} placeholder="/Applications/… または code" />
        </label>
        <label>
          <span>引数（1 行 1 つ）</span>
          <textarea rows="3" bind:value={editorArgs} placeholder="-w"></textarea>
        </label>
      </section>

      <!-- 設定ファイルの場所 (decision-13). Moved out of the foot and into the form (TASK-74/75): the
           下部操作行 holds the two exits and nothing else, and the path belongs beside the control that
           opens it — 開く操作の隣がパスの置き場, which is what doc-8 §7 already asks of the 外部エディタ
           経路's own path line. -->
      <section class="location">
        <h3>設定ファイル</h3>
        {#if path !== null}
          <p class="path">{path}</p>
        {/if}
        <div class="row">
          <!-- `aria-disabled` rather than `disabled`, so the reason below stays reachable without a
               pointer (doc-11 §5). -->
          <button
            type="button"
            aria-disabled={locationBlocked !== null}
            aria-describedby={locationBlocked === null ? undefined : LOCATION_BLOCKED_ID}
            title={locationBlocked ?? OPEN_LOCATION_TITLE}
            onclick={openLocation}
          >
            {OPEN_LOCATION_LABEL}
          </button>
        </div>
        {#if locationBlocked !== null}
          <p class="hint" id={LOCATION_BLOCKED_ID}>{locationBlocked}</p>
        {/if}
        {#if locationFailure !== null}
          <p class="warn">{locationFailure}</p>
        {/if}
        <p class="hint">
          台帳ファイル（projects.toml）も同じフォルダにあります（decision-13）。
        </p>
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
      <p class="warn">保存できませんでした: {failure}</p>
    {/if}
    <!-- 無効化の理由 (doc-11 §5). Kept in the DOM whether or not it is printed, because a withheld
         control points at it with `aria-describedby` — a reason only rendered when it is visible
         would leave the 変更はありません case with a described-by target that is not there. -->
    <span class="hint" id={FOOTER_REASON_ID} class:unseen={!footerReasonPrinted}>
      {footerReason === null ? "" : `いま押せません: ${footerReason}`}
    </span>
    <div class="actions">
      <!-- Not `.mini`: the two are peers in one row, and a smaller one drew 2px shorter than 保存する
           (and by different amounts in the two engines — the figure-less controls take their height
           from their own font size, doc-11 §2.4 の 1em と同じ理由). -->
      <button
        type="button"
        aria-disabled={closeBlocked !== null}
        aria-describedby={closeBlocked === null ? undefined : FOOTER_REASON_ID}
        title={closeBlocked ?? "書き込まずに閉じます"}
        onclick={() => closeBlocked === null && ondiscard()}
      >
        {CLOSE_WITHOUT_SAVING_LABEL}
      </button>
      <!-- `aria-disabled` rather than `disabled`: doc-11 §5 keeps a withheld control focusable when its
           reason is not printed beside it, which is the 変更はありません case. -->
      <button
        type="button"
        aria-disabled={saveBlocked !== null}
        aria-describedby={saveBlocked === null ? undefined : FOOTER_REASON_ID}
        title={saveBlocked ?? "設定を書き込んで閉じます"}
        onclick={saveAndClose}
      >
        {saving ? "保存中…" : SAVE_LABEL}
      </button>
    </div>
  </footer>
</div>

<style lang="scss">
  /*
   * The box the モーダル holds, bounded so the 下部操作行 can sit outside the scroll (AC #1).
   *
   * The bound is the window less what `Modal.svelte` puts between this box and the window edge: its
   * backdrop's padding on both sides, the dialog's own border on both, and the 破棄前確認's row while
   * one stands (`0px` while none does). Those numbers are declared there as custom properties and read
   * here, so the box that is sized and the box that is drawn are the same one — a literal `4rem`
   * copied into this file is exactly how a padding changed in one place leaves a footer two pixels
   * below the fold in another. The confirmation is the case where that was not two pixels: the row
   * takes its height off the top, and without subtracting it the 下部操作行 goes under the window's
   * edge just as the user is asked whether to leave by it.
   *
   * `box-sizing` because this box states a height in `rem` and carries padding (the repository has no
   * global reset — the height would otherwise be the content's and the padding would be added outside
   * it).
   *
   * **The side padding is on the three children, not here.** A scroll container clips what is painted
   * to its padding box, and a focus ring is painted outside the control it belongs to — so with the
   * scrolling moved into `.body`, a control flush against its content edge had its ring cut down the
   * left side (the 表示テーマ `select`, reported from the real WKWebView). While this box was the one
   * that scrolled, its own side padding was the room that ring needed; giving that padding to the box
   * that scrolls now is putting the same room back where it was, rather than estimating how wide a
   * ring the platform draws. One declaration, read by all three, so the row and the two rules under
   * the heading and above the 下部操作行 cannot drift apart.
   */
  .settings {
    --panel-inline: 0.75rem;

    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    max-height: calc(
      100vh - var(--modal-backdrop-inset) * 2 - var(--modal-dialog-border) * 2 -
        var(--modal-confirm-height)
    );
    gap: 0.6rem;
    padding: 0.6rem 0 1rem;
    font-size: 0.8rem;
  }

  header,
  .body,
  footer {
    padding-inline: var(--panel-inline);
  }

  /*
   * Everything between the heading and the 下部操作行. `min-height: 0` because a flex item's default
   * `min-height: auto` is its content's height, which would let this box push past the bound above
   * instead of scrolling inside it — and the footer would go down with it.
   */
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    gap: 0.6rem;
    overflow-y: auto;
  }

  // The rule under the heading says the same thing the one above the 下部操作行 does: what is on the
  // other side of it scrolls, and this does not.
  header {
    display: flex;
    flex: none;
    align-items: baseline;
    gap: 0.5rem;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid var(--line);

    h2 {
      margin: 0;
      font-size: 0.95rem;
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
      font-size: 0.8rem;
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
      font-size: 0.75rem;
    }
  }

  /*
   * 下部操作行 (AC #1). Outside `.body`, so it is where it is whatever the form has been scrolled to;
   * `flex: none` keeps it at its own height when the body wants the rest.
   */
  footer {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 0.3rem;
    padding-top: 0.45rem;
    border-top: 1px solid var(--line);
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.4rem;
  }

  .location {
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
    font-size: 0.75rem;
    cursor: pointer;
    // 無効化提示 は app.scss の 1 箇所が持つ (doc-11 §5): a `:disabled` rule written here would outrank
    // the global one and take this screen back out of step with the rest.
  }

  .hint {
    margin: 0;
    font-size: 0.72rem;
    opacity: 0.75;
  }

  .path {
    margin: 0;
    font-size: 0.72rem;
    // パス は ui-monospace (doc-11 §2.2).
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    // The path is one long unbroken token; without this it widens the モーダル rather than wrapping.
    overflow-wrap: anywhere;
  }

  // An action's own report, not one of the 印の族 (decision-6): the neutral info hue, as the shell's
  // notices use, so a settings warning never reads as 縮退.
  .warn {
    margin: 0;
    padding: 0.3rem 0.4rem;
    border-radius: 3px;
    background: color-mix(in srgb, var(--info) 12%, transparent);
    font-size: 0.75rem;
  }

  // The last section in the body; the 下部操作行's own top border is the rule under it.
  .location {
    border-bottom: 0;
  }
</style>
