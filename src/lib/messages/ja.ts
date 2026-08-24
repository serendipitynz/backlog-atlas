/**
 * 日本語の 文言表 (decision-35). **This file is the key set**: `Catalog` is `typeof ja`, so a key
 * exists because the Japanese string for it exists, and `en.ts` is declared against that type.
 *
 * Groups follow the screen or module the text belongs to, not the order it was written in. A group
 * is where the next session looks for a sentence, so a string used by two screens goes in the group
 * of the thing it names rather than being duplicated.
 *
 * An entry that takes values is a function, so the parameter list is part of the type and `en.ts`
 * cannot silently drop a value or take them in a different order. An entry that varies with a count
 * takes the count and calls `pluralize` on the English side; the Japanese side ignores it, which is
 * `Intl.PluralRules`' own answer for this language rather than an assumption made here.
 */
export const ja = {
  /**
   * 操作そのものの名, for the operations **more than one screen draws**, together with the short lines
   * that report the same operation in progress or failed — what is in progress and what failed is the
   * operation, not the screen. An operation only one screen has is named in that screen's group
   * instead, so that a session looking for a word looks in one place. **A failure's own reason is not
   * here**: what goes in the brackets comes from `failure` or from the program that said it.
   */
  action: {
    close: "閉じる",
    cancel: "キャンセル",
    menu: "メニュー",
    add: "追加",
    remove: "削除",
    edit: "編集",
    save: "保存",
    saving: "保存中…",
    /** 保留理由 while this screen's own save is in flight. */
    savingNow: "保存中です",
    saveFailed: (detail: string) => `保存できませんでした: ${detail}`,
    pick: "選択…",
    reload: "再読み込み",
    backToSwimlane: "スイムレーンへ戻る",
  },
  /** 入力欄そのものの名と補助文, for the fields more than one screen draws. */
  field: {
    titleRequired: "title（必須）",
    /** 保留理由 for a form whose required title is still empty (doc-11 §8 licence ①). */
    titleRequiredReason: "title は必須です",
    projectRootRequired: "プロジェクトルート（必須）",
    backlogRootOptional: "Backlog ルート（任意）",
    slugOptional: "slug（任意）",
    pickHint: "フォルダを選びます",
    pickProjectRootTitle: "プロジェクトルートを選択",
    pickBacklogRootTitle: "Backlog ルートを選択",
    body: "本文",
    description: "説明",
    plainLabels: "通常ラベル",
    addLabel: "追加するラベル",
    addCriterion: "追加する Acceptance Criterion",
    /**
     * Why one member of a comma-separated CLI option cannot hold a comma (`comma.ts`). `what` is the
     * field's own name and `quoted` the head of the value, already cut to a length the 固定行 can
     * hold — the cut is the caller's, because doc-11 §13 bounds the row and not the sentence.
     */
    commaNotAllowed: (what: string, quoted: string) =>
      `${what}に「,」を含められません（1 個のカンマ区切り値として扱われるため、` +
      `「${quoted}」は 2 件に分かれます）`,
    /**
     * Why a value that already holds a comma cannot be *taken off* a 増減 field (`comma.ts`). Not the
     * sentence above said the other way round: there the value is one the reader is typing now, and
     * dropping the comma is a move they can make; here the value is already on the task, and the
     * option that would remove it splits it into names the task does not have.
     */
    commaValueNotRemovable: (what: string, quoted: string) =>
      `カンマを含む${what}「${quoted}」は Atlas からは削除できません`,
    /** 入力欄の名として使う語, for the fields whose name is only ever a word in a sentence. */
    labelWord: "ラベル",
    tagWord: "タグ",
  },
  /**
   * 読み取り結果そのものの状態を言う短い文, for the states more than one screen shows. **A failure's
   * reason is not one of these** — those are `failure`'s.
   */
  state: {
    none: "なし",
    loading: "読み込み中…",
    /** 描かれなかった 本文画像 の 状態の印 の読み上げ名 (doc-11 §14.7)。alt が空のときは、これだけが画像の存在を述べる。 */
    imageNotDrawn: "画像（表示できません）",
    titleUnknown: "（title 不明）",
    statusUnknown: "status 不明",
    storageUnknown: "保存区分不明",
    typeUnset: "Type 未設定",
    /** decision-5 の未知 Type: a `kind:` label the read layer could not place. */
    typeUnknown: "未知 Type",
    /** Appended to a value the read layer could not place among the known ones. */
    valueUnknown: "（未知）",
    count: (n: number) => `${n} 件`,
    /** Nothing has been typed yet, so there is nothing an issue could carry (doc-11 §5 の保留理由). */
    nothingToSaveYet: "変更はまだありません",
    /**
     * What goes between the members of a list built into a sentence. A punctuation mark rather than
     * a word, and one of the places the two languages differ in the character itself: 中黒 joins a
     * Japanese list and a comma joins an English one.
     */
    listSeparator: "・",
    /**
     * A sentence with the diagnostic text after it (`failure.ts`, and the reasons built like it).
     * The brackets are here for `listSeparator`'s reason — 全角 and 半角 parentheses are different
     * characters, and each belongs to one of the two languages.
     */
    withDetail: (sentence: string, detail: string) => `${sentence}（${detail}）`,
  },
  /** 被せ層 itself: `Modal.svelte`, and the footer 設定画面 draws in the same shape. */
  modal: {
    cannotPressNow: (reason: string) => `いま押せません: ${reason}`,
    /** 戻る側の答え (doc-11 §12): one word, for every 実行前確認. */
    issueConfirmCancel: "やめる",
  },
  /**
   * 画面の外側の文: the bands, the notices, the states drawn where no screen is mounted, and the two
   * 被せ層 the shell itself opens. **Not "App.svelte's text"** — a sentence `App.svelte` draws that
   * belongs inside one screen is in that screen's group, and one drawn outside every screen belongs
   * here whichever file happens to draw it.
   */
  shell: {
    /**
     * 外部で開く (doc-7 §2.1, doc-8 §7, decision-45). Moved here from `taskDetail.editor` on
     * 2026-08-25: the group left タスク詳細 for the ☰'s menu, and the menu is the shell's.
     *
     * **どの行の語も製品名を綴らない** — 製品名は識別子なので `MethodOffer.product` が運び
     * (decision-35 §5)、ここは受け取った語の周りを組むだけである。
     */
    externalOpen: {
      label: "外部で開く",
      noTarget:
        "開く管理ファイルが選ばれていません（タスク・文書・マイルストーン・決定事項のどれかを選ぶと開けます）",
      fileMissing:
        "選んでいるファイルが現在の読み取り結果にありません（外部での移動・削除の可能性）。" +
        "開く対象を特定できないため、外部のプログラムでも開けません",
      probePending: "外部で開く手段の確認中です",
      /** 開く前の注意表示 (doc-8 §7 難点と受け方). The two facts that make this the exception route. */
      frontmatterNotice:
        "外部のプログラムでは frontmatter を含む管理ファイルの Markdown ファイルを開きます。" +
        "編集時に id・status・labels などの構造化フィールドについて Backlog.md による検査は実施されません" +
        "（壊れると不整合表示になります）。",
      /** 注意の抑止 (decision-45 §6, doc-11 §15). */
      suppressNotice: "今後表示しない",
      /**
       * 書き戻し when 継続検出 is stopped (doc-8 §7): the save will not arrive on its own. One text
       * for both causes — doc-9 §3.1 keeps the state and its mark the same either way.
       */
      watchStoppedNote:
        "このルートは継続検出が止まっているため、外部での保存は自動では反映されません。" +
        "編集を終えたら「このルートを再読込」を押してください（開き直すだけでは読み直しません）。",
      rereadRoot: "このルートを再読込",
      /** doc-8 §6.4: an open 編集セッション plus an external edit is the double intake to avoid. */
      unsavedInputWarning:
        "GUI 側に未保存入力があります。このまま外部でも編集すると、同じファイルを二重に編集する" +
        "ことになります。入力は破棄しませんが、外部の保存は外部変更として検出し、GUI の保存時は" +
        "更新前競合検出で止めます。先に保存またはキャンセルすることを推奨します。",
      /** A terminal editor started from a GUI process has no terminal to draw in. */
      terminalCaveat:
        "端末専用エディタ（vim・nano など）を指している場合、GUI から起動しても画面は出ません。" +
        "その場合は OS の関連付けで開いてください。",
      /**
       * 起動指定の出所 (doc-8 §7 の解決順), keyed by `EditorSource` so a fourth cannot be added
       * without the compiler asking what it is called. アプリ設定 is spelled as itself rather than as
       * a variable name — it is the 指定手段 for users whose environment never reaches the process,
       * and a `$…` would send them looking for a variable that does not exist. The other two *are*
       * variables, so both catalogues carry the same spelling (decision-35 §5 の識別子).
       */
      source: {
        appSettings: "アプリ設定の外部エディタ指定",
        visual: "$VISUAL",
        editor: "$EDITOR",
      },
      openWithProduct: (product: string) => `${product} で開く`,
      revealIn: (product: string) => `${product} で表示`,
      openTerminal: (product: string) => `${product} で開く`,
      openWithConfigured: (source: string, program: string) => `${source} で開く（${program}）`,
      openWithConfiguredAbsent: "$EDITOR で開く",
      openWithAssociation: "OS の関連付けで開く",
      noConfigured:
        "アプリ設定の外部エディタ指定も VISUAL・EDITOR も設定されていないため、この方式は提供しません" +
        "（設定画面で指定するか、環境変数を設定して Atlas を起動し直すか、OS の関連付けで開いてください）",
      /** Stands for the file in the command shown to the user; the real argument is the full path. */
      filePlaceholder: "<選んでいるファイル>",
      /** The path the screen held is not in the current read — the screen is behind the root. */
      unknownManagedFile: (path: string) =>
        `${path} は現在の読み取り結果の管理ファイルではないため、起動しませんでした` +
        "（外部での移動・削除の可能性）。読み直してから選び直してください。",
      /** 「で開けませんでした」rather than 「を起動できませんでした」; the correction follows the method. */
      launchFailed: (program: string, reason: string, fix: string) =>
        `${program} で開けませんでした: ${reason}。${fix}`,
      fixAssociation:
        ".md に関連付けられたアプリケーションが OS に登録されているか確認してください" +
        "（アプリ設定・$VISUAL・$EDITOR での起動は使えます）。",
      fixConfigured:
        "アプリ設定の外部エディタ指定・VISUAL・EDITOR の値（プログラム名とオプション）を確認してください。",
    },
    titleCountFailed: (detail: string) => `ウィンドウのタイトルに総件数を出せません（${detail}）`,
    /** Why 継続検出 is stopped, for the 帯 (doc-9 §3.1). Three causes, one state and one mark. */
    watchOffAll: "設定で継続検出を切っているため、どの行も自動では更新されません",
    feedUnavailable: "変更の通知を購読できていないため、どの行も自動では更新されません",
    someRowsUnwatched: "変更監視が動いていない行があります",
    feedSubscribeFailed: (detail: string) => `変更の通知を購読できません（${detail}）`,
    settingsReadFailed: (detail: string) =>
      `設定を読み込めませんでした（${detail}）。既定値で動きます。`,
    editorProbeFailed: (detail: string) => `外部エディタの確認に失敗しました（${detail}）`,
    cliProbeFailed: (detail: string) => `Backlog CLI の確認に失敗しました（${detail}）`,
    externalProbeFailed: (detail: string) => `外部コマンドの確認に失敗しました（${detail}）`,
    watchStartFailed: (slug: string, detail: string) =>
      `${slug}: 変更監視を開始できません（${detail}）`,
    ledgerBusy: "ほかの登録の更新が完了するまで待ってください。",
    reorderFailed: (detail: string) => `行の並べ替えに失敗しました: ${detail}`,
    projectUnidentified: "対象プロジェクトを特定できません",
    taskUnidentified: "対象タスクを特定できません",
    transitionClosedDetail: "状態遷移を適用しました。保存区分と ID が変わるため、詳細を閉じました。",
    /**
     * 絞り込みはカードの取捨だけを行う (doc-7 §5.2), so a filter in force can take a just-created card
     * away. Appended to the outcome rather than replacing it — an unchanged cell is otherwise
     * indistinguishable from an issue that silently did nothing.
     */
    outOfFilter:
      "（今の絞り込みでは表示されないため、カードは出ていません。フィルタ帯で条件を外すと出ます）",
    taskCreated: (slug: string, column: string) => `${slug} の ${column} 列にタスクを作成しました。`,
    statusChanged: (taskId: string, status: string) => `${taskId} の status を ${status} にしました。`,
    menuHint: (chord: string, shortcutHelp: string) =>
      `メニュー（${chord}）— 共通の入口と、${shortcutHelp}と、プロジェクトごとの表示・非表示をまとめて開きます`,
    /** 候補選択の問い (doc-7 §4.2). */
    dropAskLabel: "渡す status を選ぶ",
    dropAskLead: (taskId: string, column: string, declared: number) =>
      `${taskId} を ${column} 列へ移します。この列には status が ${declared} 件宣言されています。`,
    dropAskSelectLabel: "渡す status",
    dropAskConfirm: "この status で移す",
    dropAskWithdrawn:
      "この列に渡せる status が無くなりました。読み直した内容を確かめてからやり直してください。",
    rereadUnwatched: "該当行を再読込",
    noticeFull: "全文",
    noticeClose: "通知を閉じる",
    projectUnregistered: "このプロジェクトは登録されていません（別の画面で登録が外れた可能性）。",
    fatal: (detail: string) => `読み込みに失敗しました: ${detail}`,
    /** Fragments: the sentence has the 登録 entry point as a button inside it. */
    noProjects: {
      lead: "登録済みプロジェクトがありません。フィルタ帯右端のメニューの",
      tail: "から追加してください。",
    },
    detailGone: (path: string) =>
      `${path} は現在の読み取り結果にありません（削除・移動、またはルート読取不能の可能性）。`,
    /**
     * 共通入口 (doc-7 §2.1) — the two entries the ☰ always offers, each with the one line saying
     * what it reaches. Keyed by `HeaderEntryId`, so an entry added there has to be worded here.
     */
    headerEntry: {
      register: {
        label: "プロジェクトを登録",
        note: "プロジェクトを 1 件登録します。グリッドの末尾に行が 1 本増えます。",
      },
      settings: { label: "設定", note: "アプリ設定を開きます。" },
    },
    /**
     * The menu line that opens the 一覧モーダル (doc-7 §2.1) — the same string the modal carries as
     * its `Modal label` and its `<h2>`, which is how the two 共通入口 already work.
     */
    shortcutHelpLabel: "キーボード操作一覧",
    /**
     * 版の告知 (decision-44 §3). The line is there whether or not a 新しい版 exists, so it is named
     * for where it goes and not for what it might announce.
     */
    releasePageLabel: "リリースページを開く",
    /**
     * What that line adds when there is a 新しい版 — visible, because the line has a label of its own
     * and a figure beside one would be a second name for it (doc-11 §2.4).
     */
    releaseNoticeAvailable: (version: string) => `新しい版 ${version}`,
    /**
     * The ☰'s own name while a 新しい版 stands. アイコンのみのボタン carry their state in the name as
     * well as in the mark, because neither a fill nor a stroke reaches a screen reader (doc-11 §2.4) —
     * the same shape 3 配置切替 の既定印 takes.
     */
    menuHasReleaseNotice: (label: string) => `${label}（新しい版があります）`,
    /** The line that puts every project row back on screen (doc-7 §2.1), in the user's own words. */
    showAllProjectsLabel: "すべてのプロジェクトを表示",
    /**
     * 保留理由 for that line while every registered row is already on screen. A sentence rather than
     * parenthetical shorthand because nothing prints it — it is read aloud or not at all.
     */
    showAllProjectsHeld: "すべてのプロジェクトが表示されています。",
    /** 保留理由 for the same line when the ledger holds nothing at all. This one *is* printed. */
    noProjectsRegistered: "登録済みプロジェクトがありません。",
    /** 上部帯 (doc-11 §4), each 縮約 to the one line the band has room for. */
    ledgerReadOnlyBand:
      "登録ファイルが読み取り専用です。登録内容の更新・登録解除・行の並べ替えはできません" +
      "（文書・マイルストーン・新規タスクは影響を受けません）。",
    cliChecking: "backlog CLI を確認中です",
    cliUnavailable: "backlog CLI の実行ファイルを解決できません",
    cliUnsupported: (version: string, minimum: string) =>
      `backlog CLI ${version} は動作確認範囲外です（必要: ${minimum} 以上）`,
    cliDegradedBand: (summary: string) =>
      `${summary}。作成・更新は発行できません（登録内容の更新は影響を受けません）。`,
    unwatchedBand: (reason: string) => `${reason}（表示が実ファイルより古い可能性があります）。`,
    /**
     * 破棄前確認 (doc-8 §6.3) — one question for all five routes, because §6.3 asks for exactly that.
     * Here rather than in the panel because two of the five are the shell's, and a per-caller wording
     * is how the five would end up describing the same loss five ways.
     */
    discardConfirmQuestion: "編集中の未保存入力があります。このまま進むと破棄されます。",
    discardConfirmProceed: "破棄して続ける",
    /**
     * The same answer where a モーダル asks it (doc-11 §7). 続ける is as wide as it is only to cover
     * five routes that do not share a destination; a モーダル's two are both ways of closing one
     * layer, so the wider word would name something wider than what the press does.
     */
    discardConfirmClose: "破棄して閉じる",
    discardConfirmKeep: "編集に戻る",
  },
  /** スイムレーン画面 (doc-7): the grid, its heads, and a row's own controls. */
  swimlane: {
    reorderBlocked:
      "登録ファイルが読み取り専用のため、行の並べ替えはできません。" +
      "プロジェクト詳細の概要区画で理由を確認できます。",
    rowFoldHint: "行折畳み: レーンセルを畳み、列別の件数をこの行に残します。",
    rowUnfoldHint: "行折畳みを解き、レーンセルを戻します。",
    columnFoldHint: "列折畳み: この列を全行同時に畳み、列名を残します（件数は行ごとに残ります）。",
    columnUnfoldHint: "列折畳みを解き、この列のカードを全行で戻します。",
    columnFoldLabel: (name: string, folded: boolean) =>
      `${name}の列折畳みを${folded ? "解く" : "行う"}`,
    rowFoldLabel: (slug: string, folded: boolean) =>
      `${slug} の行折畳みを${folded ? "解く" : "行う"}`,
    columnHeadName: (label: string) => `${label} 列`,
    unmappedHeadName: "未分類区画",
    openProjectHint: (name: string) => `${name} のプロジェクト詳細画面を開きます`,
    openProjectLabel: (slug: string) => `${slug} のプロジェクト詳細画面を開く`,
    openProjectPlainHint: "プロジェクト詳細画面を開きます",
    visibleCount: (shown: number, total: number) => `${shown} / ${total} 件`,
    moveUpLabel: (slug: string) => `${slug} を上へ`,
    moveDownLabel: (slug: string) => `${slug} を下へ`,
    moveUpHint: "表示順を上へ",
    moveDownHint: "表示順を下へ",
    reread: "再読込",
    rereadHint: "このルートを読み直す（継続検出が動いていないため自動では更新されません）",
    rootUnreadable: (detail: string) => `ルート読取不能: ${detail}`,
    /** 空セル (doc-7 §6). 該当タスクが無い is a different fact from ルートが読めない. */
    emptyCell: "該当タスクなし",
    /**
     * 畳んだ列のレーンセル の読み上げ名 (decision-23): the column, the total, and the 段 breakdown the
     * `aria-hidden` squares carry only as colour. The two are separate entries because a cell whose
     * tally is empty says the first alone.
     */
    collapsedCellCount: (label: string, n: number) => `${label} ${n} 件`,
    collapsedCellBreakdown: (total: string, breakdown: string) => `${total}（${breakdown}）`,
    /** The 段 for a priority the read layer could not place (decision-23). The other three are `priority`'s own spellings. */
    priorityNone: "priority 未設定・未知",
    /** 行折畳み が置けない行 (doc-7 §2.3): every cell is unreadable, so there is nothing to fold. */
    rowFoldAbsent:
      "ルートが読めず畳む対象のセルがないため、この行に行折畳みは置きません。" +
      "この行を画面から外すには、ヘッダのメニューのプロジェクト一覧を使います。",
    /** 列折畳み の下限 (doc-7 §2.2): the last column standing may not be folded. */
    lastColumnHeld: "残り 1 列は畳めません。すべて畳むと、どの列のカードも読めない画面になります。",
    /** 表示 / 総数 の比 (doc-7 §2.1 総件数), both ratios on one line. */
    totals: (shownCards: string, shownLanes: string) => `表示 ${shownCards}${shownLanes}`,
    totalsCards: (shown: number, total: number) => `${shown} / ${total} 件`,
    totalsLanes: (shown: number, total: number) => ` ・ ${shown} / ${total} プロジェクト`,
    /** 前後移動 の群 (doc-8 §2.2): which run of cards the 前後 step through. */
    laneGroupCell: (label: string) => `${label} セル`,
    laneGroupUnmapped: (label: string) => `${label}区画`,
    /** 位置表示 (doc-8 §2.2): where in that run the open task sits. */
    lanePosition: (position: number, total: number) => `${position} / ${total} 件`,
    /** Why 前後移動 has no run to step through — the task is not on the grid as it now stands. */
    laneAbsent:
      "このタスクは今のスイムレーンに出ていないため（行の非表示・ルート読取不能・絞り込みのいずれか）、" +
      "前後のタスクを決められません。",
    /** 並び順 (doc-7 §5.4), as the 並び順 control lists them. */
    order: {
      priority_asc: "priority 昇順",
      priority_desc: "priority 降順",
      task_id_asc: "task id 昇順",
      task_id_desc: "task id 降順",
      updated_asc: "updated 昇順",
      updated_desc: "updated 降順",
      created_asc: "created 昇順",
      created_desc: "created 降順",
      milestone_asc: "milestone 昇順",
      milestone_desc: "milestone 降順",
    },
    /** 未分類区画 (doc-7 §2.2), wherever it is named beside the four canonical columns. */
    unmapped: "未分類",
  },
  /** フィルタ帯 と 値の一覧のポップオーバー (doc-7 §5.2・§5.4). */
  filter: {
    textLabel: "テキストで絞り込み",
    textPlaceholder: "横断タスクID・title",
    add: "＋ 絞り込み",
    removeToken: (name: string) => `${name} を解除`,
    noStorageSelected: "保存区分がひとつも選ばれていないため、カードは出ません",
    undoLabel: "直前の 1 つを戻す",
    undoHint: (chord: string) => `最後に足した条件を 1 件戻します（${chord}）`,
    clearLabel: "既定に戻す",
    clearHint: "すべての条件を外し、保存区分を既定へ戻します",
    /** 既定のままなので 既定に戻す が効かない. */
    alreadyDefault: "絞り込みは既定のままです。",
    /**
     * 直前の 1 つを戻す が効かない理由. Names the control by what it does rather than by a glyph:
     * since TASK-139 a token's remove control is a figure, and a figure has no words to quote.
     */
    nothingToUndo:
      "自分で足した条件がないため、直前の 1 つは戻せません（保存区分の既定は各トークンの解除で外します）。",
    orderLabel: "並び順",
    popoverLabel: "絞り込みを追加",
    searchCaption: "値を検索",
    searchPlaceholder: "値・属性名",
    /** 不整合 has no value list — the facet *is* the condition. */
    inconsistentOnly: "不整合のみ",
    relativeFrom: "いまから",
    relativeUnitLabel: "いまから数える単位",
    applyRelative: "始端にする",
    relativeRange: (max: number) => `1 〜 ${max} の整数を入れてください`,
    noMatch: (query: string) => `「${query}」に一致する値はありません`,
    selectedCount: (n: number) => `選択中 ${n} 件`,
    clearSearch: "検索を消す",
    /**
     * 属性名 (doc-7 §5.2), for the token and for the value list's section heading alike. `updated`
     * carries the attribute *and* what is being filtered by it, because the heading has to say what
     * its section is when the two 端 fields are the only other words in it.
     */
    facet: {
      storage: "保存区分",
      type: "Type",
      label: "ラベル",
      priority: "priority",
      assignee: "assignee",
      text: "テキスト",
      inconsistent: "不整合",
      updated: "updated 期間",
    },
    /** 更新期間の端 where a control has to name one; the token itself says 以降・以前 instead. */
    periodEnd: { from: "始端", to: "終端" },
    /** 相対指定 の単位 (doc-7 §5.2), as the unit list offers them. */
    periodUnit: { day: "日", week: "週", month: "月" },
    /**
     * One 端 as its token reads it — 端の包含 (doc-7 §5.2) stated on the token rather than left to
     * the doc: both ends take the named day in.
     */
    periodBound: (day: string, end: "from" | "to") =>
      `${day} ${end === "from" ? "以降" : "以前"}`,
  },
  /** レーンセルの新規タスク入力 (doc-7 §4.1). */
  laneCreate: {
    open: "新規",
    openLabel: (column: string) => `${column} 列に新規タスクを作る`,
    openHint: (column: string) => `${column} 列に新規タスクを作ります`,
    openBlocked: (column: string, reason: string) =>
      `${column} 列の新規タスク入力は使えません: ${reason}`,
    titleLabel: (column: string) => `${column} 列の新規タスクの title`,
    create: "作成",
    createHint: "このセルにタスクを作成します",
    /**
     * Why a canonical column has no 入口 at all (doc-7 §4.1 の入口を置かない). Names the column,
     * because this is a per-project fact — the same column has 候補 in a project that declares one.
     */
    noCandidate: (column: string) => `${column} 未設定`,
    /**
     * Why nothing is issued from a cell whose status never resolved to a 候補. Reachable only through
     * a caller that issues from a cell with no 入口, and kept for exactly that: an omitted `-s` is
     * not a neutral default but a create that lands in `default_status`'s column (doc-5 §3).
     */
    noStatusToPass: "この列で渡す status が決まっていないため発行しません。",
  },
  /** プロジェクト登録の層 (doc-3 §4.1). */
  projectRegister: {
    heading: "プロジェクトを登録",
    readOnlyNotice:
      "登録ファイルの schema_version がこのビルドより新しいため、読み取り専用で開いています。登録はできません。",
    readOnlyPickReason: "登録ファイルが読み取り専用のため、フォルダを選んでも登録できません。",
    readOnlyBlocked: "登録ファイルが読み取り専用のため、プロジェクトを登録できません。",
    busyBlocked: "登録の更新を実行中です。完了するまで登録は始められません。",
    registered: (slug: string) => `${slug} を登録しました。スイムレーンに行が 1 本増えます。`,
    backlogRootDefaultPlaceholder: "既定は <プロジェクトルート>/backlog",
    /**
     * **Fragments, because the sentence has three `<code>` runs inside it.** One string would have to
     * carry markup, and neither catalog may hand markup to the template (decision-28). Split at the
     * markup boundaries rather than at grammatical ones, so each language keeps its own word order
     * around the same three paths.
     */
    backlogRootHint: {
      lead: "指定しない場合は",
      asBacklogRoot: "を Backlog ルートとして",
      conjunction: "と",
      tail: "を確認します。",
    },
    slugPlaceholder: "英小文字・数字・ハイフン",
    /** Fragments for the same reason as `backlogRootHint`. */
    slugHint: {
      lead: "未指定なら",
      tail: "をプロジェクトルート名から導出して使います。別の slug を使う場合はここに入力してください。",
    },
    slugUnderivable: "プロジェクトルート名から slug を導出できません。slug を指定してください。",
    submit: "登録",
    submitting: "登録中…",
    submitHint: "入力の内容でプロジェクトを登録します",
    /** Why the 登録モーダル will not take a close request right now (doc-11 §7). */
    registering: "登録中です",
    /** 入力の指摘 (doc-3 §4.1/§4.3), printed under the field each is about. */
    problem: {
      projectRootRequired: "プロジェクトルートを指定してください。",
      projectRootEmpty: "プロジェクトルートは空にできません。",
      projectRootNotAbsolute: "プロジェクトルートは絶対パスで指定してください。",
      backlogRootEmpty: "Backlog ルートは空にできません。",
      backlogRootNotAbsolute: "Backlog ルートは絶対パスで指定してください。",
      slugTaken: (slug: string) => `slug ${slug} は既に登録済みです。別の slug を指定してください。`,
      /** doc-3 §3.1 の slug の文法. The value is quoted, so an empty one needs a word of its own. */
      slugGrammar: (slug: string) =>
        `slug ${slug} は使えません。` +
        "英小文字・数字で始まり、以降は英小文字・数字・ハイフンのみ（: と空白は不可）です。",
      emptySlug: "（空）",
      aliasKeyMissing: "別名表に status 名の無い行があります。",
      /** 名称一致 (decision-4): two keys differing only in case or space are one status. */
      aliasKeyDuplicate: (key: string) =>
        `別名表の status ${key} が重複しています（大文字小文字・前後空白は同一と見なします）。`,
      aliasValueNotCanonical: (key: string, value: string) =>
        `${key} の対応先 ${value} は正準ステータス列ではありません。`,
      aliasValueUnset: "（未選択）",
    },
    /** 台帳操作の拒否 (doc-3 §4), one per typed `LedgerRefusal`. No message text is ever parsed. */
    refusal: {
      notARefusal: (detail: string) => `登録を更新できません: ${detail}`,
      readOnly: (schemaVersion: number) =>
        `登録ファイルの schema_version ${schemaVersion} はこのビルドが読める版より新しい` +
        "ため、上書きを拒否しました（読み取り専用）。Atlas を更新するまで登録は変更できません。",
      backlogRootInvalid: (path: string) =>
        `${path} は Backlog ルートとして読めません（config.yml と tasks/ が必要です）。` +
        "Backlog ルートを指定し直してください。",
      slugNotFound: (slug: string) =>
        `slug ${slug} の登録内容がありません（別の画面で削除された可能性）。一覧を読み直してください。`,
      nonAbsoluteRoot: (path: string) =>
        `${path} は絶対パスではありません。絶対パスで指定してください。`,
      duplicateRoot: (slug: string) =>
        `このプロジェクトルート／Backlog ルートは既に slug ${slug} に登録されています。` +
        "1 プロジェクト 1 エントリのため、別のルートを指定するか、そのエントリを編集してください。",
      invalidStatusAlias: (key: string, value: string, canonical: string) =>
        `別名 ${key} → ${value} は不正です。対応先は ${canonical} のいずれかにしてください。`,
    },
  },
  /** タスク詳細パネル (doc-8): the heading, the 編集卓, and the 区画 it draws. */
  taskDetail: {
    panelLabel: "タスク詳細",
    copyCrossId: "横断タスクID をコピー",
    crossIdLabel: "横断タスクID",
    /**
     * Why no 横断タスクID can be built (doc-4 §5 の解析不能, doc-3 §5.3). One string for the two
     * places the screen says it — the control's `title` and the sentence beside it — because
     * doc-11 §5 wants the reason readable without hovering, and two copies would drift.
     */
    crossIdUnavailable: "TASK-ID を読めないため横断タスクID を作れません（解析不能）。",
    copied: "横断タスクID をコピーしました。",
    copyFailed: "クリップボードへ書けませんでした。次の文字列を選択してコピーしてください。",
    /** 解析不能 (doc-4 §5): a required field the read layer could not get, named where it would be. */
    taskIdUnknown: "TASK-ID 不明",
    fileUnknown: "ファイル不明",
    previousTask: "前のタスクへ",
    nextTask: "次のタスクへ",
    headEdge: "先頭",
    tailEdge: "末尾",
    atEdge: (group: string, edge: string) => `${group}の${edge}です`,
    withinGroup: (group: string, step: string) => `${group}内の${step}`,
    positionUnknown: "スイムレーン上の位置不明",
    placementGroup: "詳細配置",
    /**
     * 既定印 (doc-8 §2.2) — the word alone, and the switch name that carries it. The three switches
     * are アイコンのみのボタン (doc-11 §2.4), so the visible 既定印 is the underline 画面設計案 02 puts
     * there and this word is how the same fact reaches a screen reader.
     */
    placementDefaultMark: "既定",
    placementIsDefault: (label: string, mark: string) => `${label}（${mark}）`,
    /** What the switch says about the 既定 beyond the mark, when the two differ. */
    placementStoredElsewhere: (label: string) =>
      `次回起動時は「${label}」で開きます（既定はそちらのままです）。`,
    placementNotStored: (reason: string) =>
      `この配置を既定として保存できませんでした（${reason}）。今の表示には効いています。`,
    statusUnreadable: "status を読めません",
    canonicalUnmapped: "正準列 未分類",
    canonicalColumn: (label: string) => `正準列: ${label}`,
    configUndeclared: "config.yml 未宣言",
    configNoStatuses: "config.yml に status 宣言なし",
    draftKnownStatus: "draft の既知 status",
    storageTerm: "保存区分",
    unresolved: "未解決",
    saveWithChord: (chord: string) => `保存 (${chord})`,
    transitionBusy: "更新を発行中です。完了するまで次の遷移は始められません。",
    unsavedWarn: (proceed: string) =>
      `未保存入力があります。破棄する前に「${proceed}」の確認を通します。`,
    externallyChanged:
      "このタスクのファイルが編集中に外部で変わりました（バージョン不整合）。入力はそのまま保持しています。" +
      "保存時に更新前競合検出を通します。",
    saved: "保存しました。",
    conflictStopped: (detail: string) =>
      `更新前競合を検出したため、CLI を起動せずに保存を止めました（${detail}）。未保存入力は保持しています。`,
    conflictDiscard: "最新を読み直してやり直す（入力を破棄）",
    conflictReapply: "入力を保持して最新版へ再適用する",
    conflictReapplyNote:
      "再適用は、触った項目だけを最新版の上に載せ直します（触っていない項目は最新のままです）。" +
      "内容を確かめてからもう一度保存してください。",
    postCheckMismatch: (fields: string[]) =>
      `保存は適用されましたが、再読込した内容が送信した内容と一致しません（${fields.join("・")}）。` +
      "照合の完了後〜書き込み完了の間に入った外部更新の可能性があります。",
    postCheckNote:
      "この間に入った外部更新は防げません。上書きで失われた場合、その内容は表示も復元もできません。",
    postCheckFresh: "表示は再読込後の最新内容です。未保存入力は残っていません。",
    acknowledge: "確認した（不整合の印を消す）",
    criteriaReordered:
      "最新版では Acceptance Criteria の並びが変わっていたため、番号で指していた削除・チェックの" +
      "指定は取り消しました（同じ番号が別の項目を指すため）。必要なら指定し直してください。",
    inconsistentHeading: "不整合",
    unknownSection: (name: string) => `未知セクション ${name}（保持のみ）`,
    addAssignee: "追加する assignee",
    done: "完了",
    notDone: "未完了",
    criteriaModeItems: "項目単位（増減・チェック）",
    criteriaModeReplace: "全体差し替え",
    toggleCriterion: (number: number, checked: boolean) =>
      `#${number} を${checked ? "未完了" : "完了"}にする`,
    undoRemove: "削除を取り消す",
    pendingAdd: (text: string) => `追加予定: ${text}`,
    addItem: "項目を追加",
    replaceAllNote:
      "保存時に既存の全項目を削除してから、ここにある項目を並び順どおり作り直します。",
    planHeading: "実装計画",
    notesHeading: "実装ノート",
    // The managed file's own headings, kept as they are spelled there. 実装計画・実装ノート are
    // the exception rather than the rule — doc-8 §3 itself writes `Description` and `Acceptance
    // Criteria` in Japanese prose, and these three have no 画面語 either. Inventing one would
    // leave a rule about which side each 区画 falls on, for no reader's benefit.
    definitionOfDoneHeading: "Definition of Done",
    commentsHeading: "Comments",
    finalSummaryHeading: "Final Summary",
    /** How many entries a Comments 区画 holds, so the count is readable while it is folded. */
    commentCount: (count: number) => `${count} 件`,
    /** A comment whose file carried no `author:` line (doc-4 §4). */
    commentAuthorUnknown: "author 未記録",
    commentCreatedUnknown: "created 未記録",
    notesReplace: "置換（--notes）",
    notesAppend: "追記（--append-notes）",
    notesAppendLabel: "実装ノート（追記）",
    noPullRequests: "References に Pull Request URL はありません",
    hostUnknown: "ホスト種別 不明",
    pullRequestNote:
      "Pull Request は References から抽出されます。References 欄に Pull Request URL を" +
      "追加してください。",
    referenceMissing: "参照欠損",
    transitionsHeading: "状態遷移",
    externalEditorHeading: "外部エディタで開く",
    /**
     * 外部エディタ経路 (doc-8 §7). Its own group inside this screen's, because the whole route is one
     * 区画 of the panel and its sentences are read together — the two notices before the launch, the
     * two controls, and what each failure means.
     */
    gitHistoryHeading: "Git 履歴欄",
    /**
     * Why Type is not editable, without naming which 導出元 the value came from: decision-20 gives
     * Type two of them and doc-8 §4 puts neither on the screen, so a sentence naming one would be
     * false for the other half of the values. doc-8 §4 dropped its 掲示要求 for the two grounds with
     * TASK-192 — they stay in the doc; what the reader needs from the screen is that no route here
     * reaches them.
     */
    typeNotEditable: "Type は Atlas では編集できません。",
    emptyTitle: "title は空にできません（必須項目で、空にすると解析不能として不整合表示になります）",
    noTaskIdForUpdate: "TASK-ID を読めないため更新操作の対象を指定できません",
    noTaskIdForUpdateUnparsed: "TASK-ID を読めないため更新操作の対象を指定できません（解析不能）",
    noStorageForUpdate: "保存区分を判別できないため更新操作を提供しません",
    noEditSession: "編集セッションを開いていません",
    /**
     * 保存区分別の可否 (doc-8 §6.5): why the two closed divisions and draft are read-only. **Neither
     * names the 外部エディタ経路** (doc-11 §8, TASK-192): it is one 区画 of this same screen and the
     * same one for every 不可, so naming it here adds no route the reader could not already take.
     * draft keeps 昇格, which is a control in this panel rather than a general way out.
     */
    draftReadOnly:
      "draft の内容編集は提供しません（CLI に draft の内容を編集する手段がないため）。" +
      "編集するにはタスクへ昇格します",
    closedReadOnly: "completed・archive のタスクは、CLI が更新を受け付けないため読み取り専用です",
    /**
     * The task's file left the read result while the panel was open. The 未保存入力 is not the file's
     * to take (doc-8 §6.4 keeps it), which is why the sentence says what to do with it.
     */
    fileMissing:
      "このタスクのファイルが現在の読み取り結果にありません（外部での移動・削除の可能性）。" +
      "CLI 経由の更新はできません。未保存入力は保持しているので、必要な内容を控えてから破棄してください",
    /** 縮退 (doc-5 §5): why updates are not offered while the CLI is missing or out of range. */
    readiness: {
      checking: "backlog CLI の確認中です",
      unavailable: (detail: string) =>
        `backlog CLI の実行ファイルを解決できないため更新操作を提供しません（${detail}）`,
      /**
       * **The one screen sentence that names a version** (decision-27 §2): its subject *is* the
       * difference between the user's CLI and the confirmed one, and both numbers are read off
       * `CliReadiness` rather than spelled here.
       */
      unsupported: (version: string, minimum: string) =>
        `backlog CLI ${version} は動作確認範囲外のため更新操作を提供しません（必要: ${minimum} 以上）`,
    },
    /** A CLI failure as the panel states it (doc-5 §5). */
    commandFailed: (what: string, how: string, reloadNote: string, stderr: string) =>
      `${what} が失敗しました（${how}）${reloadNote}: ${stderr}`,
    failureCause: {
      spawn: "起動できません",
      nonZero: (code: number | null) => `終了コード ${code ?? "不明"}`,
      timedOut: (seconds: number) => `${seconds} 秒以内に終了しなかったため中断しました`,
      /** 直接書き込み操作 (decision-21): no exit code to quote and no process to blame. */
      write: "書き込めません",
    },
    /**
     * What 要再読込 means for *this* failure. The two read differently on purpose: after an earlier
     * invocation the screen can say what already landed, while a 期限到達 cannot — Atlas killed the
     * process and nothing tells it whether the write happened (decision-18).
     */
    reloadNoteApplied: (completed: number) =>
      `（この操作の ${completed} 件は既に適用済みで、再読込済みです）`,
    reloadNoteUnknown:
      "（この操作が管理ファイルを変更したかどうかは分かりません。再読込済みです）",
    /** A boundary failure as the panel states it, one entry per `CommandError` kind. */
    commandError: {
      cliUncheckable: "backlog CLI を確認できません",
      /** 更新アダプター is doc-5 §1's name for the part that refused; the reader has only the update. */
      updateRejected: (detail: string) => `更新を実行前に拒否しました: ${detail}`,
      /**
       * 照合不能 (doc-9 §4.2) worded so it does not read as a conflict — no version divergence was
       * observed, and there is no defined way to look for one (doc-9 §5).
       */
      uncheckableTarget: (what: string, detail: string) =>
        `照合不能: ${what} は書き換え対象の照合方法が定まっていないため、CLI を起動せずに` +
        `拒否しました。版がずれていることを検出したわけではありません。${detail}`,
      reloadFailedNotApplied: (detail: string) =>
        `再読込に失敗しました（更新は実行していません）: ${detail}`,
      reloadFailedApplied: (detail: string) =>
        `更新は適用されましたが再読込に失敗しました。同じ操作をやり直さないでください: ${detail}`,
      versionProbeFailed: (detail: string) =>
        `更新前競合検出の版読み取りに失敗しました: ${detail}`,
      taskNotFound: (taskId: string) =>
        `${taskId} は現在の読み取り結果にありません（削除・移動の可能性）`,
      projectNotOpen: (slug: string) => `プロジェクト ${slug} が開かれていません`,
      unknownProject: (slug: string) => `プロジェクト ${slug} は登録されていません`,
      rootUnreadable: (detail: string) => `ルートを読めません: ${detail}`,
      unknownManagedFile: (path: string) =>
        `${path} は現在の読み取り結果のタスクファイルではありません（移動・削除の可能性）`,
      editorUnavailable: (reason: string) => `外部エディタを起動できません: ${reason}`,
      editorLaunchFailed: (program: string, reason: string) =>
        `${program} を起動できません: ${reason}`,
      settingsSaveFailed: (detail: string) => `設定を保存できませんでした: ${detail}`,
      historyCancelled: "Git 履歴の読み取りは画面の側で取り消されました",
      bodyLinkFailed: (reason: string) => `リンクを開けませんでした: ${reason}`,
      bodyImageRefused: (reason: string) => `画像を読めませんでした: ${reason}`,
    },
    /** 照合後競合窓の事後通知 (doc-9 §5) where the re-read holds no such file at all. */
    divergedTaskFile: "タスクファイル（再読込結果に見当たりません）",
    noTaskIdForTransition: "TASK-ID を読めないため状態遷移の対象を指定できません",
    noStorageForTransition: "保存区分を判別できないため状態遷移を提供しません",
    noWayBackFromClosed: "completed・archive から戻す操作は CLI にないため提供しません",
    unsavedBeforeTransition: "未保存の入力があります。保存またはキャンセルしてから実行します",
    completableOnly: (status: string, current: string) =>
      `status が ${status} のときのみ実行可能です（現在: ${current}）`,
    /** Where a status is quoted inside another sentence and the read layer had none. */
    statusUnreadableShort: "不明",
    /**
     * 状態遷移 (doc-8 §6.5) — four strings per transition, keyed by `TransitionKind` so a sixth
     * cannot be added without the compiler asking what each of its four says.
     *
     * `effect` states 遷移が何を変えるか だけ (doc-11 §8 の結果の予告): the 写像 is on the button and
     * the 保存区分 is on screen beside it, so what is left is whether the id survives and whether the
     * move can be taken back. **The five are deliberately not parallel** — each says only what its
     * own transition raises.
     *
     * `question` is not built from `effect`: that line answers 「この控えは何をするか」 before the press
     * and carries 完了整理's precondition, which is already satisfied by the time the question stands.
     * `proceed` names the act (doc-11 §12), so it cannot be derived from the question either. **The
     * three one-way moves say 戻せません plainly and name no version** (the user's wording, 2026-08-11;
     * decision-27 §2 later made that the general rule).
     */
    transition: {
      draftPromote: {
        label: "タスクへ昇格",
        effect: "id は採番し直されます",
        question: "この draft をタスクへ昇格します。id は採番し直されます。",
        proceed: "タスクへ昇格する",
      },
      draftArchive: {
        label: "アーカイブ",
        effect: "id・status は保持されます",
        question: "この draft をアーカイブします。この操作は戻せません。",
        proceed: "アーカイブする",
      },
      taskDemote: {
        label: "draft へ差し戻す",
        effect: "id は採番し直されます",
        question: "このタスクを draft へ差し戻します。id は採番し直されます。",
        proceed: "draft へ差し戻す",
      },
      taskArchive: {
        label: "アーカイブ",
        effect: "元に戻せません",
        question: "このタスクをアーカイブします。この操作は戻せません。",
        proceed: "アーカイブする",
      },
      taskComplete: {
        label: "完了整理",
        effect: "status が Done のときのみ実行可能です。元に戻せません",
        question: "このタスクを完了整理します。この操作は戻せません。",
        proceed: "完了整理する",
      },
    },
    /** A value the file carries that `config.yml` does not declare (decision-4 未分類 status). */
    undeclaredValue: (value: string) => `${value}（config.yml 未宣言）`,
    milestoneNotInRoot: (id: string) => `${id}（このルートに無い）`,
  },
  /** プロジェクト詳細画面 (doc-10): 概要・文書・マイルストーン・決定事項 と、その発行の層. */
  projectDetail: {
    breadcrumbLabel: "現在地",
    /** 区画ナビ の 5 項目 (doc-10 §3), in the order that section's table gives them. */
    section: {
      overview: "概要",
      documents: "文書",
      milestones: "マイルストーン",
      decisions: "決定事項",
      newTask: "新規タスク",
    },
    /** 発行 が 1 つ走っている間、どの 発行 も保留になる (doc-11 §5). */
    issueBusy: "発行中です",
    /** A value quoted inside a sentence where the field is empty. */
    emptyValue: "（空）",
    /**
     * What changing the slug would take, and what that would break — doc-10 §4.1's two points and
     * nothing besides. **Why it has no field is deliberately not here** (TASK-188): §4.1's ground
     * for it (slug is the left-hand side of every cross-project task ID, so every task references
     * it) is a sentence about the design's own model, and doc-11 §8 の 設計文の写し keeps that off
     * the screen. A reader who cannot change it has no use for why the design cannot offer it.
     */
    slugImmutable:
      "変更できません。別の slug にするには登録を解除して登録し直すことになり、" +
      "そのとき Git 履歴表示の同一性が切れます。",
    /**
     * The note under the project-root field once it differs (doc-10 §4.1). **「同一プロジェクトの
     * 移動として扱い」 is not here** (TASK-188): that is doc-3 §3.2's name for how the ledger
     * classifies the change, and what §4.1 asks the screen for is which values will travel.
     */
    rootMoveNote: (slug: string, backlogRoot: string) =>
      `slug ${slug} を保ったまま project_root と backlog_root の` +
      `両方を送ります。backlog_root は既定の <新ルート>/backlog ではなく、いま欄にある ` +
      `${backlogRoot} を送ります。` +
      "移動が成立すると、このプロジェクトについて開いている編集セッションは閉じます。",
    /** Git remote の現在値 (doc-10 §4.1, decision-6). */
    remoteAbsent: "Git remote 不在（このリポジトリに remote が構成されていません）",
    noRepository: "Git 対象不在（プロジェクトルートが Git リポジトリではありません）",
    remoteUnreadable: (detail: string) => `remote を読めません: ${detail}`,
    /** 状態文 (doc-11 §8): what the registry recorded and what Git says now disagree. */
    remoteRecordedAbsent: "登録内容の Git remote 有無属性は「なし」で、いまの検出と食い違っています。",
    remoteRecordedPresent: "登録内容の Git remote 有無属性は「あり」で、いまの検出と食い違っています。",
    redetect: "再検出する",
    redetecting: "再検出中…",
    redetectReadOnly: "登録ファイルが読み取り専用のため、Git remote の再検出はできません。",
    /** status 別名表の効き方 (doc-10 §4.2), one per `interpret::status`'s `StatusDeclaration`. */
    aliasEffect: {
      declared: {
        label: "宣言あり",
        note: "config.yml の statuses にある status です。別名が効きます。",
      },
      draft: {
        label: "draft 専用",
        note: "config.yml は宣言していませんが、既知の draft 状態として扱う値です。別名が効きます。",
      },
      noDeclaredSet: {
        label: "宣言集合なし",
        note:
          "config.yml が statuses を 1 つも宣言していないため、宣言済みかを判定できません" +
          "（statuses を 1 つも宣言していない未初期化のルート）。宣言が矛盾しないので別名は効きます。",
      },
      undeclared: {
        label: "宣言なし → 効果なし",
        note:
          "どこにも宣言が無い status です。別名を書いてもこの status のタスクは未分類区画に残ります。" +
          "登録内容からは削除しません。",
      },
    },
    /**
     * Why every 区画 stops issuing while this screen's own ledger write is in flight. A save may be a
     * move, and a move changes which files this screen's ids name. Distinct from `issueBusy`, which
     * is about another 発行 running.
     */
    ledgerWriteInFlight: "登録内容の更新を実行中です。ルートが変わることがあるため、完了するまで発行できません",
    /** The 上部帯 ③ is 縮約 to one line; this is the 別の場所 it sends the reader to (doc-10 §8). */
    overviewReadOnly:
      "登録ファイルの schema_version がこのビルドより新しいため、読み取り専用で開いています。" +
      "この区画の入力・保存・登録解除はすべてできません。" +
      "文書・マイルストーン・新規タスクは登録ファイルを書かないので、そちらは操作できます。",
    overviewReadOnlyBlocked: "登録ファイルが読み取り専用のため、登録内容の更新はできません。",
    overviewBusy: "登録の更新を実行中です。完了するまで次の操作は始められません。",
    overviewNoChanges: "変更がありません（送る属性がありません）。",
    overviewInputProblems: "入力に問題があります（各欄の指摘を参照）。",
    /** What 登録解除 removes and what it leaves (doc-3 §4.2). */
    unregisterScope:
      "登録解除はこのプロジェクトの登録内容を消し、スイムレーンからこの行を外します。" +
      "対象プロジェクトの Backlog ルート・管理ファイル・Git リポジトリには触れません。" +
      "タスクはそのまま残ります。",
    unregisterReadOnly: "登録ファイルが読み取り専用のため、登録解除はできません。",
    unregisterConfirmSlug: (slug: string) =>
      `確認のため、この欄に slug「${slug}」をそのまま入力してください。一致するまで実行できません。`,
    /** 文書更新 (doc-10 §5). */
    docTitleEmpty: "title を空にはできません（空にすると文書として読めなくなります）",
    divergedDocument: "文書（再読込結果に見当たりません）",
    /** マイルストーン (doc-10 §6). */
    nameRequiredReason: "名称は必須です",
    renameRequiredReason: "新しい名称は必須です",
    renameUnchanged: "現在の名称と同じです（変更が無いので発行しません）",
    removeHandlingRequired: "参照するタスクの扱いを選んでください",
    reassignTargetRequired: "付け替え先のマイルストーンは必須です",
    reassignTargetIsSelf: "付け替え先が削除するマイルストーン自身です",
    /**
     * 削除はファイルを消さない (doc-9 §4.2.1 実測): the file moves to `archive/milestones/`. Stated
     * beside the control because 削除 otherwise reads as an unlink. **The version measured stays in
     * doc-9 §4.2.1 and off the screen** (decision-27), **and so does the word 実測 itself**
     * (TASK-188) — it points at doc-9's act of measuring, not at anything the reader can act on.
     */
    removeMovesTheFile: "削除はマイルストーンのファイルを消さず `archive/milestones/` へ移します",
    keepLeavesDangling:
      "「そのまま保持」では、参照するタスクが解決先の無い milestone 値を持ったまま残ります",
    /**
     * Why a `##` may not start a line of the 説明 (doc-10 §6). **Not「CLI にできない」** — v1.50.1's
     * `milestone add -d` writes such a description without complaint; what happens is that the read
     * stops at the next `##`, so the rest would be saved and invisible. **The parsing rule itself is
     * not on screen** (TASK-188): 「読み取りは次の `##` までを説明として扱う」 is doc-10 §6's sentence
     * about the read layer, and what the reader can act on is what becomes of the text they wrote.
     */
    descriptionHeading:
      "説明の行頭に `##` は置けません。その `##` から先に書いた分は、" +
      "保存しても画面に出なくなります",
    descriptionUnchanged: "説明は変更されていません",
    /** 注記モーダル (doc-10 §7): where the fields this form has no input for are added instead. */
    taskCreateNote: "以下の内容は作成後、タスクの編集で追加・編集してください。",
    /** One of those field names. The other four are identifiers or already in `taskDetail`. */
    dependenciesField: "依存",
    /** 発行結果 (doc-9 §5) for the one outcome that is not simply the operation's own report. */
    outcomeConflict: (detail: string) =>
      `${detail}。CLI を起動せずに中止しました` +
      "（更新前競合）。最新を読み直したので、内容を確かめてからやり直してください",
    sectionsLabel: "区画",
    taskCount: (n: number) => `タスク ${n}`,
    countUnreadable: "件数はルート読取不能のため出せません",
    toLane: "このプロジェクトのレーンへ",
    sectionUnreadable:
      "ルートが読めないため、この区画の一覧と発行は出せません。概要区画でルートを直してください" +
      "（登録内容自体は読めています）。",
    /** 概要（登録内容）: the one 区画 that writes the registry file rather than a management file. */
    overviewHeading: "概要（登録内容）",
    matchDefault: "既定に合わせる",
    remoteName: (name: string) => `（${name}）`,
    aliasLegend: "status 別名表",
    aliasNote:
      "プロジェクト固有の status を正準ステータス列へ対応づけます。既定は空で、Backlog.md 既定の" +
      "4 status は名称一致するため設定は要りません。",
    aliasKeyPlaceholder: "プロジェクトの status",
    aliasInvalid: (value: string) => `${value}（不正: 正準列ではありません）`,
    aliasRemoveByIndex: (index: number) => `${index} 行目を削除`,
    aliasRemoveByKey: (key: string) => `${key} の行を削除`,
    aliasRemoveHint: "この行を削除",
    aliasUncheckable: "ルート読取不能のため、この別名が効くかを判定できません",
    aliasAdd: "別名を追加",
    attributesHeading: "保存で送る属性",
    attributesNone: "変更なし（送る属性はありません）。",
    before: "変更前",
    after: "変更後",
    saveHint: "上に並べた属性を登録内容へ書きます",
    unregisterHeading: "登録解除",
    unregisterConfirmLabel: "確認: slug を入力してください",
    unregisterHint: "このプロジェクトの登録を解除します",
    unregister: "登録を解除",
    moved: (slug: string) =>
      `${slug} を移動しました。開いていた文書・マイルストーンの編集セッションは、` +
      "旧ルートの読み取りに基づくため閉じました。",
    entryUpdated: (slug: string) => `${slug} の登録内容を更新しました。`,
    remoteRedetected: (slug: string) => `${slug} の Git remote を再検出しました。`,
    /**
     * 照合後競合窓の事後通知 for this screen's own 発行 (doc-9 §4.1/§5). Worded apart from the
     * conflict the check prevents: this one was not prevented.
     */
    diverged: (fields: string[]) =>
      `更新は適用されましたが、再読込した内容が送信した内容と一致しません（${fields.join("・")}）。` +
      "照合の完了後〜書き込み完了の間に入った外部更新の可能性があります。この間に入った更新が" +
      "上書きで失われた場合、その内容は表示も復元もできません。",
    discardAndContinue: "破棄して続行",
    backToInput: "入力に戻る",
    documentsHeading: "文書",
    documentsEmpty: "文書はありません。",
    documentsCount: (n: number) => `文書 ${n} 件`,
    documentNew: "新規文書",
    documentNewHint: "文書の作成を開きます",
    documentOpenHint: "この文書を開きます",
    documentEditOpenHint: "この文書の編集を開きます",
    documentIssuingBlocksOthers: (reason: string) => `${reason}。完了するまで別の文書は開けません。`,
    documentIssuingBlocksEdit: (reason: string) => `${reason}。完了するまでこの文書の編集は開けません。`,
    documentUnsavedOnClose: "文書の編集に未保存入力があります。編集を閉じると破棄されます。",
    documentUnsavedOnOpen: (id: string) =>
      `文書の編集に未保存入力があります。${id} を開くと破棄されます。`,
    documentUpdateHeading: (id: string) => `${id} を更新`,
    documentUpdate: "文書を更新",
    documentCreateHeading: "文書を作成",
    documentCreate: "文書を作成",
    documentCreated: "文書を作成しました。",
    documentUpdated: "文書を更新しました。",
    pickDocumentFirst: "編集する文書を選んでください",
    documentNotSelected: "文書が選択されていません",
    bodyReplaceNote: "保存すると、ここにある全文で本文を置き換えます。",
    keepUnchanged: "—（変更しない）",
    pathLabel: "path（移動する場合のみ）",
    pathUnreadable: "現在の所在は読み取れません（この文書は最新の読み取りに見当たりません）。",
    pathCurrent: "現在の所在:",
    pathPlaceholder: "空欄なら変更しません",
    addTag: "追加するタグ",
    docPathPlaceholder: "docs 配下の下位パス（任意）",
    cliDefault: "—（CLI の既定）",
    typeUnset: "type 未設定",
    tagsNone: "tags なし",
    bodyEmpty: "本文はありません。",
    editing: "編集中",
    unsaved: "未保存",
    unmappedFiles: (n: number) => `写せなかったファイル ${n} 件`,
    milestonesHeading: "マイルストーン",
    milestonesEmpty: "マイルストーンはありません。",
    milestonesCount: (n: number) => `マイルストーン ${n} 件`,
    milestoneNew: "新規マイルストーン",
    milestoneNewHint: "マイルストーンの作成を開きます",
    milestoneOpenHint: "このマイルストーンを開きます",
    milestoneEditOpenHint: "このマイルストーンの編集を開きます",
    milestoneIssuingBlocksOthers: (reason: string) =>
      `${reason}。完了するまで別のマイルストーンは開けません。`,
    milestoneIssuingBlocksEdit: (reason: string) =>
      `${reason}。完了するまでこのマイルストーンの編集は開けません。`,
    milestoneUnsavedOnClose:
      "マイルストーンの編集に未保存入力があります。編集を閉じると破棄されます。",
    milestoneUnsavedOnOpen: (id: string) =>
      `マイルストーンの編集に未保存入力があります。${id} を開くと破棄されます。`,
    milestoneEditHeading: (id: string) => `${id} を編集`,
    milestoneCreateHeading: "マイルストーンを作成",
    milestoneCreate: "マイルストーンを作成",
    milestoneCreated: "マイルストーンを作成しました。",
    milestoneDescriptionSave: "説明を保存",
    milestoneDescriptionUpdated: (id: string) => `${id} の説明を更新しました`,
    milestoneDescriptionPlaceholder: "説明なし",
    milestoneDescriptionEmpty: "説明はありません。",
    milestoneNotSelected: "マイルストーンが選択されていません",
    heldTasks: (n: number) => `所属タスク ${n} 件`,
    nameRequired: "名称（必須）",
    rename: "改称",
    renameNewName: "新しい名称（必須）",
    renameUpdatesTasks: "参照するタスクも更新する（外すと --no-update-tasks）",
    renameNote: (id: string) =>
      `改称は id（${id}）を変えないため、実際に書き換わるのは milestone 値が id 以外のタスクだけです。`,
    remove: "削除",
    removeTasksLegend: "参照するタスクの扱い（必須）",
    removeTasksClear: "milestone 値を除去する（clear）",
    removeTasksKeep: "そのまま保持する（keep）",
    removeTasksReassign: "別マイルストーンへ付け替える（reassign）",
    reassignTarget: "付け替え先（必須）",
    chooseOne: "選択してください",
    archive: "アーカイブ",
    archiveNote:
      "マイルストーンのファイルを archive/milestones/ へ移します。参照するタスクは書き換わりません。",
    rewriteTargetsHeading: "書き換え対象",
    rewriteTargets: (n: number) =>
      `参照するタスク ${n} 件も併せて書き換わります（参照追随書き換え）。`,
    rewriteNone: "参照するタスクは書き換わりません。",
    renamed: "マイルストーンを改称しました。",
    removed: "マイルストーンを削除しました。",
    archived: "マイルストーンをアーカイブしました。",
    issueRename: "改称を発行",
    issueRemove: "削除を発行",
    issueArchive: "アーカイブを発行",
    decisionsHeading: "決定事項",
    decisionsEmpty: "決定事項はありません。",
    decisionsCount: (n: number) => `決定事項 ${n} 件`,
    decisionOpenHint: "この決定事項を開きます",
    decisionNotSelected: "決定事項が選択されていません",
    statusUnset: "status 未設定",
    dateUnset: "date 未設定",
    taskNewHeading: "新規タスク",
    taskCreate: "タスクを作成",
    taskCreated: "タスクを作成しました。",
    taskNoteLabel: "作成後に追加できる項目",
    configDefaultStatus: "—（config.yml の既定 status に任せる）",
    unset: "—（未設定）",
    labelNote: "カンマを含むラベルは登録できません。",
  },
  /**
   * 印 と 理由行 (decision-22, doc-9 §5): the words a ⚠️ or a 継続検出停止 chip stands for, wherever
   * either is drawn. **Not one screen's** — the card, the detail heading and the row's own chip all
   * read the same lines, which is what keeps two screens from disagreeing about one file's state.
   */
  mark: {
    /** What separates two 理由行 inside one label. Not `state.listSeparator`: these are clauses. */
    reasonSeparator: " / ",
    divergedFiles: (files: string) => `読み取り後に外部で変わったファイル: ${files}`,
    unreadFiles: (files: string) =>
      `読み取り後に増えたタスクファイル: ${files}` +
      "（書き換え対象集合が読取時点と違いうるため、照合できません）",
    versionUnverified: "照合対象の版が確かめられませんでした",
    /**
     * What a file is called in a 理由行 — the noun of the thing that failed, not a family name.
     * `decision` reads 決定事項 and not doc-4 §1's 意思決定 (TASK-118): these are printed for the
     * user, so they take the 画面に出る語.
     */
    managedFileNoun: {
      task: "タスク",
      milestone: "マイルストーン",
      document: "文書",
      decision: "決定事項",
    },
    unexpectedSchema: (detail: string) => `想定外スキーマ: ${detail}`,
    danglingReference: (kind: string, target: string) => `参照欠損: ${kind} ${target}`,
    /**
     * 解析不能 as lines. All three say 解析不能, the `detail` one included: doc-4 §5 defines
     * 想定外スキーマ as 「frontmatter は読めるが」, and 解析不能 is the case where it could not be read
     * at all.
     */
    unparseableFields: (fields: string) => `解析不能: ${fields} を読めません`,
    unparseableDetail: (detail: string) => `解析不能: ${detail}`,
    unparseableAs: (noun: string) => `解析不能: このファイルを${noun}として写せませんでした`,
    /**
     * バージョン不整合 (doc-9 §5): both stages, told apart by their evidence rather than by name.
     * **The second one does not name 照合後競合窓** (TASK-188): doc-9 §1 defines that as the interval
     * from the end of the check to the end of the write, and no part of the screen shows it — what §5
     * asks for is that the two 理由行 be told apart, which 更新前 / 保存後 already does. 更新前競合 stays
     * because the screen uses it elsewhere (`conflictStopped`・`outcomeConflict`), so it is a word the
     * reader has met.
     */
    preUpdateConflict: (detail: string) =>
      `バージョン不整合: 更新前競合 — ${detail}。CLI を起動せずに保存を止めました`,
    postCheckConflict: (fields: string) =>
      `バージョン不整合: 保存後に判明 — 再読込した内容が送信した内容と一致しません（${fields}）。` +
      "保存中に入った外部更新が上書きで失われた可能性があります",
    /** The ⚠️'s accessible name (doc-11 §2.4) — the figure leaves nothing behind for a reader. */
    inconsistentLabel: (reasons: string) => `不整合: ${reasons}`,
    unwatchedLabel: "継続検出停止",
    unwatchedDetail:
      "ファイル監視または変更通知の購読が動いていないため、外部変更が画面へ届きません。" +
      "表示が実ファイルより古い可能性がありますが、版がずれているとは限りません。" +
      "再読込で現在の内容を読み直せます。",
  },
  /** Git 履歴欄 (doc-8 §5): the commit list, and the state of 関連解決. */
  gitHistory: {
    reload: "再取得",
    reloadHint: "Git 履歴を取り直します",
    loadingReason: "取得中です",
    reloadWithheld: (reason: string) => `${reason}。完了するまで再取得はできません。`,
    remainingCommits: (n: number) => `ほか ${n} 件（全件は全面シングルビューで読めます）`,
    noCommits: "対応コミット無し（このリポジトリに TASK-ID を含むコミットがありません）",
    noRepository: (root: string) =>
      `Git 対象不在: ${root} は Git リポジトリではないため、ローカル履歴も関連解決も出せません。`,
    unreadable: (detail: string) => `Git 履歴を読めません: ${detail}`,
    noTaskId: "TASK-ID が読めないため、コミット検索の鍵がありません。",
    relatedHeading: "関連 Pull Request",
    remoteAbsent:
      "Git remote 不在（登録内容の Git remote 有無属性が「なし」）のため関連解決なし。" +
      "ローカルコミット履歴は上のとおり表示します。プロジェクト詳細の概要区画で解消できます。",
    hostUndetermined:
      "remote ホスト種別を判別できないため関連解決の対象外です（未対応ホスト、または remote を読めません）。",
    notRead: (detail: string) => `関連解決は未実施です（${detail}）。`,
    /**
     * 全面で読める旨の導線 (doc-8 §5). Names the operation rather than copying §5's sentence, and it
     * is deliberately not 画面設計案 02's count form — this control is offered even when there is
     * nothing left to expand.
     */
    expand: "全面表示で開く →",
    /** 併置サイドバー の 1 行 (doc-8 §5 の件数のみ): the commit list said as a count. */
    commitCount: (n: number) => `コミット ${n} 件`,
    noCommitsShort: "対応コミット無し",
    noRepositoryShort: (root: string) => `Git 対象不在（${root} は Git リポジトリではありません）`,
    noTaskIdShort: "TASK-ID が読めないため未検索",
    noTaskIdForRemote: "TASK-ID が読めないため remote ホストを照会していません",
    /**
     * 原因ごとに書き分けた関連解決の状態 (doc-8 §5 全面シングルビュー), one per Pull Request. The
     * 参照不能 line carries its remedy, because 「関連が無い」 and 「今は確かめられない」 are what a
     * reader has to be able to tell apart.
     */
    accountRelated: (n: number) => `解決済み: このタスクのコミット ${n} 件と関連`,
    accountUnrelated: "解決済み: 共有コミット無し（この PR にこのタスクのコミットは含まれません）",
    accountUnsupported:
      "対象外: remote ホスト種別を判別できないため照会していません。" +
      "Atlas が参照できるホストではないため、この原因は解消できません。",
    accountFailed: (reason: string, remedy: string) =>
      `参照不能: ${reason}。今は確かめられないだけで、関連が無いという意味ではありません。${remedy}`,
    /** その原因が解消できるかどうか (doc-8 §5), one per `LookupFailure`. */
    remedy: {
      toolMissing: "参照手段を起動できていないため、gh を導入すれば解消できます。",
      invalidReference:
        "この参照からは照会先を決められないため、References の URL を直せば解消できます。",
      /** 解消経路が payload から確定できないので、確定できるかのような文言を当てない。 */
      queryFailed:
        "照会は実行され、失敗しました。認証・権限・PR の不在・ネットワークのいずれかで、" +
        "どれかはこの結果からは分かりません。再取得で解消することがあります。",
      timedOut:
        "期限内に応答が無かったので Atlas が照会を打ち切りました。" +
        "通信か GitHub 側が遅いときに起き、再取得で解消することがあります。",
    },
    /** 関連 PR を 1 行で言う (doc-8 §5). The caveats keep a bare count from reading as 関連が無い. */
    relationNoCommitList: "関連 PR: 突き合わせ不能（ローカルコミット一覧を読めません）",
    relationNoUrls: "関連 PR: 参照する Pull Request URL がありません",
    relationCaveatFailed: (n: number) => `${n} 件は参照不能`,
    relationCaveatUnsupported: (n: number) => `${n} 件は対象外`,
    relationCount: (n: number) => `関連 PR ${n} 件`,
    relationCountWithCaveats: (n: number, caveats: string) => `関連 PR ${n} 件（${caveats}）`,
    relationRemoteAbsent: "関連 PR: 解決なし（Git remote 不在）",
    relationHostUndetermined: "関連 PR: 対象外（remote ホスト種別を判別できません）",
    relationNotRead: (detail: string) => `関連 PR: 未実施（${detail}）`,
  },
  /** 一覧モーダル's table (doc-7 §2.1). */
  shortcutHelp: {
    keyColumn: "キー",
    actionColumn: "操作",
    scopeColumn: "使える場所",
    /** 使える場所 (doc-7 §2.1), one word per 適用範囲. A closed set — a seventh place needs a row here. */
    scope: {
      bothScreens: "スイムレーン・プロジェクト詳細",
      swimlane: "スイムレーン",
      overlay: "モーダル・メニュー・ポップオーバーの内側",
      modal: "モーダルの内側",
      editPart: "編集部品の内側",
      laneCreate: "列内新規タスク入力の内側",
    },
    /**
     * The two 欄 of the 割り当て一覧 that are words: 操作, and the name of the default this key stops.
     * Keyed by `ShortcutAction`, so a new chord cannot be added without both being written — and
     * `preventsDefault` is answered for every action, `null` included, so the set of keys that stop
     * a default cannot differ between the two languages.
     */
    assignment: {
      openRegister: {
        operation: "プロジェクトを登録",
        preventsDefault: "WebView の新規ウィンドウ",
      },
      openSettings: { operation: "設定", preventsDefault: null },
      toggleMenu: { operation: "メニューを開く／閉じる", preventsDefault: null },
      addFilter: {
        operation: "絞り込みを追加（値一覧を開く）",
        preventsDefault: "開いた検索欄への f の入力",
      },
      undoFilter: {
        operation: "直前の絞り込みを 1 件戻す",
        preventsDefault: "履歴の「戻る」",
      },
      closeOverlay: { operation: "開いている層を閉じる", preventsDefault: null },
      cycleModalFocus: {
        operation: "モーダル内の次／前の操作へ移動",
        preventsDefault: "フォーカスがモーダルの外へ出る",
      },
      /**
       * One operation with two words for it, because that is what the surface is: the chord confirms
       * the 編集部品 it is pressed in — 明示保存 in an 編集セッション (doc-8 §6.3), 作成 in the
       * 新規タスク区画's description field (doc-10 §7). Naming only 保存 would make the row wrong at
       * the second.
       */
      saveEditSession: {
        operation: "編集部品から発行（編集セッションは保存、作成フォームは作成）",
        preventsDefault: "改行の入力",
      },
      submitLaneCreate: {
        operation: "列内新規タスクを作成",
        preventsDefault: "改行の入力",
      },
    },
  },
  /** 本文編集の入力域. The one sentence it has is the fallback notice. */
  editor: {
    aceFallback: (reason: string) =>
      `Ace を読み込めなかったため textarea のまま編集します（操作は変わりません）: ${reason}`,
  },
  settings: {
    /** 表示言語 (decision-35) — the 設定画面's heading for the item. */
    languageHeading: "表示言語",
    /**
     * 言語未選択. Worded as what it does rather than as an absence, and worded *identically* to
     * 表示テーマ's 未選択 (`THEME_UNSET_LABEL`) — decision-35 requires the two options to read the
     * same, because they are the same kind of choice.
     */
    languageUnset: "システム設定に従う",
    /**
     * What each language is called in the list. Endonyms in both catalogs on purpose: a reader
     * looking for their own language finds it under the name they know, whichever language the
     * screen happens to be in at the time. So `en.ts` carries 日本語 as a value it is right to leave
     * untranslated — which is one of the reasons decision-35 §4 exempts **both** catalog files from
     * the leftover-Japanese scan rather than this one alone.
     */
    languageName: { ja: "日本語", en: "English" },
    /**
     * A stored 表示言語 or 表示テーマ this build does not have — a hand-edited file, or one written by
     * a later build. **One entry for both items**, because the sentence names the stored value rather
     * than which item it belongs to. Listed rather than dropped: dropping it would silently rewrite
     * the file on the next save (decision-13). A language in this state draws in the OS's language
     * until it is changed (`resolveLanguage`).
     */
    unrecorded: (name: string) => `${name}（このビルドには収録されていません）`,
    heading: "設定",
    loadingHint: "設定を読み込んでいます…",
    loadingReason: "設定を読み込んでいます",
    themeHeading: "表示テーマ",
    /**
     * 表示テーマ の 未選択 (decision-12). Worded identically to `languageUnset`, which is the pairing
     * decision-35 requires — the two are the same kind of choice, so they may not read two ways.
     */
    themeUnset: "システム設定に従う",
    /**
     * One 収録テーマ's 呼び名: its own name (never translated — `theme.ts` says why) and its 明暗.
     * The 明暗 word is *chosen from* [`themeSchemeLight`]/[`themeSchemeDark`] by the theme's declared
     * `scheme`, so a 呼び名 cannot state a ground the theme does not paint.
     */
    themeSchemeLight: "ライト",
    themeSchemeDark: "ダーク",
    themeName: (name: string, scheme: string) => `${name}（${scheme}）`,
    /** The two 未選択 resolves to say so in their own 呼び名 (decision-12 の既定). */
    themeNameDefault: (name: string, scheme: string) => `${name}（${scheme}・既定）`,
    /** A write asked for before the first read answered; nothing was written. */
    notReadYet: "設定をまだ読み込めていないため、保存していません",
    cardDensityHeading: "カード情報量",
    defaultStorageHeading: "既定の保存区分（フィルタの初期値）",
    defaultPlacementHeading: "既定の詳細配置",
    defaultOrderHeading: "既定の並び順",
    /** 注意の抑止 (decision-45 §6). 区画の説明は持たない — 控えの語で足りる (doc-11 §8)。 */
    noticeHeading: "外部で開くときの注意",
    suppressFrontmatterNotice: "frontmatter の注意を今後表示しない",
    watchHeading: "ファイル監視で外部変更を取り込む（継続検出）",
    watchToggle: "継続検出を使う",
    externalCommandsHeading: "外部コマンド",
    externalCommandsHint: "Atlas が利用する外部コマンドのパスを指定します。",
    probePending: "確認中",
    probeResolved: "解決済み",
    probeUnresolved: "解決できません",
    commandHelpLabel: (name: string) => `${name} の説明`,
    editorHeading: "外部エディタ指定",
    editorHint:
      "指定があればこれを使い、無ければ $VISUAL・$EDITOR を使います。" +
      "引数は 1 行に 1 つ書きます（シェルへ渡さないため、空白では区切りません）。" +
      "空欄にすると指定を解除します。",
    editorProgramLabel: "プログラム",
    editorProgramPlaceholder: "/Applications/… または code",
    editorArgsLabel: "引数（1 行 1 つ）",
    locationHeading: "ファイルの場所",
    /** カード情報量 (doc-7 §3) の 3 段, each naming what it adds over the one before. */
    cardDensity: {
      s: "S（ID・priority・印・title 1 行）",
      m: "M（＋ Type、title 2 行）",
      l: "L（＋ 通常ラベル・assignee、title 3 行）",
    },
    /**
     * カード情報量 が**減らさないもの**だけを言う。段の違いは選択肢そのものが述べているので、何が
     * 増えるかは書かない (doc-11 §8 の状態の言い換え) — 残すのは、S を選ぶと不整合印まで消えると
     * 読まれかねない一点だけである。
     */
    cardDensityNote: "タスクの状態（不整合・保存区分・未分類列 status）は、必ず表示されます。",
    /** 詳細配置 (doc-8 §2.1) の 3 つ. */
    detailPlacement: {
      sidebar: "併置サイドバー",
      modal: "中央モーダル",
      full: "全面シングルビュー",
    },
    storageIndeterminate: "不定（走査対象外の場所にあるファイル）",
    /** decision-13 既定値で動いている旨 (AC #6), split by cause: the three lead to different acts. */
    fileAbsent: "設定ファイルはまだありません。既定値で動いています（保存すると作成します）。",
    fileUnreadable: (detail: string) =>
      `設定ファイルを読めませんでした（${detail}）。既定値で動いています` +
      "（保存すると、この既定値で作り直します）。",
    fileReadOnly: (version: number) =>
      `設定ファイルの schema_version ${version} はこのビルドが理解する版より新しいため、` +
      "読み取り専用です。既定値で動いており、保存はできません（ファイルは書き換えません）。",
    saveRefusedNewer: (version: number) =>
      `設定ファイルの schema_version ${version} はこのビルドより新しいため、` +
      "上書きしません（新しい版で書かれた内容を壊さないため）。",
    /**
     * 外部コマンドの用途, shown behind the row's `?` rather than beside the field (doc-11 §8). The
     * row's own 印 already says whether the command resolved, so this carries only what the 印
     * cannot: what Atlas uses the command for, and therefore what stops without it.
     */
    externalCommandHelp: {
      backlog_cli:
        "作成・更新の発行に使います。解決できないと、発行そのものができません（画面上部に帯が立ちます）。",
      git_cli:
        "コミット検索と Git remote の判別に使います。解決できないと、登録済みプロジェクトが remote 無し" +
        "として記録され、Pull Request の関連解決も静かに止まります。",
      gh_cli:
        "Pull Request とコミットの関連解決に使います。解決できないと、その関連解決だけができません。",
    },
    /** 解決結果の出どころ (decision-29), shown inside the row's `?`. */
    programSource: {
      configured: "この画面の指定",
      subPackage: "npm の配置から解決",
      onPath: "PATH から解決",
    },
    probeUnlaunched: (reason: string) => `起動できません（${reason}）`,
    emptyStorageWarning:
      "保存区分をひとつも選ばないと、起動直後はどのカードも表示されません（フィルタで足せます）。",
    /**
     * 継続検出を切っている旨 (doc-9 §3.1). §3.1 requires the *state* to look the same as a watch that
     * failed to start — only the reason differs — so this says what stops and what still works, and
     * invents no second state name.
     */
    watchOffNote:
      "オフにすると、外部で更新された内容が自動で反映されません。" +
      "Atlas での更新後、また手動での再読み込みの時のみ反映されます。",
    /** 下部操作行 (TASK-74) の 2 つの押下 and the two reasons 保存する can be held. */
    closeWithoutSaving: "変更せずに閉じる",
    save: "保存する",
    noChanges: "変更はありません",
    /** 場所を開く (TASK-75). What is opened is the settings directory; no file is selected. */
    openLocation: "場所を開く",
    openLocationTitle:
      "設定ファイルと登録ファイルのあるフォルダを OS のファイルマネージャで開きます（ファイルは選択されません）。",
    openingLocation: "いま開いています（OS の応答を待っています）。",
    /** **述べるのはフォルダであって、その中のファイルの有無ではない** (doc-3 §2.1). */
    locationAbsent: "そのフォルダはまだありません（設定を保存するか、プロジェクトを登録すると作成します）。",
    /** 「フォルダが無い」と書き分ける — 問い合わせが返っていない状態で、無いことは分かっていない。 */
    locationUnconfirmed: "そのフォルダがあるかどうかを確認できていません。",
    openLocationFailed: (program: string, reason: string) =>
      `${program} で開けませんでした: ${reason}。`,
    openLocationUnavailable: (reason: string) => `場所を開けませんでした: ${reason}`,
    settingsFileTerm: "設定ファイル",
    ledgerFileTerm: "登録ファイル",
    discardHint: "書き込まずに閉じます",
    saveHint: "設定を書き込んで閉じます",
  },
  /**
   * 失敗理由符号 (decision-35 §3): the sentences the crate used to build. **A group per code set**,
   * named after the `wire.ts` type, because that is what a session adding a variant is looking at.
   *
   * Two of the four ways a launch fails have no entry here (`osRefused`, `exited`) and two of the
   * program failures use theirs only as a fallback — those are the codes whose reason is *what the
   * OS or the program said*, which arrives in `detail` and is not Atlas's text to translate
   * (decision-35 §5). `failure.ts` is where that split is applied.
   */
  failure: {
    /** 起動指定の解決順 came up empty (doc-8 §7). */
    editorUnavailable: "アプリ設定の外部エディタ指定・VISUAL・EDITOR のいずれも設定されていません",
    launch: {
      /**
       * `ShellExecuteW`'s own return codes. **A table on this side because the codes arrive as
       * numbers** (decision-35 §3): they collide with unrelated Win32 codes, so the OS cannot be
       * asked to describe them. The parenthesised `SE_ERR_*` names are Win32 identifiers and stay
       * as they are in both languages — they are what a reader searches Microsoft's documentation
       * with.
       */
      shellExecute: {
        outOfMemory: "OS のメモリ・リソースが不足しています",
        share: "共有違反です (SE_ERR_SHARE)",
        associationIncomplete: "関連付けが不完全です (SE_ERR_ASSOCINCOMPLETE)",
        ddeTimeout: "DDE の処理がタイムアウトしました (SE_ERR_DDETIMEOUT)",
        ddeFail: "DDE の処理に失敗しました (SE_ERR_DDEFAIL)",
        ddeBusy: "他の DDE 処理が進行中です (SE_ERR_DDEBUSY)",
        noAssociation:
          "この拡張子に関連付けられたアプリケーションがありません (SE_ERR_NOASSOC)",
        dllNotFound: "関連付け先の DLL が見つかりません (SE_ERR_DLLNOTFOUND)",
        /** A code outside the set above. Reachable only if Windows adds one. */
        unknown: (code: number) => `ShellExecuteW がコード ${code} を返しました`,
      },
      comInit: (hresult: string) =>
        `COM の初期化に失敗しました (CoInitializeEx が HRESULT ${hresult} を返しました)`,
      shellExecuteAbsent: "ShellExecuteW はこのプラットフォームにありません",
    },
    bodyLink: {
      schemeNotAllowed: "http:// と https:// のリンクだけを開きます",
      controlCharacter: "URL に制御文字が入っています",
    },
    bodyImage: {
      outsideAssets: "assets/ の外を指しています",
      absent: "ファイルがありません",
      unreadable: "ファイルを読めません",
    },
    probe: {
      spawnFailed: (program: string) => `${program} を起動できません`,
      /** Used only when the program exited writing nothing. */
      exited: "実行に失敗しました",
      noResponse: "応答がありません",
    },
    remoteRead: {
      gitUnavailable: "git を起動できません",
      /** Used only when git failed writing nothing to stderr. */
      gitFailed: "git の実行に失敗しました",
      remoteUrlEmpty: (name: string) => `remote 「${name}」の URL を読み取れませんでした`,
    },
    lookup: {
      toolMissing: "gh を起動できません",
      invalidReference: (value: string) =>
        `Pull Request URL の owner/repo が GitHub の名前として扱えません（${value}）`,
      /** Used only when gh exited writing nothing. */
      queryFailed: "gh の実行に失敗しました",
      timedOut: (seconds: number) =>
        `gh が ${seconds} 秒で応答しなかったので照会を打ち切りました`,
    },
    /**
     * What the 直接書き込み操作 is called where a CLI failure names its sub-command (doc-5 §1/§3).
     * Named after the doc-5 §3 operation rather than invented.
     */
    milestoneDescribe: "マイルストーン説明の更新",
  },
};
