/**
 * 画面横断契約 1 件 (TASK-93): `commands.ts` の invoke signature と Rust のコマンド宣言の一致.
 *
 * TASK-91 tied the payloads — the recorded fixtures compare serde's output with `wire.ts` three ways,
 * and the app's own functions read the recordings. It left the *call* untied. A command name is
 * spelled three times (the `#[tauri::command]` function, the `generate_handler!` entry, the
 * `invoke("…")` literal), an argument name twice (the Rust parameter, the object key `invoke` is
 * handed), a return type twice (the Rust signature, the `invoke<T>` type argument), and an event name
 * twice (the crate's `&str` const, the frontend's own const). None of those pairs is compared by
 * anything: both sides build, `cargo test` passes, `pnpm run check` passes, and the call fails at
 * runtime in a Tauri window — which is the one place none of the three test layers reaches.
 *
 * ## Why a scan and not a recording
 *
 * The payload half needs a recording because serde's output cannot be derived from the source text.
 * These four can: every one of them is a literal on both sides. So this reads the sources, and adding
 * a Rust-side fixture would only add a third place for the same names to drift.
 *
 * ## What the comparisons rest on
 *
 * - **Which parameters JS supplies is decided by type, not by name.** `AppHandle` and
 *   `State<'_, T>` are injected by Tauri; everything else comes from the object handed to `invoke`.
 *   Keying on the spellings `app` and `state` would make a renamed handle a required JS key. An
 *   unrecognised type is treated as JS-supplied on purpose — if Tauri gains another injected type,
 *   this reddens and someone reads it, where the opposite default would silently stop requiring a key.
 * - **The Rust parameter name is converted, not compared.** `#[tauri::command]` defaults to
 *   `rename_all = "camelCase"`, so `project_root` is looked up as `projectRoot`. Measured
 *   2026-08-23: 25 invoke sites, all in that form, and no `rename_all` written anywhere in the crate.
 *   Only that one direction is implemented — a site that writes the attribute has to fail here rather
 *   than be quietly accepted, because the frontend would need changing too.
 * - **The type table holds primitives only; everything else is compared by name.** `LedgerResponse`
 *   and `CliReadiness` are spelled identically on both sides, so identity is the comparison and the
 *   table stays small. **A type the table cannot map is a failure, not a skip** — the alternative is
 *   the shape this repository has been bitten by three times, where the predicate answers about a set
 *   it never reached.
 *
 * ## The floor under the scan
 *
 * Three extractions (`lib.rs`'s handler list, the crate's attributed functions, `commands.ts`'s
 * invoke sites) feed set comparisons, and two empty sets compare equal. So the attributed set is also
 * checked against a cruder count of the same attribute, and every extraction is required to be
 * non-empty. Neither guard spells a number: a literal count would be edited to match on the next
 * command added, which is exactly when the guard is supposed to speak.
 *
 * ## What this does not hold
 *
 * - **That an argument's value is what the Rust type accepts.** The types are compared as written;
 *   `PathBuf` and `String` both map to `string`, so swapping them passes.
 * - **That a command does what its name says.** Only the surface is compared.
 * - **The `commandFakes` list in `fake-boundary.ts`.** Those labels name `commands.ts` functions, not
 *   commands — three of them (`pick_directory`, `ledger_reorder`, `on_project_reloaded`) have no Rust
 *   command behind them at all, because the first is the dialog plugin, the second wraps
 *   `ledger_update`, and the third is the event.
 *
 * Sources come through `import.meta.glob` with `?raw`, as `comma.test.ts` does for the same crate:
 * `node:fs` would pull in `@types/node`, and the glob makes the scanned set observable.
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
  /** The keys of the object literal handed to `invoke`, shorthand or `key: value`. */
  keys: string[];
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
    const keys = splitTopLevel(call[3] ?? "").map((entry) =>
      entry.includes(":") ? entry.slice(0, entry.indexOf(":")).trim() : entry,
    );
    sites.push({
      through: head[1],
      command: call[2],
      returns: normalized(call[1]),
      keys,
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
 * Primitives only. A capitalised name that is not in here is a `wire.ts` type, compared by identity;
 * anything else is a failure rather than a pass, so a new shape at the boundary is read by someone.
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
    return "ts" in inner ? { ts: `${inner.ts}[]` } : inner;
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
      if (sorted(wanted) !== sorted(site.keys)) {
        differing.push(`${site.command}: Rust は [${sorted(wanted)}]、invoke は [${sorted(site.keys)}]`);
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
        const declared = site.parameters.find((one) => one.name === key);
        if (declared === undefined) {
          differing.push(`${site.command}: ${site.through} に引数 ${key} が無い`);
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

/**
 * Three commands have no caller, and the set is locked rather than excused: `cross_task_id_generate`
 * and `cross_task_id_parse` implement doc-3 §5.1 and no screen shows a 横断タスクID yet, and
 * `project_close` has no caller because the startup path opens every root and never closes one. That
 * reading is this session's, not a decision's, so what is held here is the set — a fourth command
 * with no caller reddens this and someone decides which way it goes.
 */
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

/** The first argument of every `emit`, with `//` comment lines dropped so a discussion is not a site. */
function emittedEventArguments(): string[] {
  const arguments_: string[] = [];
  for (const source of Object.values(CRATE)) {
    const code = source.replace(/^[^\n"]*\/\/.*$/gm, "");
    for (const one of code.matchAll(/\.emit(?:_to|_filter)?\(\s*([A-Za-z_][\w:]*|"[^"]*")/g)) {
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
