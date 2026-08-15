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
     * A stored 表示言語 this build has no 文言表 for — a hand-edited file, or one written by a later
     * build. Listed rather than dropped, for the reason 表示テーマ lists an unrecorded name: dropping
     * it would silently rewrite the file on the next save. It draws in the OS's language until it is
     * changed (`resolveLanguage`).
     */
    languageUnrecorded: (name: string) => `${name}（このビルドには収録されていません）`,
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
