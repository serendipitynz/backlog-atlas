/**
 * Which CLI options split the value they are handed, and which gate keeps a comma out of each
 * (`comma.ts`) — held as a check over the crate rather than as a count in a comment.
 *
 * TASK-155's defect was not a missing rule but a missing *site*: the rule was stated in three places
 * and four more options split their value without it, and nothing failed. So every option the adapter
 * may emit has to be classified below, and an option classified `splits` has to name a gate that
 * refuses a comma through the real frontend path.
 *
 * **The axis is the CLI's parse, not Atlas's `join(",")`.** The first version of this file counted
 * join sites and would have passed a tree where `--ref` — repeated once per reference, joined
 * nowhere — still splits every value it is given (measured on v1.50.1, as is every entry in the table
 * below). Repeatability decides nothing either way: `--ac` is repeatable and keeps its comma, `--ref`
 * is repeatable and splits. So the option set is taken from `allowed_options`, which is the complete
 * set the adapter can emit — `validate_options` refuses anything outside it — and a new option fails
 * here until someone measures it and writes down which way it went.
 *
 * The join sites are still scanned, as the other direction: an option Atlas comma-joins must be one
 * the CLI splits. Joining a set into an option that keeps its comma would send the set as one literal
 * value, which is the same class of silent wrong write from the other end.
 *
 * **Every `join(",")` must be attributable to an option**, not only the ones written as
 * `.opt("--x", …join(","))`. A value joined into a positional argument would be read the same way, so
 * an unattributable join fails rather than being skipped — that is the one shape a pattern written
 * around `.opt(` would have missed.
 *
 * Sources come through `import.meta.glob` with `?raw`, as `screen-text.test.ts` and
 * `wire-fixture.test.ts` do: `node:fs` would pull in `@types/node`, and the glob makes the scanned set
 * observable, which one of the tests uses. Rust `mod tests` blocks are cut before the join scan — a
 * test there may spell the joined form as its own expectation, and demanding a frontend gate for that
 * would be a false report. The cut is bounded to a module opened at column 0, because `editor.rs`
 * carries a `#[cfg(test)]` on a single item mid-file and cutting there would drop production code.
 *
 * Wording is not asserted here — `edit.test.ts` and `manage.test.ts` hold the sentences. What a row
 * proves is that the path refuses at all, and that the reason names the value the reader will look for.
 */
import { describe, expect, it } from "vitest";
import { buildSave, setField, startSession } from "./edit";
import {
  EMPTY_TASK_CREATE,
  buildDocUpdate,
  buildTaskCreate,
  setDocField,
  startDocSession,
} from "./manage";
import { documentView, taskView } from "./fixtures";

const CRATE: Record<string, string> = import.meta.glob("../../src-tauri/src/**/*.rs", {
  eager: true,
  query: "?raw",
  import: "default",
});

function crateSource(): string {
  const update = Object.entries(CRATE).find(([path]) => path.endsWith("/update.rs"));
  if (update === undefined) {
    throw new Error("update.rs was not among the scanned crate sources");
  }
  return update[1];
}

/**
 * Every option `allowed_options` permits, which is every option the adapter can emit —
 * `validate_options` refuses the rest before launch. Read from the function's own arms, so a new
 * option is in this set the moment it is allowed.
 */
function emittableOptions(source: string): string[] {
  const start = source.indexOf("fn allowed_options");
  const body = source.slice(start, source.indexOf("\n}", start));
  // Any quoted literal opening with a dash, not `--[a-z-]+`: a name with a digit (`--ac-2`) or a
  // short form (`-a`) would otherwise never enter this set, and the first test — emittable minus
  // classified — would pass by finding nothing. Nothing else quoted in these arms starts with a
  // dash, so the wide class costs no false entries.
  return [...new Set([...body.matchAll(/"(-[^"\s]+)"/g)].map((match) => match[1]))].sort();
}

/** The option name a joined value is passed under, or `null` when the site names none. */
interface CommaJoin {
  option: string | null;
  /** Enough of the statement to find the site from a failure message. */
  at: string;
}

function withoutTestModule(source: string): string {
  const at = source.indexOf("\n#[cfg(test)]\nmod tests");
  return at === -1 ? source : source.slice(0, at);
}

function commaJoins(source: string): CommaJoin[] {
  const joins: CommaJoin[] = [];
  for (const match of withoutTestModule(source).matchAll(/join\(","\)/g)) {
    const before = source.slice(0, match.index);
    // The statement the join sits in: back to the previous `;` or block open, whichever is nearer.
    // Rust puts one invocation option per statement, so the last option name in that span is the one
    // this value is passed under.
    const statement = before.slice(Math.max(before.lastIndexOf(";"), before.lastIndexOf("{")) + 1);
    const names = [...statement.matchAll(/"(-[^"\s]+)"/g)].map((name) => name[1]);
    joins.push({
      option: names.at(-1) ?? null,
      at: statement.trim().replace(/\s+/g, " ").slice(-80),
    });
  }
  return joins;
}

function joinedOptions(sources: Record<string, string>): string[] {
  const joins = Object.values(sources).flatMap(commaJoins);
  expect(joins.filter((join) => join.option === null).map((join) => join.at)).toEqual([]);
  return [...new Set(joins.map((join) => join.option as string))].sort();
}

/**
 * One row per option the adapter can emit.
 *
 * `splits` carries the path a reader reaches it through, run with a comma in the value, and the value
 * the refusal has to name. `keeps` and `noUserText` carry the reason no gate is needed: a value that
 * survives its comma, or a value Atlas computes rather than the reader typing it — an index, an enum
 * the screen picks from, a flag with no value at all. A rejected value counts as `noUserText` too when
 * the CLI validates it against a fixed list, since the comma never reaches a parse that could split.
 *
 * **Where each row comes from, since the three are not the same kind of claim** (TASK-155): every
 * `splits` row and every `keeps` row was measured on v1.50.1 by passing a comma through that option
 * and reading the file back. `--status`, `--priority`, `--type` and `--reassign-to` were measured too
 * — the first three exit 1 on a value outside their list, and the last resolved a comma-bearing
 * milestone name whole, which matters because Atlas can create such a milestone itself. The AC
 * indices, `--task-handling`, `--no-update-tasks`, `--clear-refs` and `--clear-deps` are classified by
 * construction rather than by measurement: Atlas builds those values, or there is no value at all, so
 * no comma can reach them whatever the CLI would do.
 */
type Classification =
  | { kind: "splits"; value: string; refuse: () => string | null }
  | { kind: "keeps"; note: string }
  | { kind: "noUserText"; note: string };

const OPTIONS: Record<string, Classification> = {
  "--labels": {
    kind: "splits",
    value: "a,b",
    refuse: () => blocked(buildTaskCreate({ ...EMPTY_TASK_CREATE, title: "T", labels: ["a,b"] })),
  },
  "--assignee": {
    kind: "splits",
    value: "dave,erin",
    refuse: () =>
      refused(
        buildSave(
          setField(startSession(taskView({ assignee: ["dave"] })), "assignee", ["dave,erin"]),
        ),
      ),
  },
  "--add-label": {
    kind: "splits",
    value: "b,c",
    refuse: () =>
      refused(buildSave(setField(startSession(taskView({ labels: ["a"] })), "labels", ["a", "b,c"]))),
  },
  "--remove-label": {
    kind: "splits",
    value: "x,y",
    refuse: () =>
      refused(buildSave(setField(startSession(taskView({ labels: ["x,y"] })), "labels", []))),
  },
  "--depends-on": {
    kind: "splits",
    value: "TASK-3,TASK-4",
    refuse: () =>
      refused(
        buildSave(
          setField(startSession(taskView({ dependencies: ["TASK-2"] })), "dependencies", [
            "TASK-3,TASK-4",
          ]),
        ),
      ),
  },
  "--ref": {
    // Short enough to survive `comma.ts`'s quote cut whole — the cut itself is `edit.test.ts`'s
    // business, and a row here asserting a truncated head would be asserting the wrong file's rule.
    kind: "splits",
    value: "https://m.test/@1,2",
    refuse: () =>
      refused(
        buildSave(
          setField(startSession(taskView({ references: ["https://a.test/1"] })), "references", [
            "https://m.test/@1,2",
          ]),
        ),
      ),
  },
  "--tags": {
    kind: "splits",
    value: "read,write",
    refuse: () =>
      blocked(buildDocUpdate(setDocField(startDocSession(documentView()), "tags", ["read,write"]))),
  },
  "--ac": { kind: "keeps", note: "repeatable and keeps its comma: `--ac \"first,second\"` は 1 件" },
  "--title": { kind: "keeps", note: "title: 'alpha,beta' と 1 値で書かれる" },
  "--description": { kind: "keeps", note: "本文にそのまま入る" },
  "--content": { kind: "keeps", note: "本文全置換。そのまま入る" },
  "--plan": { kind: "keeps", note: "本文にそのまま入る" },
  "--notes": { kind: "keeps", note: "本文にそのまま入る" },
  "--append-notes": { kind: "keeps", note: "本文にそのまま入る" },
  "--milestone": { kind: "keeps", note: "カンマを含む名前の既存マイルストーンへ解決した" },
  "--path": { kind: "keeps", note: "`alpha,beta/` というディレクトリになる" },
  "--status": { kind: "noUserText", note: "固定候補。合わない値は終了コード 1 で拒まれる" },
  "--priority": { kind: "noUserText", note: "固定候補。合わない値は終了コード 1 で拒まれる" },
  "--type": { kind: "noUserText", note: "固定候補。合わない値は終了コード 1 で拒まれる" },
  "--remove-ac": { kind: "noUserText", note: "Atlas が組む index" },
  "--check-ac": { kind: "noUserText", note: "Atlas が組む index" },
  "--uncheck-ac": { kind: "noUserText", note: "Atlas が組む index" },
  "--task-handling": { kind: "noUserText", note: "画面が選ぶ 3 値のいずれか" },
  "--reassign-to": {
    kind: "noUserText",
    note: "台帳が持つマイルストーン名。カンマを含む名前もそのまま解決した",
  },
  "--no-update-tasks": { kind: "noUserText", note: "値を持たないフラグ" },
  "--clear-refs": { kind: "noUserText", note: "値を持たないフラグ" },
  "--clear-deps": { kind: "noUserText", note: "値を持たないフラグ" },
};

function refused(plan: ReturnType<typeof buildSave>): string | null {
  return plan.state === "refused" ? plan.reason : null;
}

function blocked(plan: { state: string; reason?: string }): string | null {
  return plan.state === "blocked" ? (plan.reason ?? null) : null;
}

const SPLITTING = Object.entries(OPTIONS).filter(([, how]) => how.kind === "splits");

describe("カンマで分かれるオプションと関門の対 (TASK-155)", () => {
  it("アダプターが出せるオプションは、すべて分類されている", () => {
    // The set is `allowed_options`'s own, so a new option lands here before it can be emitted —
    // and it stays failing until someone measures which way the CLI reads it.
    expect(emittableOptions(crateSource()).filter((option) => !(option in OPTIONS))).toEqual([]);
  });

  it("表にあって crate が出せないオプションを残さない", () => {
    const emittable = new Set(emittableOptions(crateSource()));
    expect(Object.keys(OPTIONS).filter((option) => !emittable.has(option))).toEqual([]);
  });

  it("走査は update.rs を現に読み、空でない集合を返す", () => {
    // Without this, an empty glob would agree with an empty table by finding nothing.
    expect(emittableOptions(crateSource()).length).toBeGreaterThan(20);
    expect(SPLITTING).toHaveLength(7);
  });

  it("Atlas がカンマ連結するオプションは、いずれも CLI が分けるものである", () => {
    // The other direction: joining a set into an option that keeps its comma would send the set as
    // one literal value — the same silent wrong write from the other end.
    const joined = joinedOptions(CRATE);
    expect(joined.length).toBeGreaterThan(0);
    expect(joined.filter((option) => OPTIONS[option]?.kind !== "splits")).toEqual([]);
  });

  it("植えたオプションを見つけ、名前を持たない連結は落とさず報告する", () => {
    const planted = 'inv = inv.opt("--planted", c.values.join(","));';
    expect(commaJoins(planted).map((join) => join.option)).toEqual(["--planted"]);
    const positional =
      'let inv = Invocation::new(&["task", "create"]).positional(c.values.join(","));';
    expect(commaJoins(positional).map((join) => join.option)).toEqual([null]);
    // The cut is by module, not by the attribute: a `#[cfg(test)]` on one item leaves the rest scanned.
    const item = '    #[cfg(test)]\n    const ALL: u8 = 1;\n    inv.opt("--kept", v.join(","));';
    expect(commaJoins(item).map((join) => join.option)).toEqual(["--kept"]);
    expect(commaJoins('mod tests {\n    inv.opt("--in-test", v.join(","));\n}')).toHaveLength(1);
    expect(
      commaJoins('\n#[cfg(test)]\nmod tests {\n    inv.opt("--in-test", v.join(","));\n}'),
    ).toEqual([]);
  });

  for (const [option, how] of SPLITTING) {
    it(`${option} へ渡る経路はカンマを含む値を拒み、その値を理由に載せる`, () => {
      if (how.kind !== "splits") {
        throw new Error("filtered above");
      }
      const reason = how.refuse();
      expect(reason).not.toBeNull();
      expect(reason).toContain(how.value);
    });
  }
});
