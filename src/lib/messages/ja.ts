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
    saveFailed: (detail: string) => `保存できませんでした: ${detail}`,
    pick: "選択…",
    reload: "再読み込み",
    backToSwimlane: "スイムレーンへ戻る",
  },
  /** 入力欄そのものの名と補助文, for the fields more than one screen draws. */
  field: {
    titleRequired: "title（必須）",
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
    /** Every 全集合置換 field says this; the CLI replaces the set rather than appending. */
    replacesWholeSet: "保存時は既存を含む全集合で置き換えます。",
  },
  /**
   * 読み取り結果そのものの状態を言う短い文, for the states more than one screen shows. **A failure's
   * reason is not one of these** — those are `failure`'s.
   */
  state: {
    none: "なし",
    loading: "読み込み中…",
    titleUnknown: "（title 不明）",
    statusUnknown: "status 不明",
    storageUnknown: "保存区分不明",
    typeUnset: "Type 未設定",
    /** Appended to a value the read layer could not place among the known ones. */
    valueUnknown: "（未知）",
    count: (n: number) => `${n} 件`,
  },
  /** 被せ層 itself: `Modal.svelte`, and the footer 設定画面 draws in the same shape. */
  modal: {
    cannotPressNow: (reason: string) => `いま押せません: ${reason}`,
  },
  /**
   * 画面の外側の文: the bands, the notices, the states drawn where no screen is mounted, and the two
   * 被せ層 the shell itself opens. **Not "App.svelte's text"** — a sentence `App.svelte` draws that
   * belongs inside one screen is in that screen's group, and one drawn outside every screen belongs
   * here whichever file happens to draw it.
   */
  shell: {
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
  },
  /** タスク詳細パネル (doc-8): the heading, the 編集卓, and the 区画 it draws. */
  taskDetail: {
    panelLabel: "タスク詳細",
    copyCrossId: "横断タスクID をコピー",
    crossIdLabel: "横断タスクID",
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
    criteriaBodyNote:
      "既存項目の本文は項目単位では変えられません（CLI に本文編集の手段がないため）。本文を変える" +
      "ときは全体差し替えを使います。",
    addItem: "項目を追加",
    replaceAllNote:
      "保存時に既存の全項目を削除してから、ここにある項目を並び順どおり作り直します。",
    planHeading: "実装計画",
    notesHeading: "実装ノート",
    notesReplace: "置換（--notes）",
    notesAppend: "追記（--append-notes）",
    notesAppendLabel: "実装ノート（追記）",
    noPullRequests: "References に Pull Request URL はありません",
    hostUnknown: "ホスト種別 不明",
    pullRequestNote:
      "Pull Request URL の登録は References の編集です。下の References 欄へ足すと、" +
      "既存参照を含む非空全集合で置き換えます。",
    referenceMissing: "参照欠損",
    transitionsHeading: "状態遷移",
    externalEditorHeading: "外部エディタで開く",
    gitHistoryHeading: "Git 履歴欄",
  },
  /** プロジェクト詳細画面 (doc-10): 概要・文書・マイルストーン・決定事項 と、その発行の層. */
  projectDetail: {
    breadcrumbLabel: "現在地",
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
    stopEditing: "編集を止める",
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
    labelNote:
      "Type（kind ラベル）はここでは扱いません。ラベルは 1 個のカンマ区切り値として扱われる" +
      "ため、「,」を含むラベルは発行しません。",
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
  },
  /** 一覧モーダル's table (doc-7 §2.1). */
  shortcutHelp: {
    keyColumn: "キー",
    actionColumn: "操作",
    scopeColumn: "使える場所",
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
    cardDensityHeading: "カード情報量",
    defaultStorageHeading: "既定の保存区分（フィルタの初期値）",
    defaultPlacementHeading: "既定の詳細配置",
    defaultOrderHeading: "既定の並び順",
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
