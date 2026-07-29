<script lang="ts">
  // 設定画面 (decision-13, doc-7 §2.1「設定」). The six items decision-13 lists, and nothing else: the
  // rules for what this file must not hold (列折畳み・行折畳み・行非表示、起動時の全ルート読み取り) are
  // stated on screen rather than only in the code, because a user looking for those switches should
  // find out here why they are absent instead of concluding Atlas lost them.
  //
  // The component holds a draft and issues one 保存; it never writes as the user types. Same reason the
  // detail panel uses 明示保存 (doc-8 §6.3): a half-typed editor path saved on every keystroke would be
  // the 起動指定 in force for as long as it took to finish typing.
  import { untrack } from "svelte";
  import {
    CARD_DENSITY_LABEL,
    DETAIL_PLACEMENT_LABEL,
    DETAIL_PLACEMENT_NOTE,
    NO_RECORDED_THEME_REASON,
    PENDING_CONSUMER_NOTE,
    RECORDED_THEMES,
    STARTUP_READ_NOTE,
    STORAGE_SELECTIONS,
    STORAGE_SELECTION_LABEL,
    THEME_UNSET_LABEL,
    TRANSIENT_STATE_NOTE,
    WATCH_OFF_NOTE,
    editorArgsText,
    editorCommandOf,
    emptyStorageWarning,
    isDirty,
    mergeDraft,
    saveAvailability,
    statusNotice,
    toggleStorage,
  } from "../lib/settings";
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
    onclose: () => void;
  }

  let { loaded, path, onsave, onclose }: Props = $props();

  /** The draft the form edits. Re-seeded whenever the boundary hands back a new value. */
  let draft = $state<AppSettings | null>(null);
  let saving = $state(false);
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
  let storageWarning = $derived(
    draft === null ? null : emptyStorageWarning(draft.default_storage_filter),
  );
  /**
   * The theme names to offer. A stored name this build does not record — a hand-edited file, or a
   * file written by a build that had more themes — is listed too, marked as such: dropping it from
   * the list would leave the select with nothing selected and quietly rewrite the user's choice on
   * the next save. Empty means the only option is 未選択, which is when the control is withheld.
   */
  let themeChoices = $derived.by(() => {
    const stored = draft?.theme ?? null;
    return stored === null || RECORDED_THEMES.includes(stored)
      ? RECORDED_THEMES
      : [stored, ...RECORDED_THEMES];
  });

  /**
   * The 外部エディタ指定 as two fields (see `settings.ts`: never one command line). Seeded by the merge
   * effect above rather than by an effect of their own: they are part of the same value, and a second
   * seeding effect would overwrite the merged result with the file's.
   */
  let editorProgram = $state("");
  let editorArgs = $state("");

  function setStorage(value: StorageSelection, on: boolean): void {
    if (draft === null) return;
    draft.default_storage_filter = toggleStorage(draft.default_storage_filter, value, on);
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
    saving = true;
    try {
      failure = await onsave((current) => (base === null ? value : mergeDraft(base, value, current)));
    } finally {
      saving = false;
    }
  }

  function revert(): void {
    if (loaded === null) return;
    draft = { ...loaded.settings };
    editorProgram = loaded.settings.external_editor?.program ?? "";
    editorArgs = editorArgsText(loaded.settings.external_editor);
    failure = null;
  }
</script>

<div class="settings">
  <header>
    <h2>設定</h2>
    <button type="button" class="mini" onclick={onclose}>閉じる</button>
  </header>

  {#if notice !== null}
    <!-- decision-13 既定値で動いている旨 (AC #6): stated whenever these values did not come from the
         file, so "my settings are gone" and "this build will not write your newer file" never look
         the same. -->
    <p class="warn">{notice}</p>
  {/if}
  {#if failure !== null}
    <p class="warn">保存できませんでした: {failure}</p>
  {/if}

  {#if draft === null}
    <p class="hint">設定を読み込んでいます…</p>
  {:else}
    <section>
      <h3>表示テーマ</h3>
      <label>
        <select
          bind:value={draft.theme}
          disabled={themeChoices.length === 0}
          title={RECORDED_THEMES.length === 0 ? NO_RECORDED_THEME_REASON : ""}
        >
          <option value={null}>{THEME_UNSET_LABEL}</option>
          {#each themeChoices as name (name)}
            <option value={name}>
              {RECORDED_THEMES.includes(name) ? name : `${name}（このビルドには収録されていません）`}
            </option>
          {/each}
        </select>
      </label>
      {#if RECORDED_THEMES.length === 0}
        <p class="hint">{NO_RECORDED_THEME_REASON}</p>
      {/if}
      <p class="hint">{PENDING_CONSUMER_NOTE}</p>
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
      <p class="hint">{PENDING_CONSUMER_NOTE}</p>
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

    <section class="not-here">
      <h3>ここに無い項目</h3>
      <p class="hint">{TRANSIENT_STATE_NOTE}</p>
    </section>

    <footer>
      <button
        type="button"
        disabled={!availability.enabled || !dirty || saving}
        title={availability.reason ?? (dirty ? "" : "変更はありません")}
        onclick={save}
      >
        {saving ? "保存中…" : "保存"}
      </button>
      <button type="button" class="mini" disabled={!dirty || saving} onclick={revert}>
        変更を取り消す
      </button>
      {#if availability.reason !== null}
        <span class="hint">{availability.reason}</span>
      {/if}
      {#if path !== null}
        <span class="hint path">{path}</span>
      {/if}
    </footer>
  {/if}
</div>

<style lang="scss">
  .settings {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.6rem 0.75rem 1rem;
    overflow-y: auto;
    font-size: 0.8rem;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;

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
    border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);

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
      border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
      border-radius: 3px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.75rem;
    }
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  button {
    padding: 0.1rem 0.5rem;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    &.mini {
      font-size: 0.7rem;
    }
  }

  .hint {
    margin: 0;
    font-size: 0.72rem;
    opacity: 0.75;
  }

  .path {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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

  .not-here {
    border-bottom: 0;
  }
</style>
