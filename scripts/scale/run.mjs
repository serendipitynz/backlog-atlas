// 規模計測 (TASK-94, decision-42) — 規模ごとの読取時間・再読込時間・snapshot の直列化サイズ・
// フロントエンド再計算時間・監視 1 ルートあたりの thread 増分を出す 1 本の実行経路.
//
// **It has no verdict.** Nothing here asserts, nothing fails on a slow machine, and a session's
// checks stay `pnpm test`・`pnpm run check`・`pnpm run lint`. What this produces is numbers for a
// judgment about 部分再読込 and 監視イベント集約 — decision-42 records the one made from them, and
// the conditions under which it is measured again.
//
// Run it with `pnpm run scale`. Two halves, in this order:
//
// 1. **The read side**, in Rust: `src-tauri/src/scale.rs`'s `#[ignore]`d tests, **in release**.
//    A debug build reads 2–3× slower, and a number taken there would describe a binary nobody ships.
// 2. **The recompute side**, in Node: `frontend.mjs`, over the real `buildSwimlane` and
//    `collectFacets`. **Node/V8, not the WebView** — the engine the app actually draws in is not
//    measured here.
//
// `ATLAS_SCALE_ROOT` points the read side at a real Backlog root beside the synthetic ones; this
// repository's own `backlog/` is the default, which is what keeps the synthetic numbers anchored.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { measureFrontend } from "./frontend.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** `--test-threads=1` because the read side times filesystem work: parallel tests would time each other. */
const CARGO_ARGS = [
  "test",
  "--release",
  "--lib",
  "scale",
  "--",
  "--ignored",
  "--nocapture",
  "--test-threads=1",
];

function runCargo() {
  return new Promise((done, fail) => {
    const child = spawn("cargo", CARGO_ARGS, {
      cwd: resolve(REPO_ROOT, "src-tauri"),
      stdio: "inherit",
      env: {
        ...process.env,
        ATLAS_SCALE_ROOT: process.env.ATLAS_SCALE_ROOT ?? resolve(REPO_ROOT, "backlog"),
      },
    });
    child.on("error", fail);
    child.on("exit", (code) => {
      if (code === 0) {
        done();
      } else {
        fail(new Error(`cargo test exited with ${code}`));
      }
    });
  });
}

console.log("規模計測 — 合否は持たない。数値だけを出す。");
console.log(`機械: ${process.platform}/${process.arch}, node ${process.version}\n`);
await runCargo();
console.log("");
await measureFrontend();
console.log("\n測っていないもの: 窓の生成・IPC 転送・最初の描画・WebView 上の再計算・Windows の thread 数。");
