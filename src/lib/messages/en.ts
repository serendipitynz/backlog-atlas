/**
 * The English 文言表 (decision-35), declared against `Catalog` — which is `typeof ja`. A key missing
 * here, a key here that `ja.ts` does not have, and a parameter list that drifted from the Japanese
 * one are all `pnpm run check` failures. That is the first of decision-35 §4's two stages; the second
 * is `screen-text.test.ts`, which looks for Japanese still spelled in a source.
 *
 * **Translate the sentence, not the words.** Several Japanese entries state a thing Japanese says in
 * one clause and English says in two; where that happens the English entry is written as English
 * rather than as a gloss, and the Japanese one is left as the 正本 of what is being said.
 */
import type { Catalog } from "../messages";

export const EN: Catalog = {
  settings: {
    languageHeading: "Language",
    // Reads as the same kind of option as 表示テーマ's, which is what decision-35 asks of the pair.
    languageUnset: "Follow system setting",
    // Endonyms, identical to the Japanese catalog's — see the note there.
    languageName: { ja: "日本語", en: "English" },
    languageUnrecorded: (name: string) => `${name} (not included in this build)`,
  },
};
