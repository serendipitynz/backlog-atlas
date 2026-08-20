/**
 * The pairing of a comma-joined CLI option with the gate that keeps a comma out of it (`comma.ts`),
 * held as a check over the crate rather than as a count in a comment.
 *
 * TASK-155's defect was not a missing rule but a missing *site*: the rule was stated in three places
 * and three more options travelled the same way without it, and nothing failed. So the enumeration is
 * taken from where the joining happens — `update.rs` — and each option found must name a gate below
 * that refuses a comma through the real frontend path. A seventh option cannot arrive quietly: it has
 * no row here, and the first test says so.
 *
 * **Every `join(",")` must be attributable to an option**, not only the ones written as
 * `.opt("--x", …join(","))`. A value joined into a positional argument would travel the same way and
 * read the same way, so an unattributable join fails rather than being skipped — that is the one shape
 * a pattern written around `.opt(` would have missed.
 *
 * Sources come through `import.meta.glob` with `?raw`, as `screen-text.test.ts` and
 * `wire-fixture.test.ts` do: `node:fs` would pull in `@types/node`, and the glob makes the scanned set
 * observable, which the second test uses. Rust `mod tests` blocks are cut first — a test there may
 * spell the joined form as its own expectation, and demanding a frontend gate for that would be a
 * false report. The cut is bounded to a module opened at column 0, because `editor.rs` carries a
 * `#[cfg(test)]` on a single item mid-file and cutting there would drop production code from the scan.
 *
 * Wording is not asserted here — `edit.test.ts` and `manage.test.ts` hold the sentences. What a row
 * proves is that the path refuses at all, and that the reason names the value the reader will look for.
 */
import { describe, expect, it } from "vitest";
import { buildSave, setField, startSession } from "./edit";
import { EMPTY_TASK_CREATE, buildDocUpdate, buildTaskCreate, setDocField, startDocSession } from "./manage";
import { documentView, taskView } from "./fixtures";

const CRATE: Record<string, string> = import.meta.glob("../../src-tauri/src/**/*.rs", {
  eager: true,
  query: "?raw",
  import: "default",
});

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
    const names = [...statement.matchAll(/"(--?[a-z][a-z-]*)"/g)].map((name) => name[1]);
    joins.push({ option: names.at(-1) ?? null, at: statement.trim().replace(/\s+/g, " ").slice(-80) });
  }
  return joins;
}

function commaValuedOptions(sources: Record<string, string>): string[] {
  const joins = Object.values(sources).flatMap(commaJoins);
  const unattributed = joins.filter((join) => join.option === null);
  expect(unattributed.map((join) => join.at)).toEqual([]);
  return [...new Set(joins.map((join) => join.option as string))].sort();
}

/**
 * One row per comma-joined option: the path a reader reaches it through, run with a comma in the
 * value, and the value the refusal has to name.
 */
const GATES: { option: string; value: string; refuse: () => string | null }[] = [
  {
    option: "--labels",
    value: "a,b",
    refuse: () => blocked(buildTaskCreate({ ...EMPTY_TASK_CREATE, title: "T", labels: ["a,b"] })),
  },
  {
    option: "--assignee",
    value: "dave,erin",
    refuse: () =>
      refused(
        buildSave(setField(startSession(taskView({ assignee: ["dave"] })), "assignee", ["dave,erin"])),
      ),
  },
  {
    option: "--add-label",
    value: "b,c",
    refuse: () =>
      refused(buildSave(setField(startSession(taskView({ labels: ["a"] })), "labels", ["a", "b,c"]))),
  },
  {
    option: "--remove-label",
    value: "x,y",
    refuse: () =>
      refused(buildSave(setField(startSession(taskView({ labels: ["x,y"] })), "labels", []))),
  },
  {
    option: "--depends-on",
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
  {
    option: "--tags",
    value: "read,write",
    refuse: () =>
      blocked(buildDocUpdate(setDocField(startDocSession(documentView()), "tags", ["read,write"]))),
  },
];

function refused(plan: ReturnType<typeof buildSave>): string | null {
  return plan.state === "refused" ? plan.reason : null;
}

function blocked(plan: { state: string; reason?: string }): string | null {
  return plan.state === "blocked" ? (plan.reason ?? null) : null;
}

describe("カンマ区切り値として渡すオプションと関門の対 (TASK-155)", () => {
  it("crate が値をカンマ連結するオプションは、すべて下の表に行を持つ", () => {
    expect(commaValuedOptions(CRATE)).toEqual([...GATES.map((gate) => gate.option)].sort());
  });

  it("走査は update.rs を現に読んでいる", () => {
    // Without this, an empty glob would make the scan agree with an empty table by finding nothing.
    const scanned = Object.keys(CRATE).filter((path) => path.endsWith("/update.rs"));
    expect(scanned).toHaveLength(1);
    expect(commaValuedOptions(CRATE)).not.toHaveLength(0);
  });

  it("植えたオプションを見つけ、名前を持たない連結は落とさず報告する", () => {
    const planted = 'inv = inv.opt("--planted", c.values.join(","));';
    expect(commaJoins(planted).map((join) => join.option)).toEqual(["--planted"]);
    const positional = 'let inv = Invocation::new(&["task", "create"]).positional(c.values.join(","));';
    expect(commaJoins(positional).map((join) => join.option)).toEqual([null]);
    // The cut is by module, not by the attribute: a `#[cfg(test)]` on one item leaves the rest scanned.
    const item = '    #[cfg(test)]\n    const ALL: u8 = 1;\n    inv.opt("--kept", v.join(","));';
    expect(commaJoins(item).map((join) => join.option)).toEqual(["--kept"]);
    expect(commaJoins('mod tests {\n    inv.opt("--in-test", v.join(","));\n}')).toHaveLength(1);
    expect(commaJoins('\n#[cfg(test)]\nmod tests {\n    inv.opt("--in-test", v.join(","));\n}')).toEqual(
      [],
    );
  });

  for (const gate of GATES) {
    it(`${gate.option} へ渡る経路はカンマを含む値を拒み、その値を理由に載せる`, () => {
      const reason = gate.refuse();
      expect(reason).not.toBeNull();
      expect(reason).toContain(gate.value);
    });
  }
});
