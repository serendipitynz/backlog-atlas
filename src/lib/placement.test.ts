import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLACEMENT_MARK,
  MODAL_MIN_MAIN_COLUMN_REM,
  MODAL_REQUIRED_VIEWPORT_PX,
  MODAL_SIDE_COLUMN_REM,
  PLACEMENTS,
  RECENT_COMMIT_LIMIT,
  SECTION_COLUMN,
  layoutFor,
  modalMainColumnRem,
  placementPersistence,
  placementPersistenceNote,
  type DetailSection,
  type Disposition,
} from "./placement";
import { DETAIL_PLACEMENT_LABEL } from "./settings";
import type { DetailPlacement } from "./wire";

/**
 * doc-8 §3 の割当表, written out again from the document rather than from `placement.ts`. Restating it
 * is the point: the code builds `full` from a rule (全区画を常設) and reads the other two from one
 * table, so a table that quietly changed would still be internally consistent — only a second copy
 * taken from doc-8 catches it.
 */
const DOC_8_SECTION_3: Record<
  DetailSection,
  { sidebar: Disposition; modal: Disposition; full: Disposition }
> = {
  heading: { sidebar: "always", modal: "always", full: "always" },
  editConsole: { sidebar: "always", modal: "always", full: "always" },
  type: { sidebar: "always", modal: "always", full: "always" },
  labels: { sidebar: "always", modal: "always", full: "always" },
  description: { sidebar: "always", modal: "always", full: "always" },
  ac: { sidebar: "always", modal: "always", full: "always" },
  plan: { sidebar: "collapsed", modal: "always", full: "always" },
  notes: { sidebar: "collapsed", modal: "collapsed", full: "always" },
  dependencies: { sidebar: "always", modal: "always", full: "always" },
  references: { sidebar: "collapsed", modal: "always", full: "always" },
  pullRequest: { sidebar: "always", modal: "always", full: "always" },
  gitHistory: { sidebar: "always", modal: "always", full: "always" },
  degrade: { sidebar: "always", modal: "always", full: "always" },
  transitions: { sidebar: "collapsed", modal: "collapsed", full: "always" },
};

describe("AC #1 3 配置", () => {
  it("offers exactly the three placements doc-8 §2.1 defines, narrowest first", () => {
    expect([...PLACEMENTS]).toEqual(["sidebar", "modal", "full"]);
  });

  it("names each of them on the switch", () => {
    for (const placement of PLACEMENTS) {
      expect(DETAIL_PLACEMENT_LABEL[placement]).toBeTruthy();
    }
  });
});

describe("AC #2 配置ごとの割当（doc-8 §3）", () => {
  for (const placement of PLACEMENTS) {
    it(`gives ${placement} every 区画 the disposition the table assigns`, () => {
      const { sections } = layoutFor(placement);
      for (const [section, row] of Object.entries(DOC_8_SECTION_3)) {
        expect([section, sections[section as DetailSection]]).toEqual([section, row[placement]]);
      }
    });
  }

  it("keeps 全面シングルビュー entirely 常設 — nothing is folded away there", () => {
    const { sections } = layoutFor("full");
    expect(Object.values(sections).every((disposition) => disposition === "always")).toBe(true);
  });

  it("varies the Git 履歴欄's granularity by placement (doc-8 §5)", () => {
    expect(layoutFor("sidebar").history).toBe("count");
    expect(layoutFor("modal").history).toBe("recent");
    expect(layoutFor("full").history).toBe("full");
    // 直近 2 件 is the number doc-8 §5 names for the 中央モーダル.
    expect(RECENT_COMMIT_LIMIT).toBe(2);
  });

  it("puts doc-8 §2.1's named 区画 in the columns it names them for", () => {
    // 主列 = Description・AC・実装計画, 脇列 = Type・ラベル・依存・References・PR (doc-8 §2.1).
    for (const section of ["description", "ac", "plan"] as const) {
      expect([section, SECTION_COLUMN[section]]).toEqual([section, "main"]);
    }
    for (const section of ["type", "labels", "dependencies", "references", "pullRequest"] as const) {
      expect([section, SECTION_COLUMN[section]]).toEqual([section, "side"]);
    }
  });
});

describe("AC #6 縮退表示は 3 配置とも常設", () => {
  it("never folds the 縮退 区画, whichever placement is in force", () => {
    for (const placement of PLACEMENTS) {
      expect([placement, layoutFor(placement).sections.degrade]).toEqual([placement, "always"]);
    }
  });

  it("keeps it out of both columns, so it cannot be missed by reading one of them", () => {
    expect(SECTION_COLUMN.degrade).toBe("wide");
  });
});

describe("AC #7 中央モーダルは 1280×800 でも 2 列", () => {
  it("keeps two columns at the size doc-8 §2.1 names", () => {
    expect(layoutFor("modal").columns).toBe(2);
    expect(MODAL_REQUIRED_VIEWPORT_PX).toBe(1280);
  });

  it("still leaves the 主列 a usable width once the 18rem 脇列 is taken", () => {
    expect(MODAL_SIDE_COLUMN_REM).toBe(18);
    expect(modalMainColumnRem(MODAL_REQUIRED_VIEWPORT_PX)).toBeGreaterThanOrEqual(
      MODAL_MIN_MAIN_COLUMN_REM,
    );
  });

  it("does not stack the columns on a narrower window either — only the 主列 gives way", () => {
    // doc-8 §2.1: 狭いからといって縦積みへ落とさない. The layout has no width in it at all, which is
    // what makes that true; the 主列 simply gets less.
    expect(layoutFor("modal").columns).toBe(2);
    expect(modalMainColumnRem(1024)).toBeLessThan(modalMainColumnRem(1280));
  });
});

describe("AC #3 既定の永続と、既定がどれかの表示", () => {
  const label = (placement: DetailPlacement) => DETAIL_PLACEMENT_LABEL[placement];

  it("says nothing beyond the mark while the placement on screen is the stored 既定", () => {
    const persistence = placementPersistence("modal", "modal", null);
    expect(persistence).toEqual({ state: "default" });
    expect(placementPersistenceNote(persistence, label)).toBeNull();
    expect(DEFAULT_PLACEMENT_MARK).toBe("既定");
  });

  it("names the placement the next start will use when the two differ", () => {
    const persistence = placementPersistence("full", "sidebar", null);
    expect(persistence).toEqual({ state: "notDefault", stored: "sidebar" });
    expect(placementPersistenceNote(persistence, label)).toContain("併置サイドバー");
  });

  it("keeps a refused write apart from a mere difference, with its reason", () => {
    const persistence = placementPersistence("full", "sidebar", "schema_version 9 is newer");
    expect(persistence).toEqual({ state: "refused", reason: "schema_version 9 is newer" });
    // The placement took effect even though it could not be stored — the note has to say both.
    const note = placementPersistenceNote(persistence, label) ?? "";
    expect(note).toContain("schema_version 9 is newer");
    expect(note).toContain("今の表示には効いています");
  });
});
