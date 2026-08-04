import { describe, expect, it } from "vitest";
import { ICONS, drawnShape } from "./icons/lucide";
import {
  DEFAULT_PLACEMENT_MARK,
  DISCLOSURE_ICON,
  MODAL_MIN_MAIN_COLUMN_REM,
  MODAL_REQUIRED_VIEWPORT_PX,
  MODAL_SIDE_COLUMN_REM,
  PLACEMENTS,
  PLACEMENT_ICON,
  RECENT_COMMIT_LIMIT,
  SECTION_COLUMN,
  layoutFor,
  modalMainColumnRem,
  placementPersistence,
  placementPersistenceNote,
  placementSwitchName,
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
  assignee: { sidebar: "always", modal: "always", full: "always" },
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

  /*
   * TASK-71 の割当, restated from the task's Description rather than read back from `PLACEMENT_ICON` —
   * the assignment is a decision the user made about which figure means which placement, so a test
   * that derived it from the record would agree with any assignment the record happened to hold.
   */
  it("gives each placement the lucide figure the assignment names", () => {
    expect(PLACEMENT_ICON).toEqual({
      sidebar: "panel-right",
      modal: "panel-top-dashed",
      full: "maximize",
    });
  });

  it("has a figure written out for each of them, drawn by every element kind it uses", () => {
    for (const placement of PLACEMENTS) {
      const figure = ICONS[PLACEMENT_ICON[placement]];
      expect([placement, figure.length > 0]).toEqual([placement, true]);
      // `drawnShape` is the one mapping from kind to element (doc-11 §2.4), so running the figure
      // through it is what says the `rect` these two open with reaches an element rather than the
      // `{#each}`'s floor. A tag it left empty would be an icon that draws nothing.
      for (const shape of figure) {
        expect([placement, drawnShape(shape).tag]).toEqual([placement, shape.shape]);
      }
    }
  });

  it("draws a rect with all the geometry lucide gives it", () => {
    // `panel-right` opens with lucide's 18×18 rounded rect; dropping an attribute here would shrink
    // the panel outline to the SVG defaults (x/y 0, no corner radius) without failing to render.
    const rect = ICONS["panel-right"].find((shape) => shape.shape === "rect");
    expect(rect).toBeDefined();
    expect(drawnShape(rect!).attrs).toEqual({
      width: "18",
      height: "18",
      x: "3",
      y: "3",
      rx: "2",
    });
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
    // assignee joins them: doc-8 §3's own row marks it 常設（脇列） (TASK-72 moved it out of the 見出し).
    for (const section of [
      "assignee",
      "type",
      "labels",
      "dependencies",
      "references",
      "pullRequest",
    ] as const) {
      expect([section, SECTION_COLUMN[section]]).toEqual([section, "side"]);
    }
  });
});

describe("TASK-73 開閉印", () => {
  /*
   * 画面設計案 02 の原文, restated from doc-12 §3 rather than read back from `DISCLOSURE_ICON` — the
   * direction is what the 原文 decided (`▼` on the expanded 実装計画, `▶` on the folded 実装ノート), so a
   * test that derived it from the record would agree with either pairing.
   */
  it("faces the way the 区画 is, not the way pressing it would go", () => {
    expect(DISCLOSURE_ICON).toEqual({ open: "chevron-down", closed: "chevron-right" });
  });

  it("gives the two states two different figures, both written out in lucide", () => {
    expect(DISCLOSURE_ICON.open).not.toBe(DISCLOSURE_ICON.closed);
    for (const state of ["open", "closed"] as const) {
      const figure = ICONS[DISCLOSURE_ICON[state]];
      expect([state, figure.length > 0]).toEqual([state, true]);
      for (const shape of figure) {
        expect([state, drawnShape(shape).tag]).toEqual([state, shape.shape]);
      }
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

  it("leaves the note silent while the placement on screen is the stored 既定", () => {
    const persistence = placementPersistence("modal", "modal", null);
    expect(persistence).toEqual({ state: "default" });
    expect(placementPersistenceNote(persistence, label)).toBeNull();
    expect(DEFAULT_PLACEMENT_MARK).toBe("既定");
  });

  /*
   * TASK-71: the mark is a 下線 from here on (doc-8 §2.2, doc-12 §3), so the case above — the note is
   * silent because "the mark alone says everything" — is exactly the case where the eye is the only
   * sense the mark reaches. `placementSwitchName` is what puts it back, so these assert the two halves
   * together: the silent note, and a name that still carries 既定.
   */
  it("carries 既定 in the switch's own name, since the 下線 reaches nothing but the eye", () => {
    const stored = placementSwitchName(DETAIL_PLACEMENT_LABEL.modal, true);
    expect(stored).toContain(DETAIL_PLACEMENT_LABEL.modal);
    expect(stored).toContain(DEFAULT_PLACEMENT_MARK);
    // And this is the case the note is silent for, so the name is the only place it is said at all.
    expect(placementPersistenceNote(placementPersistence("modal", "modal", null), label)).toBeNull();
  });

  it("leaves the other two switches named by their placement alone", () => {
    for (const placement of PLACEMENTS) {
      const name = placementSwitchName(DETAIL_PLACEMENT_LABEL[placement], false);
      expect([placement, name]).toEqual([placement, DETAIL_PLACEMENT_LABEL[placement]]);
      expect([placement, name.includes(DEFAULT_PLACEMENT_MARK)]).toEqual([placement, false]);
    }
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
