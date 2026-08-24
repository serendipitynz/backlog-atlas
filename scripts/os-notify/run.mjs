// 実 OS 通知の配送検査 (TASK-108, decision-43) — the one entry point, called by CI's three places
// and by hand on a machine whose delivery has not been recorded yet.
//
// The work is one `cargo test` of one `#[ignore]`d test, plus the check that it actually ran:
// **a libtest filter matching nothing exits 0** (measured on cargo 1.96.0 — "0 passed" is a green
// run), so a renamed test would leave this reporting success for a check that never happened.
// Cargo has no `--no-tests=fail`, so the summary line is what says a test ran.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const TEST = "sync::tests::the_watch_session_delivers_a_batch_for_an_external_change";

/** `--exact` so the filter names one test rather than a prefix that could pick up a second. */
const CARGO_ARGS = ["test", "--lib", "--", "--ignored", "--exact", TEST];

function runCargo() {
  return new Promise((done, fail) => {
    const child = spawn("cargo", CARGO_ARGS, {
      cwd: resolve(REPO_ROOT, "src-tauri"),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        output += chunk;
        process.stdout.write(chunk);
      });
    }
    child.on("error", fail);
    child.on("exit", (code) => {
      done({ code, output });
    });
  });
}

console.log("実 OS 通知の配送検査 — 届かなかったことは緑にしない。");
console.log(`機械: ${process.platform}/${process.arch}, node ${process.version}\n`);

const { code, output } = await runCargo();
console.log("");

// A non-zero exit is two different outcomes, and saying only "it failed" would report a build error
// as a platform that does not deliver. The summary line is what separates them.
if (code !== 0) {
  if (/test result: FAILED/.test(output)) {
    console.error(
      `届かなかった。この環境の OS 通知が束の受け口まで配送されていないか、束が Rescan へ倒れている — ` +
        "どちらもこの環境の性質であって、コードの欠陥とは限らない。",
    );
  } else {
    console.error(
      `検査が走る前に終わった (cargo test exited with ${code})。上の出力を読む — ` +
        "配送については何も述べていない。",
    );
  }
  process.exit(1);
}

const ran = /test result: ok\. 1 passed; 0 failed;/.test(output);
if (!ran) {
  console.error(
    `検査が 1 本も走っていない。${TEST} が動いたか消えた可能性がある — ` +
      "フィルタが何にも当たらない実行は cargo が 0 で終えるので、緑を配送の証拠として読めない。",
  );
  process.exit(1);
}

console.log(`届いた: ${process.platform}/${process.arch} で配送検査が 1 本通った。`);
