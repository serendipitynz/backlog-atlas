/**
 * 画面横断契約 5 件目 (decision-23): **priority を述べる 4 つの表示要素が、同じタスクについて同じ 段 を
 * 言う。**
 *
 * `priorityStep` そのものは `lib/card.test.ts` が押さえている。ここが押さえるのは、**その答えが
 * 4 か所へ実際に届いていること** — 優先度の縁 (`TaskCard`)・priority チップ (同)・畳んだ列の四角
 * (`LaneCell`)・タスク詳細の priority の値 (`TaskDetail`)。純関数はどれにも属さず、3 つの
 * コンポーネントに散っているので、1 つが `data-priority` を落としても・別の段へ写しても、
 * `lib/*.test.ts` は緑のまま通る (PR #70 の [P2])。
 *
 * 契約は 2 つの向きで書く — 3 段は 4 か所とも同じ色を引き、priority 未設定 と priority 未知 は
 * 4 か所とも色を持たない。**色そのものは検査しない** (jsdom は表示テーマを解決しないし、値の側は
 * `lib/theme.test.ts` が `app.scss` から検算している)。ここで見るのは、色を選ぶ属性が正しい 段 を
 * 運んでいるかだけである。
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync } from "svelte";

// The same one-line boundary the other component test uses (`fake-boundary` is `vi.mock` only).
import { vi } from "vitest";
vi.mock("./lib/commands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/commands")>();
  const { commandFakes } = await import("./lib/fake-boundary");
  return { ...actual, ...commandFakes };
});

import App from "./App.svelte";
import { cleanup, click, only, render } from "./lib/render";
import { answers, ledgerFor, reset } from "./lib/fake-boundary";
import { entry, loaded, taskView } from "./lib/fixtures";
import { priorityStepLabel } from "./lib/card";
import type { ProjectLoad } from "./lib/wire";

async function settled(): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    await Promise.resolve();
    flushSync();
  }
}

async function startWith(loads: ProjectLoad[]): Promise<HTMLElement> {
  answers.loads = loads;
  answers.ledger = ledgerFor(
    ...loads.map((load) => entry(load.state === "loaded" ? load.project.slug : load.slug)),
  );
  const { host } = render(App, {});
  await settled();
  return host;
}

/**
 * One task per case, all in the same column so a single fold puts every square in one band.
 * `urgent` is priority 未知 — a value the file really carries that is not one of the 3 段 — and it is
 * held apart from priority 未設定 on purpose: they are two states that happen to be drawn alike.
 */
const CASES = [
  { id: "TASK-1", priority: "high", step: "high" },
  { id: "TASK-2", priority: "medium", step: "medium" },
  { id: "TASK-3", priority: "low", step: "low" },
  { id: "TASK-4", priority: "urgent", step: null },
  { id: "TASK-5", priority: null, step: null },
] as const;

const TASKS = CASES.map((one, index) =>
  taskView({
    id: one.id,
    title: `${one.id} の題`,
    status: "In Progress",
    column: "inProgress",
    ordinal: (index + 1) * 1000,
    priority: one.priority,
  }),
);

/** The card for one task id, by the 横断タスクID its `.identity` carries. */
function cardOf(host: HTMLElement, id: string): HTMLElement {
  const cards = [...host.querySelectorAll<HTMLElement>("button.card")];
  const card = cards.find((one) => one.querySelector(".identity")?.textContent?.includes(id));
  if (card === undefined) {
    throw new Error(`${id} のカードがありません`);
  }
  return card;
}

beforeEach(reset);
afterEach(cleanup);

describe("priority を述べる 4 つの表示要素が同じ段を言う (decision-23)", () => {
  it("優先度の縁 と priority チップ が 1 枚のカードの上で一致する", async () => {
    const host = await startWith([loaded("atlas", TASKS)]);

    for (const one of CASES) {
      const card = cardOf(host, one.id);
      // 未設定・未知 は属性そのものを書かない — 空文字や "null" ではない。CSS の `[data-…="low"]` が
      // 当たらないことと、`:not([data-priority])` が当たることの両方がこれに依存している。
      expect(card.getAttribute("data-priority-edge")).toBe(one.step);
      const chip = card.querySelector(".priority");
      if (one.priority === null) {
        // priority 未設定 はチップ自体が無い (出す語が無い)。
        expect(chip).toBeNull();
      } else {
        expect(chip?.getAttribute("data-priority")).toBe(one.step);
        // 未知の値は色を持たないだけで、語は原文のまま出る。
        expect(chip?.textContent?.trim()).toBe(one.priority);
      }
    }
  });

  it("畳んだ列の四角が同じ段を言い、件数のアクセシブル名が内訳を語で持つ", async () => {
    const host = await startWith([loaded("atlas", TASKS)]);

    // 列折畳みの控えは読み上げ用の名前で引く (doc-7 §2.2 の `name`: 画面の語ではなく「In Progress 列」)。
    const fold = only<HTMLButtonElement>(host, '[aria-label="In Progress 列の列折畳みを行う"]');
    click(fold);
    flushSync();

    // 四角は 段 ごとにまとまり、most-urgent-first で並ぶ (色を見分けられなくても分布が読める形)。
    const pips = [...host.querySelectorAll<HTMLElement>(".pip")];
    expect(pips.map((pip) => pip.getAttribute("data-priority"))).toEqual([
      "high",
      "medium",
      "low",
      null,
      null,
    ]);

    // 四角は `aria-hidden` なので、内訳を運ぶのは件数のアクセシブル名のほうである。
    const count = only<HTMLElement>(host, ".cell.collapsed .count");
    const label = count.getAttribute("aria-label") ?? "";
    expect(label).toContain("5 件");
    for (const [step, count] of [
      ["high", 1],
      ["medium", 1],
      ["low", 1],
    ] as const) {
      expect(label).toContain(`${priorityStepLabel(step)} ${count}`);
    }
    // 未設定 と 未知 は同じ 1 つの群として数える (どちらも 段 の不在である)。
    expect(label).toContain(`${priorityStepLabel(null)} 2`);
  });

  it("タスク詳細の priority の値が、そのカードと同じ段を言う", async () => {
    const host = await startWith([loaded("atlas", TASKS)]);

    for (const one of CASES) {
      click(cardOf(host, one.id));
      await settled();

      const term = [...host.querySelectorAll("dt")].find(
        (dt) => dt.textContent?.trim() === "priority",
      );
      const value = term?.nextElementSibling;
      if (value === null || value === undefined) {
        throw new Error("priority の値がありません");
      }
      expect(value.getAttribute("data-priority")).toBe(one.step);
      // 値そのものは frontmatter のまま。未設定は `—` (doc-11 §6 の中立表示)。
      expect(value.textContent?.trim()).toBe(one.priority ?? "—");
    }
  });
});
