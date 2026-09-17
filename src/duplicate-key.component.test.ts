/**
 * 画面横断契約: **`{#each}` の鍵に、重複しうる値を据えない。**
 *
 * Svelte は重複した鍵に対して `each_key_duplicate` を投げ、それは製品ビルドでも投げる — 落ちるのは
 * その行ではなく、その `{#each}` を含む区画・画面の全体である。だから鍵が一意かどうかは、描かれる
 * 中身ではなく**画面が在ること**の条件になっている。
 *
 * 純関数の側では言えない契約である。重複しうる値は 4 通りの入口から来るが (下の 4 つの `describe`)、
 * どれも読み取り層は拒まず、`wire.ts` の型も拒まない — 拒む場所は鍵式ひとつしかなく、それは markup に
 * しか無い。`lib/*.test.ts` はどれも緑のまま通る。
 *
 * **画面ごとの網羅ではない。** ここに並ぶのは、2026-09-17 に全 `{#each}` 84 件を数え上げて見つかった
 * 「一意性を読み取り層が保証していない鍵」12 か所であり、区画の数ではなく**入口の数**で構成されている。
 * 新しい `{#each}` が増えたときにここへ行を足す基準も同じで、鍵式の値を作る層が重複を拒むかだけを見る。
 *
 * **中身は主張しない。** どの `it` も数と、押せる状態にあることだけを見る。重複した 2 件のうちどちらが
 * 選ばれるか (先頭一致) はこの契約の外で、TASK-205 が扱う。
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync } from "svelte";

// The same one-line boundary the other component tests use (`fake-boundary` is `vi.mock` only).
import { vi } from "vitest";
vi.mock("./lib/commands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/commands")>();
  const { commandFakes } = await import("./lib/fake-boundary");
  return { ...actual, ...commandFakes };
});

import App from "./App.svelte";
import { byText, cleanup, click, only, render } from "./lib/render";
import { answers, ledgerFor, reset } from "./lib/fake-boundary";
import {
  CONFIG,
  decisionView,
  documentView,
  entry,
  history,
  milestoneView,
  snapshot,
  taskView,
} from "./lib/fixtures";
import type { ProjectLoad, ProjectSnapshot } from "./lib/wire";

async function settled(): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    await Promise.resolve();
    flushSync();
  }
}

/**
 * One loaded project, with the facet this file is about written over the fixture's snapshot.
 *
 * Spread rather than a new parameter on `snapshot()`: the fields these cases vary — `decisions` and
 * `config` — are two of the five that fixture pins, and giving each a positional default would put
 * seven of them in a row for the sake of one test file.
 */
function projectWith(overrides: Partial<ProjectSnapshot>): ProjectLoad {
  return { state: "loaded", project: { ...snapshot("atlas", [TASK]), ...overrides } };
}

const TASK = taskView({
  id: "TASK-1",
  title: "最初の題",
  status: "In Progress",
  column: "inProgress",
  ordinal: 1000,
});

async function startWith(load: ProjectLoad): Promise<HTMLElement> {
  answers.loads = [load];
  answers.ledger = ledgerFor(entry("atlas"));
  const { host } = render(App, {});
  await settled();
  return host;
}

/** 区画ナビ の 1 項目 (doc-10 §1). Prefix-matched: a 一覧列 区画's label carries its count. */
function sectionTab(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>("nav.sections button")].filter(
    (button) => (button.textContent ?? "").trim().startsWith(label),
  );
  if (found.length !== 1) {
    throw new Error(`expected exactly one 区画ナビ item starting "${label}", found ${found.length}`);
  }
  return found[0];
}

/** Open プロジェクト詳細 and move to one 区画 (doc-10 §1). */
async function openSection(load: ProjectLoad, label: string): Promise<HTMLElement> {
  const host = await startWith(load);
  click(only(host, '[aria-label="atlas のプロジェクト詳細画面を開く"]'));
  await settled();
  click(sectionTab(host, label));
  await settled();
  return host;
}

/** Open タスク詳細 from the swimlane card, which is the only route to the panel. */
async function openTask(load: ProjectLoad): Promise<HTMLElement> {
  const host = await startWith(load);
  click(byText(host, "button.card .title", "最初の題").closest("button.card")!);
  await settled();
  return host;
}

/** The values one `<select>` offers, in order — including the repeats this file is about. */
function optionValues(select: HTMLSelectElement): string[] {
  return [...select.options].map((option) => option.value);
}

beforeEach(() => {
  reset();
  answers.history.set("atlas:TASK-1", history());
});
afterEach(cleanup);

// -------------------------------------------------------------------------------------------------

/**
 * 入口 1 — **同じ id を持つ管理ファイルが 1 つのルートに 2 件ある** (doc-4 §7).
 *
 * 読み取り層は 2 件とも持つと決めており、読み取り順のまま残す。CLI はこの状態を作らないので、入口は
 * ファイルを手で複製したときだけである。所在パスは 2 件で違うので、そちらが鍵になる。
 */
describe("同じ id の管理ファイル 2 件", () => {
  const DOC_A = documentView({ id: "doc-5", sourcePath: "/repos/atlas/backlog/docs/doc-5.md" });
  const DOC_B = documentView({ id: "doc-5", sourcePath: "/repos/atlas/backlog/docs/doc-5-copy.md" });
  const MILESTONE_A = milestoneView({
    id: "m-1",
    sourcePath: "/repos/atlas/backlog/milestones/m-1.md",
  });
  const MILESTONE_B = milestoneView({
    id: "m-1",
    sourcePath: "/repos/atlas/backlog/milestones/m-1-copy.md",
  });
  const DECISION_A = decisionView({
    id: "decision-1",
    sourcePath: "/repos/atlas/backlog/decisions/decision-1.md",
  });
  const DECISION_B = decisionView({
    id: "decision-1",
    sourcePath: "/repos/atlas/backlog/decisions/decision-1-copy.md",
  });

  it("文書区画の一覧列が 2 件とも描く", async () => {
    const host = await openSection(projectWith({ documents: [DOC_A, DOC_B] }), "文書");

    expect(host.querySelectorAll("ul.cards button.card")).toHaveLength(2);
  });

  it("マイルストーン区画の一覧列が 2 件とも描く", async () => {
    const host = await openSection(
      projectWith({ milestones: [MILESTONE_A, MILESTONE_B] }),
      "マイルストーン",
    );

    expect(host.querySelectorAll("ul.cards button.card")).toHaveLength(2);
  });

  it("決定事項区画の一覧列が 2 件とも描く", async () => {
    const host = await openSection(
      projectWith({ decisions: [DECISION_A, DECISION_B] }),
      "決定事項",
    );

    expect(host.querySelectorAll("ul.cards button.card")).toHaveLength(2);
  });

  it("新規タスク区画のマイルストーン選択が 2 件とも出す", async () => {
    const host = await openSection(
      projectWith({ milestones: [MILESTONE_A, MILESTONE_B] }),
      "新規タスク",
    );

    // 未設定 を先頭に、重複した 2 件がそのまま並ぶ。どちらを選んでも送る値は同じ id なので、
    // 送信側は何も変わらない — 変わるのは選択肢を描けるかだけである。
    const select = [...host.querySelectorAll<HTMLSelectElement>("select")].find((candidate) =>
      optionValues(candidate).includes("m-1"),
    );
    expect(select).toBeDefined();
    expect(optionValues(select!).filter((value) => value === "m-1")).toHaveLength(2);
  });

  it("タスク詳細のマイルストーン選択が 2 件とも出す", async () => {
    const host = await openTask(projectWith({ milestones: [MILESTONE_A, MILESTONE_B] }));
    click(byText(host, "button.primary", "編集"));
    await settled();

    const select = [...host.querySelectorAll<HTMLSelectElement>("select")].find((candidate) =>
      optionValues(candidate).includes("m-1"),
    );
    expect(select).toBeDefined();
    expect(optionValues(select!).filter((value) => value === "m-1")).toHaveLength(2);
  });

  it("マイルストーンの付け替え先が 2 件とも出す", async () => {
    // 3 件で、選んだ 1 件の id を除いた残りが重複する形。除外は id で行われるので、同じ id の
    // 2 件を選ぶと候補が空になり、この `{#each}` は 1 度も回らない。
    const host = await openSection(
      projectWith({
        milestones: [
          milestoneView({ id: "m-9", sourcePath: "/repos/atlas/backlog/milestones/m-9.md" }),
          MILESTONE_A,
          MILESTONE_B,
        ],
      }),
      "マイルストーン",
    );
    click(byText(host, "ul.cards button.card .id", "m-9").closest("button.card")!);
    await settled();
    click(byText(host, "button", "編集"));
    await settled();
    click(byText(host, "button", "削除"));
    await settled();
    click(byText(host, "span", "別マイルストーンへ付け替える（reassign）").closest("label")!
      .querySelector("input")!);
    await settled();

    const select = only<HTMLSelectElement>(host, ".sub-panel select");
    expect(optionValues(select).filter((value) => value === "m-1")).toHaveLength(2);
  });
});

/**
 * 入口 2 — **`#N` が 2 行ある受入条件** (doc-4 §4).
 *
 * `parse_ac_item` は行に書かれた番号をそのまま持つので、`- [ ] #1` が 2 行あれば 1 が 2 つ届く。CLI の
 * `--ac` は max+1 を振るので、入口は手編集と外部エディタ経路 (doc-8 §7) である。位置が鍵になる。
 */
describe("同じ #N の受入条件 2 行", () => {
  const DUPLICATE_AC = projectWith({
    tasks: [
      taskView({
        id: "TASK-1",
        title: "最初の題",
        status: "In Progress",
        column: "inProgress",
        ordinal: 1000,
        acceptanceCriteria: [
          { number: 1, text: "先に書かれたほう", checked: false },
          { number: 1, text: "後に書かれたほう", checked: true },
        ],
      }),
    ],
  });

  it("閲覧が 2 行とも描く", async () => {
    const host = await openTask(DUPLICATE_AC);

    expect(host.querySelectorAll("ul.ac li")).toHaveLength(2);
  });

  it("編集セッションの 項目単位操作 も 2 行とも描く", async () => {
    const host = await openTask(DUPLICATE_AC);
    click(byText(host, "button.primary", "編集"));
    await settled();

    // 項目単位操作 is the mode a session opens in (`draftFrom`), so the rows are up without a switch.
    expect(host.querySelectorAll("ul.ac li")).toHaveLength(2);
  });
});

/**
 * 入口 3 — **`config.yml` の `statuses` に同じ名が 2 度書かれている**.
 *
 * `string_list_field` は並びをそのまま返し、重複を落とさない。`config.yml` は利用者が手で書くファイル
 * であり、Atlas はそれを書かない — だから重複を拒む層がどこにも無い。並びは入力の並びそのものなので、
 * 位置が鍵になる。
 */
describe("config.yml の statuses 重複", () => {
  const DUPLICATED = projectWith({
    config: { ...CONFIG, statuses: ["To Do", "In Progress", "In Progress", "Done"] },
  });

  it("タスク詳細の status 選択が重複したまま出す", async () => {
    const host = await openTask(DUPLICATED);
    click(byText(host, "button.primary", "編集"));
    await settled();

    const select = [...host.querySelectorAll<HTMLSelectElement>("select")].find((candidate) =>
      optionValues(candidate).includes("To Do"),
    );
    expect(select).toBeDefined();
    expect(optionValues(select!).filter((value) => value === "In Progress")).toHaveLength(2);
  });

  it("新規タスク区画の status 選択が重複したまま出す", async () => {
    const host = await openSection(DUPLICATED, "新規タスク");

    const select = [...host.querySelectorAll<HTMLSelectElement>("select")].find((candidate) =>
      optionValues(candidate).includes("To Do"),
    );
    expect(select).toBeDefined();
    expect(optionValues(select!).filter((value) => value === "In Progress")).toHaveLength(2);
  });

  it("概要区画の別名表の候補一覧が重複したまま出す", async () => {
    const host = await openSection(DUPLICATED, "概要");

    // `datalist` は宣言済み status を別名キーの候補として出すだけで、選択を強制しない (doc-3 §3.3)。
    const options = host.querySelectorAll("datalist option");
    expect([...options].map((option) => option.getAttribute("value"))).toContain("In Progress");
    expect(options).toHaveLength(4);
  });
});

/**
 * 入口 4 — **画面が組み立てた問題文が、同じ文を 2 度返す**.
 *
 * ここだけは手編集を要さない。`addAliasRow` は `{ key: "", value: 正準列の先頭 }` を積むので、
 * 別名を追加 を 2 度押すと `aliasProblems` が同じ 1 文を 2 度返す。文そのものが鍵だったので、押した
 * 2 度目で 概要区画 が消えていた。
 */
describe("同じ問題文が 2 度返る", () => {
  it("別名を追加 を 2 度押しても区画が残り、問題文を 2 行出す", async () => {
    const host = await openSection(projectWith({}), "概要");

    click(byText(host, "button", "別名を追加"));
    await settled();
    click(byText(host, "button", "別名を追加"));
    await settled();

    expect(host.querySelectorAll(".aliases .alias-row")).toHaveLength(2);
    expect(host.querySelectorAll(".aliases p.problem")).toHaveLength(2);
  });
});
