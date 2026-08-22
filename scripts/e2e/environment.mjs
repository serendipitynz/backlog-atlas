// Everything the GUI E2E needs standing before a single control is pressed: a Backlog root to point
// Atlas at, the アプリ設定ディレクトリ put out of harm's way, and a running `tauri-driver`.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Run the Backlog CLI with a fixed subcommand and an argument array (AGENTS.md Updates), reading and
 * writing under `cwd`.
 *
 * **Windows takes a different route, and it is not decoration.** npm installs the CLI as
 * `backlog.cmd`, and since the 2024 argument-injection hardening Node refuses to spawn a `.cmd`
 * without a shell — `execFile` fails with `EINVAL`. `cmd.exe /d /s /c` is therefore unavoidable, and
 * the command line is built here rather than by handing `shell: true` an array: Node concatenates
 * that array with plain spaces and no quoting, which loses every path containing one. Nothing user-
 * supplied reaches this — the arguments are temp-dir paths this script created and literals from
 * `fixture.mjs` — but the quoting stays because the *next* caller is what a missing one costs.
 */
function runBacklog(args, cwd) {
  const environment = { ...process.env, BACKLOG_CWD: cwd };
  const result =
    process.platform === "win32"
      ? spawnSync(process.env.COMSPEC ?? "cmd.exe", ["/d", "/s", "/c", windowsCommandLine(args)], {
          cwd,
          env: environment,
          encoding: "utf8",
          windowsVerbatimArguments: true,
        })
      : spawnSync("backlog", args, { cwd, env: environment, encoding: "utf8" });
  if (result.error !== undefined && result.error !== null) {
    throw new Error(`backlog ${args[0]} could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `backlog ${args.join(" ")} exited ${result.status}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  return result.stdout ?? "";
}

/** `"` is the only character cmd.exe's parser takes from the values here; the rest travel literally. */
function windowsCommandLine(args) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return `"backlog ${args.map(quote).join(" ")}"`;
}

/** The one task the flow edits, and a second one so the swimlane draws more than one column. */
export const FIXTURE_TASKS = [
  { title: "詳細を開くタスク", status: "To Do", description: "本文の **強調** と `code` を 1 行。" },
  { title: "進行中のタスク", status: "In Progress", description: "二列目が立つことだけを見る。" },
];

/**
 * Build a Backlog root the flow can register, entirely through CLI calls — the same rule that binds
 * every other write to a managed file. `--no-git` because the route under test never reads Git
 * history, and `--agent-instructions none` so the fixture is the Backlog root and nothing else.
 */
export function buildFixture() {
  const projectRoot = mkdtempSync(join(tmpdir(), "atlas-e2e-"));
  runBacklog(
    ["init", "--defaults", "--no-git", "--agent-instructions", "none", "Atlas E2E Fixture"],
    projectRoot,
  );
  for (const task of FIXTURE_TASKS) {
    runBacklog(
      ["task", "create", task.title, "-d", task.description, "-s", task.status, "--plain"],
      projectRoot,
    );
  }
  return { projectRoot, backlogRoot: join(projectRoot, "backlog"), slug: "atlas-e2e" };
}

/** Whether the fixture's managed files now carry `title` — the proof that a save reached the CLI. */
export function fixtureCarriesTitle(fixture, title) {
  const listed = runBacklog(["task", "list", "--plain"], fixture.projectRoot);
  return listed.includes(title);
}

/**
 * Where Atlas keeps `projects.toml` and `settings.toml`: `app_config_dir()`, which Tauri builds from
 * the platform's config directory and the bundle identifier. The identifier is read from
 * `tauri.conf.json` rather than spelled here, so a rename cannot leave this pointing at a directory
 * nothing writes.
 */
export function atlasConfigDirectory() {
  const config = JSON.parse(readFileSync(join(repositoryRoot, "src-tauri", "tauri.conf.json"), "utf8"));
  const identifier = config.identifier;
  if (process.platform === "win32") {
    const roaming = process.env.APPDATA;
    if (roaming === undefined) {
      throw new Error("APPDATA is unset, so the アプリ設定ディレクトリ cannot be located");
    }
    return join(roaming, identifier);
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", identifier);
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), identifier);
}

const MANAGED_BY_ATLAS = ["projects.toml", "settings.toml", ".window-state.json"];

/**
 * Move any existing アプリ設定 aside so the run starts from an empty ledger, and give back the call
 * that puts them back.
 *
 * A fresh CI runner has none of them and this does nothing. The reason it exists is the other place
 * the suite runs: a developer's own machine, where these files are the real ledger. **On Windows the
 * directory cannot be redirected** — `dirs::config_dir()` asks `SHGetKnownFolderPath`, which does not
 * read `APPDATA` — so moving the files is the only isolation available, and it has to be the same
 * code path on Linux for there to be one path to get right.
 *
 * A backup left by a run that died is refused rather than overwritten: the second run's empty ledger
 * would otherwise become the backup, and the real one would be gone.
 */
export function setConfigAside() {
  const directory = atlasConfigDirectory();
  mkdirSync(directory, { recursive: true });

  // Every leftover is found before anything is moved. Refusing inside the move loop would leave the
  // files ahead of the refusal moved with nobody holding the call that puts them back — the caller's
  // `finally` does not exist yet at this point.
  for (const name of MANAGED_BY_ATLAS) {
    const aside = `${join(directory, name)}.e2e-aside`;
    if (existsSync(aside)) {
      throw new Error(
        `${aside} is left over from a run that did not finish. Move it back to ${join(directory, name)} (or delete it if you know it is stale) before running the E2E again.`,
      );
    }
  }

  const moved = [];
  for (const name of MANAGED_BY_ATLAS) {
    const live = join(directory, name);
    if (existsSync(live)) {
      renameSync(live, `${live}.e2e-aside`);
      moved.push({ live, aside: `${live}.e2e-aside` });
    }
  }
  return function restore() {
    for (const name of MANAGED_BY_ATLAS) {
      rmSync(join(directory, name), { force: true });
    }
    for (const { live, aside } of moved) {
      renameSync(aside, live);
    }
  };
}

/** The release binary the driver launches. Built by `cargo build --release`, not by the bundler. */
export function atlasBinary() {
  const name = process.platform === "win32" ? "backlog-atlas.exe" : "backlog-atlas";
  const path = join(repositoryRoot, "src-tauri", "target", "release", name);
  if (!existsSync(path)) {
    throw new Error(
      `${path} does not exist. Build it first: pnpm run build && cargo build --release --manifest-path src-tauri/Cargo.toml`,
    );
  }
  return path;
}

/**
 * Start `tauri-driver` and wait until it answers. It is `cargo install`ed rather than depended on:
 * it is a standalone binary with no Rust API, so a `Cargo.toml` entry would express nothing.
 */
export async function startDriver({ port, nativePort }) {
  const args = [`--port=${port}`, `--native-port=${nativePort}`];
  const nativeDriver = process.env.ATLAS_E2E_NATIVE_DRIVER;
  if (nativeDriver !== undefined && nativeDriver !== "") {
    args.push(`--native-driver=${nativeDriver}`);
  }
  const child = spawn("tauri-driver", args, { stdio: ["ignore", "inherit", "inherit"] });
  let exited = null;
  child.on("exit", (code) => {
    exited = code;
  });
  child.on("error", (error) => {
    exited = error.message;
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (exited !== null) {
      throw new Error(
        `tauri-driver stopped before it accepted a connection (${exited}). On macOS it always does — it supports Linux and Windows only.`,
      );
    }
    try {
      await fetch(`${base}/status`);
      return { base, stop: () => child.kill() };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  child.kill();
  throw new Error(`tauri-driver did not answer on ${base} within 30s`);
}

export function removeFixture(fixture) {
  rmSync(fixture.projectRoot, { recursive: true, force: true });
}
