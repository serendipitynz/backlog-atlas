/**
 * 画面横断契約 1 件 (TASK-93): `commands.ts` の invoke signature と Rust のコマンド宣言の一致.
 *
 * What is compared, why a scan rather than a fixture, and what to do when a command changes on
 * purpose: AGENTS の テスト 節. What is here is how the comparison is built, which that section does
 * not decide.
 *
 * **Every extraction is set against a second reading of the same thing.** Three of them
 * (`lib.rs`'s handler list, the crate's attributed functions, `commands.ts`'s invoke sites) feed set
 * comparisons, and two empty sets compare equal — so the attributed set is also held against a cruder
 * count of the same attribute, and each extraction must be non-empty. Neither guard spells a number:
 * a literal count would be edited to match on the next command added, which is exactly when the guard
 * is supposed to speak.
 *
 * **An unrecognised parameter type is treated as JS-supplied**, so `INJECTED` growing short reddens
 * this instead of quietly dropping a required key. **An unmappable return or argument type is a
 * failure rather than a skip**, for the same reason from the other end.
 *
 * **A key is resolved to the wrapper parameter its value names, not to its own spelling** — shorthand
 * makes those the same word, and `{ projectRoot: root }` does not.
 *
 * Sources come through `import.meta.glob` with `?raw`, as `comma.test.ts` does for the same crate:
 * `node:fs` would pull in `@types/node`, and the glob makes the scanned set observable.
 *
 * ## What this does not reach
 *
 * - **Whether an argument's value is one the Rust type accepts.** The types are compared as written,
 *   and `PathBuf` and `String` both map to `string`, so swapping them passes.
 * - **Whether a command does what its name says.** Only the declaration is read.
 * - **`fake-boundary.ts`'s `commandFakes`.** Those labels name `commands.ts` functions rather than
 *   commands, and three of them have no Rust command behind them by design (the dialog plugin, a
 *   wrapper over `ledger_update`, and the event) — so a later reader counting reachability there must
 *   not read the three as a defect.
 *
 * No DOM here — this is source text and set comparisons, so it runs in the `node` project.
 */
import { describe, expect, it } from "vitest";

const CRATE: Record<string, string> = import.meta.glob("../../src-tauri/src/**/*.rs", {
  eager: true,
  query: "?raw",
  import: "default",
});

const FRONTEND: Record<string, string> = import.meta.glob("./commands.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

function crateSource(suffix: string): string {
  const found = Object.entries(CRATE).find(([path]) => path.endsWith(suffix));
  if (found === undefined) {
    throw new Error(`${suffix} was not among the scanned crate sources`);
  }
  return found[1];
}

function frontendSource(): string {
  const found = Object.values(FRONTEND);
  if (found.length !== 1) {
    throw new Error(`commands.ts was not scanned (${found.length} sources matched)`);
  }
  return found[0];
}

/** One `name: type` pair, as both languages write a parameter. */
interface Parameter {
  name: string;
  type: string;
}

interface RustCommand {
  name: string;
  parameters: Parameter[];
  /** The written return type, or `()` where the signature has no `->` at all. */
  returns: string;
}

interface InvokeSite {
  /** The exported function the call sits in, so a failure names something greppable. */
  through: string;
  command: string;
  returns: string;
  /**
   * The object literal handed to `invoke`: each key with the expression it is given. Shorthand makes
   * the two the same word, and the value is what the wrapper's parameter list is looked up by — a
   * site written `{ projectRoot: root }` names its type under `root`, not under the key.
   */
  bindings: { key: string; value: string }[];
  parameters: Parameter[];
}

/**
 * Split on commas that are not inside brackets. `State<'_, AtlasState>` and `Result<T, CommandError>`
 * both carry a comma that a plain split would break on.
 */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "<" || char === "(" || char === "[") {
      depth += 1;
    } else if (char === ">" || char === ")" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** The index of the bracket closing the one at `at`, or -1. */
function closingIndex(text: string, at: number, open: string, close: string): number {
  let depth = 0;
  for (let index = at; index < text.length; index += 1) {
    if (text[index] === open) {
      depth += 1;
    } else if (text[index] === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function parseParameters(text: string): Parameter[] {
  return splitTopLevel(text).map((part) => {
    const colon = part.indexOf(":");
    if (colon === -1) {
      return { name: part, type: "" };
    }
    return { name: part.slice(0, colon).trim(), type: normalized(part.slice(colon + 1)) };
  });
}

function normalized(type: string): string {
  return type.replace(/\s+/g, " ").trim();
}

/** How many times the attribute is written at all — the cruder count the extraction is held against. */
function attributeOccurrences(): number {
  return Object.values(CRATE).reduce(
    (total, source) => total + (source.match(/^#\[tauri::command/gm) ?? []).length,
    0,
  );
}

/**
 * Every function carrying the attribute, over the whole crate rather than `commands.rs` alone: a
 * command added to another module has to enter this set without an edit here.
 */
function attributedCommands(): RustCommand[] {
  const found: RustCommand[] = [];
  for (const source of Object.values(CRATE)) {
    const heads = source.matchAll(/^#\[tauri::command[^\]]*\]\s*\npub (?:async )?fn (\w+)\s*\(/gm);
    for (const head of heads) {
      const open = head.index + head[0].length - 1;
      const close = closingIndex(source, open, "(", ")");
      const between = source.slice(close + 1, source.indexOf("{", close));
      const arrow = between.indexOf("->");
      found.push({
        name: head[1],
        parameters: parseParameters(source.slice(open + 1, close)),
        returns: arrow === -1 ? "()" : normalized(between.slice(arrow + 2)),
      });
    }
  }
  return found;
}

/**
 * The handler list, by the last segment of each entry: a command registered through some other
 * module's path still has to be in this set, or the comparison with the attributed set would pass by
 * missing it on both sides.
 */
function registeredCommands(): string[] {
  const source = crateSource("/lib.rs");
  const open = source.indexOf("generate_handler![");
  if (open === -1) {
    throw new Error("generate_handler! was not found in lib.rs");
  }
  const bracket = source.indexOf("[", open);
  const close = closingIndex(source, bracket, "[", "]");
  const block = source.slice(bracket + 1, close).replace(/\/\/[^\n]*/g, "");
  return block
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.slice(entry.lastIndexOf(":") + 1));
}

function invokeSites(): InvokeSite[] {
  const source = frontendSource();
  const sites: InvokeSite[] = [];
  for (const head of source.matchAll(/^export (?:async )?function (\w+)\s*\(/gm)) {
    const open = head.index + head[0].length - 1;
    const close = closingIndex(source, open, "(", ")");
    const body = source.slice(close, source.indexOf("\n}", close));
    const call = body.match(/invoke<([\s\S]*?)>\(\s*"(\w+)"\s*(?:,\s*\{([^}]*)\})?\s*\)/);
    if (call === null) {
      continue;
    }
    const bindings = splitTopLevel(call[3] ?? "").map((entry) => {
      const colon = entry.indexOf(":");
      if (colon === -1) {
        return { key: entry, value: entry };
      }
      return { key: entry.slice(0, colon).trim(), value: entry.slice(colon + 1).trim() };
    });
    sites.push({
      through: head[1],
      command: call[2],
      returns: normalized(call[1]),
      bindings,
      parameters: parseParameters(source.slice(open + 1, close)),
    });
  }
  return sites;
}

/** The parameter types Tauri fills in, so they are not keys the frontend has to send. */
const INJECTED = [/^AppHandle$/, /^State<.*>$/, /^Window$/, /^Webview$/, /^WebviewWindow$/];

function suppliedByFrontend(command: RustCommand): Parameter[] {
  return command.parameters.filter(
    (parameter) => !INJECTED.some((pattern) => pattern.test(parameter.type)),
  );
}

function camelCase(name: string): string {
  return name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Primitives only — a capitalised name absent from here is taken as a `wire.ts` type and compared by
 * identity, which is what keeps the map from becoming a second copy of `wire.ts`'s names.
 */
const PRIMITIVES = new Map([
  ["String", "string"],
  ["PathBuf", "string"],
  ["bool", "boolean"],
  ["()", "void"],
  ["tauri::ipc::Response", "ArrayBuffer"],
]);

/** The TypeScript spelling of a Rust type at the boundary, or the reason it could not be written. */
function asTypeScript(rust: string): { ts: string } | { unmappable: string } {
  const type = normalized(rust);
  const result = type.match(/^Result<([\s\S]*)>$/);
  if (result !== null) {
    const sides = splitTopLevel(result[1]);
    if (sides.length !== 2 || sides[1] !== "CommandError") {
      return { unmappable: `Result の形が想定外: ${type}` };
    }
    return asTypeScript(sides[0]);
  }
  const option = type.match(/^Option<([\s\S]*)>$/);
  if (option !== null) {
    const inner = asTypeScript(option[1]);
    return "ts" in inner ? { ts: `${inner.ts} | null` } : inner;
  }
  const vec = type.match(/^Vec<([\s\S]*)>$/);
  if (vec !== null) {
    const inner = asTypeScript(vec[1]);
    if (!("ts" in inner)) {
      return inner;
    }
    // `Vec<Option<String>>` unparenthesised is `string | null[]`, which TS reads as `string | (null[])`.
    return { ts: inner.ts.includes("|") ? `(${inner.ts})[]` : `${inner.ts}[]` };
  }
  const primitive = PRIMITIVES.get(type);
  if (primitive !== undefined) {
    return { ts: primitive };
  }
  if (/^[A-Z]\w*$/.test(type)) {
    return { ts: type };
  }
  return { unmappable: `写せない型: ${type}` };
}

const ATTRIBUTED = attributedCommands();
const REGISTERED = registeredCommands();
const SITES = invokeSites();

/** The commands `commands.ts` reaches, paired with their declaration. */
const PAIRED = SITES.map((site) => ({
  site,
  command: ATTRIBUTED.find((candidate) => candidate.name === site.command),
}));

describe("Rust 側の登録と属性が同じ集合を指す", () => {
  it("抽出が空でない", () => {
    expect(attributeOccurrences()).toBeGreaterThan(0);
    expect(REGISTERED.length).toBeGreaterThan(0);
    expect(SITES.length).toBeGreaterThan(0);
  });

  it("抽出した属性の数が、属性の素の出現数と一致する", () => {
    expect(ATTRIBUTED.length).toBe(attributeOccurrences());
  });

  it("`generate_handler!` の登録と、属性の付いた関数が一致する", () => {
    expect([...REGISTERED].sort()).toEqual([...ATTRIBUTED.map((one) => one.name)].sort());
  });
});

describe("`commands.ts` の invoke が Rust の宣言と一致する", () => {
  it("invoke するコマンド名はすべて登録されている", () => {
    const unknown = SITES.filter((site) => !REGISTERED.includes(site.command)).map(
      (site) => `${site.through} → ${site.command}`,
    );
    expect(unknown).toEqual([]);
  });

  it("JS が渡すキーが、Rust の引数名を camelCase にしたものと一致する", () => {
    const differing: string[] = [];
    for (const { site, command } of PAIRED) {
      if (command === undefined) {
        continue;
      }
      const wanted = suppliedByFrontend(command).map((one) => camelCase(one.name));
      const sorted = (names: string[]): string => [...names].sort().join(", ");
      const sent = site.bindings.map((one) => one.key);
      if (sorted(wanted) !== sorted(sent)) {
        differing.push(`${site.command}: Rust は [${sorted(wanted)}]、invoke は [${sorted(sent)}]`);
      }
    }
    expect(differing).toEqual([]);
  });

  it("引数の型が両側で同じものを指す", () => {
    const differing: string[] = [];
    for (const { site, command } of PAIRED) {
      if (command === undefined) {
        continue;
      }
      for (const parameter of suppliedByFrontend(command)) {
        const key = camelCase(parameter.name);
        const binding = site.bindings.find((one) => one.key === key);
        if (binding === undefined) {
          continue;
        }
        const declared = site.parameters.find((one) => one.name === binding.value);
        if (declared === undefined) {
          differing.push(`${site.command}: ${site.through} に ${binding.value} という引数が無い`);
          continue;
        }
        const wanted = asTypeScript(parameter.type);
        if ("unmappable" in wanted) {
          differing.push(`${site.command} の ${key}: ${wanted.unmappable}`);
        } else if (wanted.ts !== declared.type) {
          differing.push(
            `${site.command} の ${key}: Rust は ${parameter.type} (= ${wanted.ts})、TS は ${declared.type}`,
          );
        }
      }
    }
    expect(differing).toEqual([]);
  });

  it("`invoke<T>` の T が Rust の戻り型と同じものを指す", () => {
    const differing: string[] = [];
    for (const { site, command } of PAIRED) {
      if (command === undefined) {
        continue;
      }
      const wanted = asTypeScript(command.returns);
      if ("unmappable" in wanted) {
        differing.push(`${site.command}: ${wanted.unmappable}`);
      } else if (wanted.ts !== site.returns) {
        differing.push(
          `${site.command}: Rust は ${command.returns} (= ${wanted.ts})、invoke は ${site.returns}`,
        );
      }
    }
    expect(differing).toEqual([]);
  });
});

/** Which three, and why the set is locked rather than excused one by one: AGENTS の テスト 節. */
const UNREACHED = ["cross_task_id_generate", "cross_task_id_parse", "project_close"];

describe("フロントが到達しないコマンド", () => {
  it("固定した集合のままである", () => {
    const unreached = REGISTERED.filter(
      (name) => !SITES.some((site) => site.command === name),
    ).sort();
    expect(unreached).toEqual([...UNREACHED].sort());
  });
});

/** The name a `&str` const carries, over the whole crate — the emit site names the const, not a literal. */
function crateStringConstants(): Map<string, string> {
  const constants = new Map<string, string>();
  for (const source of Object.values(CRATE)) {
    for (const one of source.matchAll(/(?:pub )?const (\w+): &str = "([^"]*)";/g)) {
      constants.set(one[1], one[2]);
    }
  }
  return constants;
}

/**
 * The first argument of every `emit`, skipping the ones a comment is talking about.
 *
 * A commented-out site is skipped by looking at what precedes it on its own line, rather than by
 * deleting comments from the source first. Deleting is what the first version did, and its pattern
 * took the code with the comment: `app.emit(X, y); // fire and forget` became an empty line, so the
 * site left the set while the floor below stayed green on the sites that had no trailing comment.
 */
function emittedEventArguments(): string[] {
  const arguments_: string[] = [];
  for (const source of Object.values(CRATE)) {
    for (const one of source.matchAll(/\.emit(?:_to|_filter)?\(\s*([A-Za-z_][\w:]*|"[^"]*")/g)) {
      const lineStart = source.lastIndexOf("\n", one.index) + 1;
      if (source.slice(lineStart, one.index).includes("//")) {
        continue;
      }
      arguments_.push(one[1]);
    }
  }
  return arguments_;
}

describe("イベント名が両側で同じ文字列である", () => {
  const emitted = emittedEventArguments();

  it("`emit` の呼び出しがある", () => {
    expect(emitted.length).toBeGreaterThan(0);
  });

  it("第 1 引数がすべて文字列として解決できる", () => {
    const constants = crateStringConstants();
    const unresolved = emitted.filter(
      (argument) =>
        !argument.startsWith('"') && !constants.has(argument.slice(argument.lastIndexOf(":") + 1)),
    );
    expect(unresolved).toEqual([]);
  });

  it("同じ名前の定数が `commands.ts` にあり、同じ文字列を持つ", () => {
    const constants = crateStringConstants();
    const source = frontendSource();
    const differing: string[] = [];
    for (const argument of emitted) {
      if (argument.startsWith('"')) {
        differing.push(`emit がリテラルを直に書いている: ${argument}`);
        continue;
      }
      const name = argument.slice(argument.lastIndexOf(":") + 1);
      const value = constants.get(name);
      if (value === undefined) {
        continue;
      }
      const declared = source.match(new RegExp(`const ${name} = "([^"]*)";`));
      if (declared === null) {
        differing.push(`commands.ts に ${name} が無い (crate は "${value}")`);
      } else if (declared[1] !== value) {
        differing.push(`${name}: crate は "${value}"、commands.ts は "${declared[1]}"`);
      }
    }
    expect(differing).toEqual([]);
  });
});
