import { afterEach, describe, expect, it } from "vitest";
import {
  CATALOGS,
  LANGUAGES,
  activeLanguage,
  isLanguage,
  msg,
  pluralize,
  resolveLanguage,
  setLanguage,
} from "./messages";

// The active language is module state (decision-35: a plain module, so the `node` project can run
// the pure modules that word a sentence). Left set, it would decide what a later file's test reads.
afterEach(() => {
  setLanguage("ja");
});

describe("resolveLanguage (decision-35 表示言語 / 言語未選択)", () => {
  it("takes the stored choice over the OS", () => {
    expect(resolveLanguage("en", "ja-JP")).toBe("en");
    expect(resolveLanguage("ja", "en-US")).toBe("ja");
  });

  it("follows the OS when nothing is stored (言語未選択)", () => {
    expect(resolveLanguage(null, "ja")).toBe("ja");
    expect(resolveLanguage(null, "ja-JP")).toBe("ja");
    expect(resolveLanguage(null, "en-GB")).toBe("en");
  });

  it("reads the primary subtag case-insensitively, which is what BCP 47 allows", () => {
    expect(resolveLanguage(null, "JA-JP")).toBe("ja");
    expect(resolveLanguage(null, "Ja")).toBe("ja");
  });

  it("gives English to an OS language this build has no 文言表 for", () => {
    // Not "the nearest match" and not a failure: decision-35 picks English because more readers of
    // an unlisted language can read it.
    expect(resolveLanguage(null, "fr-FR")).toBe("en");
    expect(resolveLanguage(null, "")).toBe("en");
  });

  it("treats a stored value it cannot honour as 言語未選択, not as a failure", () => {
    // decision-13's rule for a settings value this build does not recognise. The 設定画面 keeps
    // offering the stored value so a save does not silently drop it; what it *draws* in is this.
    expect(resolveLanguage("de", "ja-JP")).toBe("ja");
    expect(resolveLanguage("de", "en-US")).toBe("en");
  });
});

describe("表示言語 の切替", () => {
  it("changes which 文言表 msg() answers with", () => {
    expect(msg()).toBe(CATALOGS.ja);
    expect(setLanguage("en")).toBe(true);
    expect(activeLanguage()).toBe("en");
    expect(msg()).toBe(CATALOGS.en);
  });

  it("reports no change when the language is already in force", () => {
    // What the shell reads to decide whether anything has to be redrawn.
    setLanguage("en");
    expect(setLanguage("en")).toBe(false);
  });
});

describe("pluralize (decision-35 §1)", () => {
  it("selects the English singular for 1 and the plural otherwise", () => {
    const forms = { one: "1 task", other: "tasks" };
    expect(pluralize(1, forms, "en")).toBe("1 task");
    expect(pluralize(0, forms, "en")).toBe("tasks");
    expect(pluralize(2, forms, "en")).toBe("tasks");
  });

  it("selects `other` for every count in Japanese, because Intl says so", () => {
    // Asserted through the same function the catalog calls rather than by assuming the language has
    // no plural: the answer comes from `Intl.PluralRules`, and this records what it is.
    for (const count of [0, 1, 2, 11]) {
      expect(new Intl.PluralRules("ja").select(count)).toBe("other");
      expect(pluralize(count, { other: "件" }, "ja")).toBe("件");
    }
  });

  it("falls back to `other` when a language has no singular form declared", () => {
    expect(pluralize(1, { other: "件" }, "en")).toBe("件");
  });

  it("uses the active language when none is passed", () => {
    setLanguage("en");
    expect(pluralize(1, { one: "one", other: "many" })).toBe("one");
    setLanguage("ja");
    expect(pluralize(1, { one: "one", other: "many" })).toBe("many");
  });
});

describe("文言表 の対応", () => {
  /** Every leaf's path and what kind of entry it is, so two catalogs can be compared as one value. */
  function shape(value: unknown, path = ""): string[] {
    if (typeof value === "function") {
      return [`${path}: fn/${(value as (...args: unknown[]) => unknown).length}`];
    }
    if (typeof value === "object" && value !== null) {
      return Object.keys(value)
        .sort()
        .flatMap((key) => shape((value as Record<string, unknown>)[key], `${path}.${key}`));
    }
    return [`${path}: ${typeof value}`];
  }

  it("gives both languages the same keys, with the same parameter counts", () => {
    // `pnpm run check` is the first of decision-35 §4's two stages and already fails on a missing or
    // spare key — `Catalog` is `typeof ja`. This is here for the arity: a function that lost a
    // parameter still satisfies the type (TypeScript accepts a callback taking fewer arguments), and
    // that is the drift the type cannot see.
    expect(shape(CATALOGS.en)).toEqual(shape(CATALOGS.ja));
  });

  it("compares something, so the check cannot pass by finding nothing", () => {
    expect(shape(CATALOGS.ja).length).toBeGreaterThan(0);
    expect(shape(CATALOGS.ja).some((entry) => entry.endsWith(": string"))).toBe(true);
    expect(shape(CATALOGS.ja).some((entry) => entry.includes(": fn/"))).toBe(true);
  });

  it("sees an arity that drifted", () => {
    // The mutation the test above exists to catch, run against `shape` rather than trusted.
    expect(shape({ note: (_a: string) => "" })).not.toEqual(shape({ note: () => "" }));
  });

  it("has a 文言表 for every language it offers", () => {
    for (const language of LANGUAGES) {
      expect(CATALOGS[language]).toBeDefined();
      expect(isLanguage(language)).toBe(true);
    }
    expect(Object.keys(CATALOGS).sort()).toEqual([...LANGUAGES].sort());
  });

  it("keeps 言語未選択 worded as 表示テーマ's 未選択 is (decision-35)", async () => {
    // The pairing decision-35 requires, held rather than left to whoever edits one of the two.
    const { THEME_UNSET_LABEL } = await import("./theme");
    expect(CATALOGS.ja.settings.languageUnset).toBe(THEME_UNSET_LABEL);
  });
});
