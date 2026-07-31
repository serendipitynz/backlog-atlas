import { describe, expect, it } from "vitest";
import {
  BAND_ORDER,
  LEDGER_READ_ONLY_BAND,
  cliDegradedBand,
  hiddenRowsBand,
  topBands,
  unwatchedBand,
  type BandInputs,
  type BandKind,
} from "./band";
import { DISCARD_CONFIRM_QUESTION } from "./edit";
import type { CliReadiness } from "./wire";

/** Nothing standing: every band below is raised by naming one input. */
const QUIET: BandInputs = {
  confirming: false,
  readiness: { state: "ready", version: "1.47.1" },
  ledgerReadOnly: false,
  unwatchedReason: null,
  notice: null,
  hiddenRowCount: 0,
};

/** Every band standing at once — doc-11 §4's worst case, and the cap it puts on the stack. */
const ALL: BandInputs = {
  confirming: true,
  readiness: { state: "unavailable", detail: "not on PATH" },
  ledgerReadOnly: true,
  unwatchedReason: "変更監視が動いていない行があります",
  notice: "行の並べ替えに失敗しました",
  hiddenRowCount: 2,
};

function kinds(inputs: BandInputs): BandKind[] {
  return topBands(inputs).map((band) => band.kind);
}

describe("上部帯の順と本数", () => {
  it("stacks the 6 種 in doc-11 §4's fixed order (AC #4)", () => {
    expect(kinds(ALL)).toEqual([
      "confirm",
      "cliDegraded",
      "ledgerReadOnly",
      "unwatched",
      "notice",
      "hiddenRows",
    ]);
  });

  it("keeps the order when the bands are raised in another order (AC #4)", () => {
    // 出現順にしない: the 通知 was set long before the 確認 was asked for, and the 確認 still goes on
    // top — this is the case doc-11 §4 exists for, since ⑤ under ① is what buries a 回答待ち.
    const noticeFirst: BandInputs = { ...QUIET, notice: "設定を保存しました" };
    expect(kinds(noticeFirst)).toEqual(["notice"]);
    expect(kinds({ ...noticeFirst, confirming: true })).toEqual(["confirm", "notice"]);
  });

  it("holds the stack to 6 and lets no kind stand twice (AC #3)", () => {
    const raised = kinds(ALL);
    expect(raised).toHaveLength(6);
    expect(new Set(raised).size).toBe(6);
    expect(BAND_ORDER).toHaveLength(6);
    expect(new Set(BAND_ORDER)).toEqual(new Set(raised));
  });

  it("raises nothing while every state is normal", () => {
    expect(topBands(QUIET)).toEqual([]);
  });
});

describe("閉じられる帯", () => {
  it("gives the × to 通知 alone (AC #1, AC #5)", () => {
    // ①〜④ describe a state that is still true after a click — a 回答待ち, an 発行できない state, a
    // display that may be behind the files — so dismissing them would only hide the thing that says
    // so. ⑥ ends by 戻す, not by dismissal.
    const closable = topBands(ALL).filter((band) => band.closable);
    expect(closable.map((band) => band.kind)).toEqual(["notice"]);
  });
});

describe("CLI 縮退帯 (②)", () => {
  it("stands down while a supported backlog is present", () => {
    expect(cliDegradedBand({ state: "ready", version: "1.47.1" })).toBeNull();
    expect(kinds({ ...QUIET, readiness: { state: "ready", version: "1.47.1" } })).toEqual([]);
  });

  it("distinguishes 確認中 from 検出できない, since the two lead to different actions", () => {
    expect(cliDegradedBand(null)).toContain("確認中");
    expect(cliDegradedBand({ state: "unavailable", detail: "not on PATH" })).toContain(
      "見つかりません",
    );
  });

  it("names the version range when the CLI is out of it", () => {
    const unsupported: CliReadiness = { state: "unsupported", version: "1.0.0", minimum: "1.47.0" };
    expect(cliDegradedBand(unsupported)).toContain("1.0.0");
    expect(cliDegradedBand(unsupported)).toContain("1.47.0");
  });

  it("stays independent of 台帳読取専用, each naming what the other's failure leaves working", () => {
    // doc-10 §3: one is about where Atlas writes, the other about whether the Backlog CLI runs, and
    // one can stand without the other (AC #3 独立した帯). Side by side they must not read as one
    // failure, which is why each says what it does *not* reach.
    expect(cliDegradedBand(null)).toContain("台帳エントリの更新は影響を受けません");
    expect(LEDGER_READ_ONLY_BAND).toContain("文書・マイルストーン・新規タスク");
    expect(kinds({ ...QUIET, ledgerReadOnly: true })).toEqual(["ledgerReadOnly"]);
    expect(kinds({ ...QUIET, readiness: null })).toEqual(["cliDegraded"]);
  });
});

describe("帯の 1 行 (doc-11 §4 の縮約)", () => {
  it("keeps every band's text to one line's worth and free of line breaks", () => {
    // 折り返しを許すと「フィルタ帯 1 行 ＋ 上部帯 6 本」で頭打ちという性質が崩れる (doc-11 §4). The
    // bound is a 縮約 check, not a layout measurement: the full reason lives at the operation itself.
    for (const band of topBands(ALL)) {
      expect(band.text).not.toContain("\n");
      expect(band.text.length).toBeLessThanOrEqual(70);
    }
  });

  it("counts the hidden rows rather than listing them", () => {
    expect(hiddenRowsBand(3)).toBe("非表示の行 3 件");
  });

  it("states what 継続検出停止 costs, and sends the user nowhere to resolve it", () => {
    // The 再読込 is a control in the band itself (doc-11 §4: 帯が持つ操作は縮約しても帯に残す), so the
    // text carries the consequence rather than directions to a row's mark that may be off screen.
    const text = unwatchedBand("変更監視が動いていない行があります");
    expect(text).toContain("古い可能性");
    expect(text).not.toContain("印");
  });

  it("asks the 破棄前確認 in the same words the other four routes use", () => {
    expect(topBands({ ...QUIET, confirming: true })[0]?.text).toBe(DISCARD_CONFIRM_QUESTION);
  });
});
