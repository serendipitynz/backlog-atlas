import { describe, expect, it } from "vitest";
import { ICONS, drawnShape } from "./icons/lucide";
import {
  DEFAULT_PLACEMENT_MARK,
  DISCLOSURE_ICON,
  MAIN_COLUMN_ORDER,
  MODAL_MIN_MAIN_COLUMN_REM,
  MODAL_REQUIRED_VIEWPORT_PX,
  MODAL_SIDE_COLUMN_REM,
  PANEL_PADDING_REM,
  PLACEMENTS,
  PLACEMENT_ICON,
  PROSE_MAX_WIDTH_REM,
  PROSE_SECTIONS,
  RECENT_COMMIT_LIMIT,
  ROOT_FONT_PX,
  SECTION_COLUMN,
  SIDEBAR_WIDTH_REM,
  SIDE_COLUMN_ORDER,
  SINGLE_COLUMN_ORDER,
  isFold,
  layoutFor,
  modalContentWidthRem,
  modalMainColumnRem,
  placementPersistence,
  placementPersistenceNote,
  placementSwitchName,
  startsOpen,
  type DetailSection,
  type Disposition,
} from "./placement";
import { DETAIL_PLACEMENT_LABEL } from "./settings";
import type { DetailPlacement } from "./wire";

/**
 * doc-8 §3 の割当表, written out again from the document rather than from `placement.ts`. Restating it
 * is the point: `placement.ts` holds one table, so a table that quietly changed would still be
 * internally consistent — only a second copy taken from doc-8 catches it.
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
  plan: { sidebar: "foldClosed", modal: "foldOpen", full: "foldOpen" },
  notes: { sidebar: "foldClosed", modal: "foldClosed", full: "foldOpen" },
  dependencies: { sidebar: "always", modal: "always", full: "always" },
  references: { sidebar: "foldClosed", modal: "foldOpen", full: "foldOpen" },
  pullRequest: { sidebar: "always", modal: "always", full: "always" },
  gitHistory: { sidebar: "always", modal: "always", full: "always" },
  degrade: { sidebar: "always", modal: "always", full: "always" },
  transitions: { sidebar: "foldClosed", modal: "foldClosed", full: "foldOpen" },
};

/**
 * 画面設計案 02 の 3 図が開閉印を描く区画 (doc-12 §3), written out from the transcription rather than
 * derived from the table above. This is the fact TASK-114 turned on — the same 区画 are folds in all
 * three placements, and only their 既定開閉 moves — so it is asserted against the figures directly.
 */
const FOLDS_IN_EVERY_FIGURE: DetailSection[] = ["plan", "notes", "references", "transitions"];

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

  /*
   * TASK-114. Until then this test asserted the opposite — 全面シングルビュー entirely 常設 — which is
   * what doc-8 §2.1 said and what 画面設計案 02's 全面 figure contradicts (doc-12 §3: five 区画 carry a
   * 開閉印). 全面 still shows everything at once; it does it with 既定開 rather than by taking the
   * close away.
   */
  it("opens every 区画 of the 全面シングルビュー, without making them all 常設", () => {
    const { sections } = layoutFor("full");
    expect(Object.values(sections).every(startsOpen)).toBe(true);
    expect(Object.values(sections).some(isFold)).toBe(true);
  });

  it("folds the same 区画 in all three placements, varying only the 既定開閉 (doc-8 §3)", () => {
    for (const placement of PLACEMENTS) {
      const { sections } = layoutFor(placement);
      const folds = (Object.keys(sections) as DetailSection[]).filter((section) =>
        isFold(sections[section]),
      );
      expect([placement, folds.sort()]).toEqual([placement, [...FOLDS_IN_EVERY_FIGURE].sort()]);
    }
  });

  /*
   * The three figures' own directions (doc-12 §3), stated per placement rather than as a rule: 併置 is
   * where cards are compared so nothing starts open, 全面 is where everything is read so everything
   * does, and 中央モーダル sits between them. A rule guessed from that shape is what put 全面 wrong in
   * the first place.
   */
  it("starts each fold the way its figure draws it", () => {
    const open = (placement: DetailPlacement) =>
      FOLDS_IN_EVERY_FIGURE.filter((section) => startsOpen(layoutFor(placement).sections[section]));
    expect(open("sidebar")).toEqual([]);
    expect(open("modal")).toEqual(["plan", "references"]);
    expect(open("full")).toEqual([...FOLDS_IN_EVERY_FIGURE]);
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

  // Until TASK-113 the 縮退 spanned both columns, on the grounds that one column's reader would
  // otherwise miss it. doc-8 §3.1 answers that with a position instead: at the head of the 主列 it is
  // above both columns' contents, so neither can be read without passing it.
  it("leads the 主列 rather than spanning the columns (doc-8 §3.1)", () => {
    expect(SECTION_COLUMN.degrade).toBe("main");
    expect(MAIN_COLUMN_ORDER[0]).toBe("degrade");
  });
});

describe("AC #1・#2・#3 区画の並びは doc-8 §3.1 の正本", () => {
  // Written out from doc-8 §3.1 rather than from `placement.ts`, for the reason the assignment table
  // above is: a test that reads the module cannot disagree with it.
  const MAIN_FROM_DOC: DetailSection[] = [
    "degrade",
    "description",
    "ac",
    "plan",
    "notes",
    "gitHistory",
  ];
  const SIDE_FROM_DOC: DetailSection[] = [
    "type",
    "labels",
    "assignee",
    "dependencies",
    "pullRequest",
    "references",
    "transitions",
  ];

  it("draws each column in the order doc-8 §3.1 transcribes", () => {
    expect([...MAIN_COLUMN_ORDER]).toEqual(MAIN_FROM_DOC);
    expect([...SIDE_COLUMN_ORDER]).toEqual(SIDE_FROM_DOC);
  });

  // 画面設計案 02's 併置 figure is the two columns run together (doc-8 §3.1), so 併置 must not carry an
  // order of its own — a third list is a second 正本, and the day one moves the other stays.
  it("runs the two columns together for the 併置サイドバー, with no third order", () => {
    expect([...SINGLE_COLUMN_ORDER]).toEqual([...MAIN_FROM_DOC, ...SIDE_FROM_DOC]);
  });

  it("orders every 区画 that is in a column, and none that is not", () => {
    const ordered = [...SINGLE_COLUMN_ORDER];
    expect(new Set(ordered).size).toBe(ordered.length);
    for (const [section, column] of Object.entries(SECTION_COLUMN) as [
      DetailSection,
      (typeof SECTION_COLUMN)[DetailSection],
    ][]) {
      expect([section, ordered.includes(section)]).toEqual([section, column !== "wide"]);
    }
  });

  it("puts each ordered 区画 in the column its own order belongs to", () => {
    for (const section of MAIN_COLUMN_ORDER) {
      expect([section, SECTION_COLUMN[section]]).toEqual([section, "main"]);
    }
    for (const section of SIDE_COLUMN_ORDER) {
      expect([section, SECTION_COLUMN[section]]).toEqual([section, "side"]);
    }
  });
});

describe("AC #4 全面シングルビューの列構成", () => {
  // 画面設計案 02's 全面 figure is two columns (doc-12 §3), and doc-8 §2.1 now says so: what a wide
  // window gives the 全面 is a wide 主列, not a wide 脇列.
  it("gives 全面 the same two columns as the 中央モーダル", () => {
    expect(layoutFor("full").columns).toBe(2);
    expect(layoutFor("modal").columns).toBe(2);
  });

  it("leaves 併置サイドバー the only placement without columns", () => {
    const single = PLACEMENTS.filter((placement) => layoutFor(placement).columns === 1);
    expect(single).toEqual(["sidebar"]);
  });
});

describe("AC #5 1 行の長さの上限", () => {
  // doc-8 §2.1 derives the ceiling from the 主列 the 中央モーダル already has, rather than inventing a
  // number. If the modal's geometry ever moves away from it, the derivation stopped holding — which
  // is the thing to be told about, since the whole justification for 48rem is that it is not new.
  // Since TASK-115 that 主列 is one number (49.25rem) rather than two, so the derivation can be
  // stated as an inequality: the cap is a whole rem that the 中央モーダル's own 主列 already holds. It
  // therefore asks for no width the design had not already committed to, and binds that 主列 by the
  // remainder (1.25rem, the 20px TASK-113 measured) rather than hanging above it unused.
  it("is a whole rem the 主列 the 中央モーダル already has can hold", () => {
    const modalMain = modalMainColumnRem(MODAL_REQUIRED_VIEWPORT_PX);
    expect(Number.isInteger(PROSE_MAX_WIDTH_REM)).toBe(true);
    expect(PROSE_MAX_WIDTH_REM).toBeLessThanOrEqual(modalMain);
    // Within a rem or two of it, or it stopped being that column's width and became a new number.
    expect(modalMain - PROSE_MAX_WIDTH_REM).toBeLessThan(2);
  });

  it("never binds the 併置サイドバー, whose whole panel is narrower", () => {
    expect(SIDEBAR_WIDTH_REM).toBeLessThan(PROSE_MAX_WIDTH_REM);
  });

  // Git 履歴欄 is the one long block left uncapped: doc-8 §2.1 makes 全面 the place the whole commit
  // list is read, so narrowing it would cost that placement its reason to exist.
  it("caps the four 本文 区画 and leaves the Git 履歴欄 alone", () => {
    expect([...PROSE_SECTIONS]).toEqual(["description", "ac", "plan", "notes"]);
    expect(PROSE_SECTIONS).not.toContain("gitHistory");
    for (const section of PROSE_SECTIONS) {
      expect([section, SECTION_COLUMN[section]]).toEqual([section, "main"]);
    }
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

describe("TASK-115 AC #1 関数の主列と実レイアウトの主列が一致する", () => {
  /**
   * `jsdom` runs no layout, so the measurement cannot be taken here — what is held is the recording,
   * the same way the wire fixtures hold the Rust side's output. Taken from
   * `_sandbox/detail-check/?placement=modal&long=1` at each viewport width, WebKit and Chromium
   * agreeing to the pixel (2026-08-05). 1152 is the width below which the 68rem cap stops binding and
   * [`MODAL_INSET_REM`] starts to; 1000 is under it.
   */
  const DRAWN_MAIN_COLUMN_PX: ReadonlyArray<readonly [number, number]> = [
    [1280, 788],
    [1152, 788],
    [1000, 636],
  ];

  // The function was 1.5rem short of every one of these until TASK-115, because it subtracted the
  // panel's padding — which a content-box `width` puts outside the box the columns divide.
  it("computes the 主列 both engines draw, at every width measured", () => {
    for (const [viewportPx, drawnPx] of DRAWN_MAIN_COLUMN_PX) {
      expect([viewportPx, modalMainColumnRem(viewportPx, ROOT_FONT_PX) * ROOT_FONT_PX]).toEqual([
        viewportPx,
        drawnPx,
      ]);
    }
  });

  // The other half of the same fact: what the geometry names is the content box, so the modal's
  // footprint is wider than every number in this module. The remainder is the 1px border a side —
  // which is why the border is not a constant here: a px border does not follow `rootFontPx`.
  it("names the content box, leaving the padding and the border outside it", () => {
    const contentPx = modalContentWidthRem(1280, ROOT_FONT_PX) * ROOT_FONT_PX;
    const DRAWN_CONTENT_PX = 1088;
    const DRAWN_FOOTPRINT_PX = 1114;
    expect(contentPx).toBe(DRAWN_CONTENT_PX);
    expect(DRAWN_FOOTPRINT_PX - contentPx - PANEL_PADDING_REM * ROOT_FONT_PX).toBe(2);
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
