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
     * screen happens to be in at the time. Identical entries in the two files is what keeps this
     * out of the scan as an exception — there is nothing here to except.
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
};
