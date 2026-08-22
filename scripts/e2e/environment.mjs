// Everything the GUI E2E needs standing before a single control is pressed: a Backlog root to point
// Atlas at, the アプリ設定ディレクトリ put out of harm's way, and a running `tauri-driver`.
//
// **The suite runs on Linux.** `tauri-driver` supports Linux and Windows, but only the Linux half
// reaches Atlas: Tauri asks wry to allow automation and wry implements that for webkitgtk alone —
// every other platform gets the empty default (`wry`'s `WebContextImpl::set_allows_automation`), so
// on Windows the WebView2 never opens a debugging port and the driver's session creation fails.
// decision-40 carries the measurement. macOS gets as far as this file's own work and then stops,
// which is deliberate: it is what lets the fixture, the aside and the restore be exercised from a
// development machine.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Run the Backlog CLI with a fixed subcommand and an argument array (AGENTS.md Updates). */
function runBacklog(args, cwd) {
  const result = spawnSync("backlog", args, {
    cwd,
    env: { ...process.env, BACKLOG_CWD: cwd },
    encoding: "utf8",
  });
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
  return runBacklog(["task", "list", "--plain"], fixture.projectRoot).includes(title);
}

/**
 * Where Atlas keeps `projects.toml` and `settings.toml`: `app_config_dir()`, which Tauri builds from
 * the platform's config directory and the bundle identifier. The identifier is read from
 * `tauri.conf.json` rather than spelled here, so a rename cannot leave this pointing at a directory
 * nothing writes. macOS is here because the preamble is exercised there; Windows is not, because the
 * suite cannot run there at all.
 */
export function atlasConfigDirectory() {
  const config = JSON.parse(
    readFileSync(join(repositoryRoot, "src-tauri", "tauri.conf.json"), "utf8"),
  );
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", config.identifier);
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), config.identifier);
}

const MANAGED_BY_ATLAS = ["projects.toml", "settings.toml", ".window-state.json"];

const asideOf = (live) => `${live}.e2e-aside`;

/**
 * Move any existing アプリ設定 aside so the run starts from an empty ledger, and give back the call
 * that puts them back.
 *
 * A fresh CI runner has none of them and this does nothing. The reason it exists is the other place
 * the suite runs: a developer's own machine, where these files are the real ledger.
 *
 * **Nothing is left displaced by a failure here.** A backup left by a run that died is refused before
 * the first move, because a refusal part-way through would strand the files ahead of it — the
 * caller's `finally` does not exist until this function returns. For the same reason a rename that
 * throws rolls back the moves already made before it rethrows.
 */
export function setConfigAside() {
  const directory = atlasConfigDirectory();
  mkdirSync(directory, { recursive: true });

  for (const name of MANAGED_BY_ATLAS) {
    const aside = asideOf(join(directory, name));
    if (existsSync(aside)) {
      throw new Error(
        `${aside} is left over from a run that did not finish. Move it back to ${join(directory, name)} (or delete it if you know it is stale) before running the E2E again.`,
      );
    }
  }

  const moved = [];
  const putBack = () => {
    for (const { live, aside } of moved) {
      renameSync(aside, live);
    }
  };
  try {
    for (const name of MANAGED_BY_ATLAS) {
      const live = join(directory, name);
      if (existsSync(live)) {
        renameSync(live, asideOf(live));
        moved.push({ live, aside: asideOf(live) });
      }
    }
  } catch (error) {
    putBack();
    throw error;
  }

  return function restore() {
    for (const name of MANAGED_BY_ATLAS) {
      rmSync(join(directory, name), { force: true });
    }
    putBack();
  };
}

/**
 * The binary the driver launches.
 *
 * **It has to come from `pnpm tauri build --no-bundle`, not from `cargo build --release`.** Tauri's
 * build script sets `dev = !has_feature("custom-protocol")`, and only the Tauri CLI passes that
 * feature — so a plain cargo release build is a *dev* binary that loads `devUrl` and comes up on a
 * connection error with no server there. Nothing about the file says which one it is, which is why
 * this says so here.
 */
export function atlasBinary() {
  const path = join(repositoryRoot, "src-tauri", "target", "release", "backlog-atlas");
  if (!existsSync(path)) {
    throw new Error(
      `${path} does not exist. Build it first: pnpm tauri build --no-bundle`,
    );
  }
  return path;
}

/**
 * Whether a WebDriver remote end at `base` is ready to take a session.
 *
 * **`fetch` resolving is not the answer.** It resolves for 4xx and 5xx too, and `tauri-driver` binds
 * its own port before the native driver behind it is necessarily up — so a status that answers `500`
 * would otherwise be read as readiness and the failure would surface later, as a session that could
 * not be created. W3C `/status` states it directly in `value.ready`.
 */
async function driverReady(base) {
  const response = await fetch(`${base}/status`);
  if (!response.ok) {
    return false;
  }
  const payload = await response.json();
  return payload?.value?.ready === true;
}

/**
 * Start `tauri-driver` and wait until it is ready to take a session. It is `cargo install`ed rather
 * than depended on: it is a standalone binary with no Rust API, so a `Cargo.toml` entry would express
 * nothing.
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
        `tauri-driver stopped before it was ready (${exited}). On macOS it always does — it supports Linux and Windows only, and this suite runs on Linux.`,
      );
    }
    try {
      if (await driverReady(base)) {
        return { base, stop: () => child.kill() };
      }
    } catch {
      // Not listening yet. Any other reason to keep waiting is `driverReady` returning false.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error(`tauri-driver was not ready on ${base} within 30s`);
}

export function removeFixture(fixture) {
  rmSync(fixture.projectRoot, { recursive: true, force: true });
}
