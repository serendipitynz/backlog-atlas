# AGENTS.md

Execution rules for agents (e.g. Codex) working in this repository. `AGENTS.ja.md`
is the Japanese counterpart of the same rules. If the two ever disagree, do not
start implementing — resolve the contradiction first.

## Project model

- Atlas handles multiple registered project roots and Backlog roots. Do not
  aggregate every project's tasks into one central Backlog.
- The source of truth for each project's tasks stays in that project's Backlog
  root.

## Updates

- Delegate updates to Backlog tasks, documents, and milestones to Backlog CLI
  calls that run with the target project as their working directory. Do not edit
  the managed Markdown files directly. This rule binds you as an agent without
  exception; the product has one, immediately below.
- **A decision is outside that list, because no CLI call can write one.**
  `backlog decision` has no `update`/`edit`, and `create`'s options are `<title>`,
  `-s/--status` and `--plain` — none of which carries a body, so a decision's body is
  unwritable through the CLI at creation as well as afterwards (measured on v1.50.1;
  `doc`, by contrast, has `update --content`). **`list` and `--plain` arrived in
  v1.50.x and changed nothing here** — both are read/output, which is why this bullet
  names what no option carries rather than counting the options. Every body in `backlog/decisions/` was therefore written by
  editing the file, and that is how to write one. The three named kinds — tasks,
  documents, milestones — keep the rule above without exception. **The owner
  confirmed this reading on 2026-08-13** (TASK-162); it is recorded because the
  enumeration's silence is not what establishes it, and a later session that
  re-derives permission from an omission would be making the move the last bullet
  here forbids.
- **The product's one exception — a milestone's description** (decision-21).
  v1.50.1's `milestone` has no `update`/`edit`, so a description can only be set
  at creation, and re-creating the milestone changes its id. Atlas therefore
  writes that one range itself: the bytes from the line after the
  `## Description` heading to the line before the next `##` heading (or the end
  of the file), and nothing else — the frontmatter and the file name are left as
  they were. The write is a 一時ファイル置換 (decision-17) and passes doc-9 §4's
  pre-update version check, like every other update. An operation qualifies only
  when all three hold: the CLI already writes that value somewhere, so no new
  file format is invented; it touches neither frontmatter nor the file name; and
  the range written is the range the read layer reads. "The CLI has no
  sub-command for it" is not on its own a reason to write a managed file.
- Run Backlog CLI and Git with fixed subcommands and argument arrays. Never
  concatenate user input into a shell string and execute it.

## Identifiers

- On the cross-project screen, use `<project-slug>:<TASK-ID>`. Within a project's
  commits and Pull Requests, use `TASK-N`.

## Confirmed CLI version

Where to write the Backlog CLI version Atlas is confirmed against (decision-27).
The value itself is decision-7's; these five rules are about its expression.

- **A version used as a value comes from `update.rs`'s `MIN_VERSION`.** Rust tests
  derive it from that constant; the frontend's tests and fakes read
  `src/lib/confirmed-version.ts`, which takes it from the recorded
  `cli_readiness.json`. Never spell the version in a frontend source.
- **Screen text does not name a version.** The single exception is the sentence
  whose subject *is* the difference between the user's CLI and the confirmed one
  (the unsupported CLI 縮退 band), and it reads `CliReadiness`'s own fields. Write
  "CLI に手段が無い" and leave which version was measured to the doc (doc-11 §8).
- **A note recording which version a fact was measured on keeps the version
  spelled out.** Do not point it at a constant, and do not fold a file's notes into
  one per-file declaration: rewriting each note is what forces the re-measurement,
  and a constant would generate claims about a version nobody measured.
- **A doc carrying 実測 statements declares its 実測基準版 once**, right after its
  前提 paragraph, and its body sentences then name no version. Statements about the
  difference between two versions keep both — the declaration does not cover them.
- **The READMEs name no version.** They say a Backlog CLI is required, that the latest
  release is fine and no upper bound is fixed, and that Atlas checks at startup and names
  the version it needs when the reader's is short of it — which is §2's one allowed screen
  sentence doing the work. A literal there would need editing on every bump while buying
  the reader nothing: the install command they are given fetches the latest. **decision-27 §7
  is the source and this bullet is a copy.** It binds the Backlog CLI's version alone — the
  Atlas release named in the READMEs' own Updating (更新) section is a different value, and §7
  does not reach it.

## Where a claim's origin is written

**Decisions, design documents, both AGENTS files and both READMEs name no path under `_sandbox/`**
(decision-36). README sends a reader to `backlog/decisions/` and `backlog/docs/` and to nothing
else, and `_sandbox/` is git-ignored — so a path into it is a claim no check in this tree can keep
true. Write **what was done** instead: "measured with the real `App.svelte` on a playwright harness", "fixed in TASK-82's
referent table 初版", "指摘 2 of the 2026-08-01 implementation report". **The date, the thing
measured and the value stay** — only the whereabouts go, and the version literals decision-27 §4
keeps are untouched.

**Naming `_sandbox/` itself is not a path.** decision-32 says which trees Biome swept, and
`.gitignore` and `biome.jsonc` name the directory too; nothing after the slash means nothing to
follow.

**`backlog/tasks/` and code comments are deliberately out of scope**, and decision-36 §4 carries the
reason. **Do not raise their `_sandbox/` paths as a defect** — 137 of the 153 sit in Done tasks,
where rewriting would edit the record of a finished session. Write new ones in the same form anyway.

**`src/lib/sandbox-reference.test.ts` holds this**, over all six files. It also rejects a referent
table named by file rather than by the task that produced it — the one form the rot took without the
prefix. **Neither pattern spells the name characters as an ASCII set**: every managed file here is
named in Japanese, so an ASCII set would pass exactly the citations this repo is most likely to
write. A bare filename of some other family still slips both patterns, which is why the rule above
is stated as what to write, not only as what to avoid. **A decision quoting a violation verbatim
fails the scan too**, so describe the broken form rather than spelling it.

## Git and Pull Request references

- Search Git history for a task ID in the repository of the project that owns the
  task.
- Read Pull Request URLs from a task's References. Where the remote supports it,
  resolve the relationship between commits and Pull Requests.

## Dependencies

- Before adding any new production dependency — Tauri/Wails, a UI library, a
  Markdown/frontmatter parser, bundling the Backlog CLI, and so on — confirm the
  selection rationale and the scope of its introduction.

## Task state

A task's `status` says where its work stands, so move it as the work moves rather
than in one step at the end. The four states this project uses:

- **To Do** — not started.
- **In Progress** — set as soon as work on the task begins; an instruction to start
  it is enough. This one need not be committed: its purpose is that the ledger shows
  what is being worked on right now.
- **In Review** — set when the Pull Request is created, and included in the PR-ready
  commit, so the PR carries the state the task is in.
- **Done** — set after the PR is merged, on the default branch.

Move the state through Backlog CLI calls, like every other task update.

## Toolchain

- Node 24 and pnpm 10.30.3. `.node-version` pins the Node major; `packageManager` in
  `package.json` pins pnpm. There is deliberately no `.nvmrc` and no `engines.node` —
  one pin per tool, so there is nowhere for two pins to drift apart.
- pnpm is the only package manager here. Install with `pnpm install`, and run every
  script through it: `pnpm test`, `pnpm run check`, `pnpm run lint`, `pnpm run build`,
  `pnpm tauri dev`, `pnpm tauri build`. Do not run npm or yarn in this repository — either
  would write a second lockfile beside `pnpm-lock.yaml`.
- The Rust side keeps its own commands, run from `src-tauri/`: `cargo test`,
  `cargo fmt`, `cargo clippy`.
- **Building on Linux needs Ubuntu 24.04 or newer.** The WebView is a system library
  there, not a cargo dependency, and which one follows from the lockfile: the
  `webkit2gtk` crate binds webkit2gtk-4.1 and `soup3` binds libsoup-3.0. 24.04 carries
  both; 20.04 and 22.04 do not, and a build on them stops early in `pkg-config` saying
  `glib-2.0` was not found — an error that names neither WebKit nor the Ubuntu version,
  so it invites installing packages one at a time instead of changing the distribution.
  The development packages to install are listed in README's "Building from source" and
  repeated in `.github/workflows/release.yml` and in `ci.yml`'s `e2e` job, both of whose
  Linux runners have to install them before any step could read prose. **The list therefore
  has three places, not one** (TASK-101 added the second, TASK-105 the third) — change them
  together, and send a reader to the README. Each runner already carries the generic half of
  the list; it is installed again anyway, so the three stay comparable line by line instead of
  drifting into a subset nobody re-derives. **`e2e` adds two of its own** —
  `webkit2gtk-driver` and `xvfb` — which the other two do not need and must not gain.
- `pnpm install` reports `@parcel/watcher` and `esbuild` as ignored build scripts.
  Leave them unapproved: sass needs `@parcel/watcher` only for its own watch mode,
  esbuild resolves its platform binary through an optional dependency instead, and the
  build, the tests, and `svelte-check` all pass without either script.
- **Every file in `src-tauri/icons/` is generated from `src-tauri/app-icon.png`.** Do not
  edit one by hand; change the source and re-run
  `pnpm tauri icon src-tauri/app-icon.png`, then delete `src-tauri/icons/android/` and
  `src-tauri/icons/ios/`, which it also writes — this app has no mobile target, and
  nothing in the build reads them. Name the input path: it is the one path the command
  resolves against the working directory rather than against `tauri.conf.json` (the
  output goes to `icons/` beside the config either way), so a bare `pnpm tauri icon`
  from the repository root fails. Sixteen of the seventeen outputs are byte-reproducible;
  `icon.icns` is not, because its elements are written in a different order each run
  (same element set, same payloads, constant total size). Treat an `icon.icns`-only diff
  after a re-run as no change.
- **`"dragDropEnabled": false` in `tauri.conf.json`'s window is load-bearing, not a leftover**
  (decision-34). Tauri defaults it to `true`, which registers a drag-drop handler whose closure
  returns `true` — wry's own documentation for that return value says it blocks the OS default,
  and `tauri-utils` says in so many words that disabling is required for HTML5 drag and drop on
  Windows. Restoring the default would make the swimlane's 列間ドロップ (doc-7 §4.2) fail silently
  on Windows while still working on the machine that changed it. **Atlas consumes no OS drag-drop
  event anywhere**, so nothing else reads this — that is why turning it off cost nothing, and it
  is also why a reader finding no consumer must not conclude the line is unused.
- **What clearing that flag opened, the 窓の航行ゲート closes** (decision-37, `src-tauri/src/navigation.rs`).
  With no drag-drop handler registered, each engine's own default drop handling runs, and all three
  treat a dropped URL or file as something to load — measured on macOS on 2026-08-18, where three of
  six operations navigated the window away from Atlas. The gate is a plugin whose `on_navigation`
  admits only Atlas's own origin. **It has no commands and shows nothing on screen**, so a reader
  finding no caller must not conclude it is unused; the app's window is what reads it. **Do not
  answer a future route by re-registering the drag-drop handler** — that would take 列間ドロップ back
  out on Windows to close something the gate already closes on all three.
- **アプリ設定ファイル holds 列折畳み・行折畳み・行非表示, and decision-13's 「アプリ設定を持たない値」 no
  longer says otherwise** (decision-13 の 再起動をまたぐ保持の改訂, 2026-08-18). The 1 sentence that had
  excluded the three named 行非表示's 「件数も読めない」 property, which the folds do not have, and for
  行非表示 itself the screen that sentence assumed changed in 2026-08-09 (doc-7 §2.1). **On Linux, a
  restored 行非表示 is stated on screen by nothing until the menu is opened** — 総件数 does not reach that
  platform (decision-31 の Linux の改訂) — and that was accepted rather than overlooked. **Do not answer it
  by putting the 行非表示 band back**: doc-11 §4's ⑥ was removed for a reason that still holds.
- **Adding an アプリ設定 item means three edits, and two of them are silent when missed.** Raise
  `KNOWN_SCHEMA_VERSION` (`src-tauri/src/settings.rs`), and pass the field through **both**
  `mergeDraft` and `normalize` in `src/lib/settings.ts`: the 設定画面's save writes the file whole, so a
  field missing from `mergeDraft` is deleted from disk, and `isDirty` reads `normalize`, so a field
  missing there makes a change to it look like nothing to save. **Neither shows up in `pnpm run check`** —
  the types are satisfied by the shorter list either way.
- **窓の引継ぎ状態 lives in a third file, not in the アプリ設定ファイル** (decision-38,
  `src-tauri/src/window_state.rs`). `tauri-plugin-window-state` carries the window's size and whether
  it was maximized in `app_config_dir()/.window-state.json`, beside `projects.toml` and
  `settings.toml`. **Do not move it into the アプリ設定ファイル**: that file degrades to read-only on an
  unknown higher `schema_version` and then refuses every save, so the window size would stop
  persisting for exactly the reason decision-13 refused to put settings in the ledger file. The other
  four flags the plugin offers are deliberately unused — widening the set is a decision-38 §3 revision.
- **Three things about it will look like defects and are not.** `.window-state.json` does not appear in
  the 設定モーダル's ファイルの場所 区画, because that 区画 names what a user hand-edits (doc-3 §2.1). It
  does not go through 一時ファイル置換 either — the plugin writes it with `std::fs::write`, and a torn
  write costs one remembered size rather than the readability of anything (decision-38 §5). And its
  `schema_version` is absent because the plugin's format is the plugin's.
- **最小寸法の下限適用 watches `WindowEvent::Resized`, and a one-shot read in its place does nothing.**
  Neither the plugin nor macOS compares a restored size with `minWidth`/`minHeight` — measured on
  2026-08-18, a record of 400×300 brought the window up at 400×300 — so Atlas raises it. **The read has
  to be taken on the resize**: when Atlas's hook runs after the plugin's, `inner_size()` still reports
  the pre-restore size, because `set_size` is not reflected until the OS has resized and emitted the
  event. **The one-shot read beside the listener is not redundant** — Windows sends `WM_SIZE`
  synchronously, so there the event can arrive before this listener exists.

## Coding style

These rules bind code being written or changed. **Do not delete, rewrite, or reshape pre-existing
comments or untouched code just to satisfy them** — raise it instead. Why the rules are these, and
why the tooling below stops where it does, is decision-32.

### Comments

- Don't write comments by default. Prefer clear naming and structure.
- When a comment is warranted, prefer ones that explain **why** and, when relevant, **why not** —
  the reasoning behind the chosen approach, including why obvious alternatives were rejected.
- Use comments only for information that cannot be expressed clearly by the code itself, such as
  intent, constraints, invariants, external requirements, or non-obvious trade-offs.
- Never use comments merely to restate what the code does.
- API documentation comments follow the same principle: don't document what is already clear from
  names, types, and signatures. Document only caller-relevant contracts that cannot be expressed
  clearly in code, such as behavioral guarantees, preconditions, side effects, error semantics, or
  compatibility constraints.

**What a comment may hold, and what falls, is decision-41** — the answer to this section's
"raise it instead", for comments. Two of its rules fire while you write and need no reading.

- **Ask whether the sentence would still be true if this code took another shape.** If it would, it
  states a contract, and the document that decides it is where the contract belongs. A summary in
  code is coarser than its source, and **nothing notices when the two diverge** — the reason the
  sweep happened at all. **`why` does not separate the two**: a re-description of a decision is
  written as a why as well.
- **A bare `doc-N §X` or `decision-N` in code is attribution and stays**, one per claim.
  **doc-11 §8's "not one design-document reference" is the screen's rule and does not reach here** —
  its ground is that the user cannot open the document, and a reader of this tree can.

**TASK-107 swept every file header, and the body comments of eight lines or more that name a doc or
a decision. Everything else is unjudged, not approved** — a shorter comment that re-describes a
contract is still one, and finishing the sweep is its own task. **`src/lib/comment-citation.test.ts`
holds one thing only**: that the sections, decisions, identifiers and paths a comment names exist.
Whether a comment re-describes a contract has no machine check and is held by review.

### Control flow

- Always use explicit block syntax for control-flow bodies where the language allows omission.
- **The form is three lines** — the opening brace ends the condition's line, the body sits one
  step in on the next, and the closing brace returns to the condition's column. `else` cuddles:
  `} else {`. This is not a preference to re-decide per file; it is what all 384 pre-existing
  blocks do, and TASK-177 brought the remaining 371 sites to it.

### Functions

- Extract a function when a block represents a coherent, nameable responsibility.
- Extraction should improve abstraction, readability, or testability — not merely reduce line count.
- Call count is not a criterion in either direction: two call sites do not by themselves justify
  extraction, and a single call site does not by itself rule it out.
- Keep tightly coupled, trivial operations local when extraction would reduce locality or introduce
  unnecessary indirection.

### What the linter holds, and what it does not

`pnpm run lint` runs Biome over `src/`, `scripts/`, and the three root configs — `vite.config.ts`,
`vitest.config.ts`, `svelte.config.js` — with exactly one rule enabled,
`style/useBlockStatements` — the Control flow rule above. **That set is every hand-written source
in the tree**, and it is named in `biome.jsonc`'s `files.includes`; the root configs are listed
one by one there so a future tool's config is not swept in unread. Change the two together. **Comments, Functions and API
documentation comments have no machine check and are held by review.** That is the whole reason
this section exists rather than only the config.

Two gaps to keep in mind.

- **Biome does not read Svelte markup**, so control flow inside an inline handler in a `.svelte`
  template is invisible to it — TASK-177 found one such site that the lint pass had missed. **A
  clean `pnpm run lint` is not proof of compliance.**
- **`biome lint --write --unsafe` writes `if (c) { body }` on one line**, which is not the form
  above. There is deliberately no fix script; write the three-line form by hand.

Do not enable Biome's formatter, and do not add a rule preset. `biome.jsonc` records beside each
the measurement that rules it out — the formatter flattens a `.svelte` `<script>` block to column
zero, and the `recommended` preset reports Svelte-only bindings as unused and offers to delete
them.

## Tests

`pnpm test` runs two Vitest projects.

- **`unit`** — `src/**/*.test.ts` in the `node` environment. The rules, held as pure
  functions, plus the recorded wire payloads. No DOM.
- **`component`** — `src/**/*.component.test.ts` in `jsdom`, mounting components through
  Svelte's own `mount`. `src/lib/render.ts` is the whole harness; no testing library is
  installed, because the queries these tests need are the components' own selectors and
  the events include an IME composition (`isComposing`, `keyCode === 229`) that a
  synthetic `type()` cannot produce.

Keep the split. A DOM given to the `unit` project would change the environment those
tests have been passing in, and only the second project needs the Svelte compiler.

**Component tests hold画面横断契約 only** — the contracts no pure function can hold and
no single screen owns: a modal's exits, 破棄前確認 on leaving a detail panel, what a
reload may not discard, the startup call order. Screen-by-screen coverage is not the
goal and a full GUI E2E is a separate thing again (`pnpm run e2e`, below); a component test per
screen would make every UI change a test change and buy no contract.

**`jsdom` runs no layout.** `getClientRects` returns nothing for everything, which would
silently empty `Modal.svelte`'s focus cycle, so `render.ts` reports a box for elements
that are rendered — by the rule the app's call depends on (`hidden`, inline
`display: none`, a closed `details`), never by measuring. No test may assert on the
numbers it returns.

**A dynamic `import()` reached from inside a test body is paid inside that test's
timeout.** `drawFigures` loads mermaid that way (decision-25 の 遅延読込) and nothing caches
the transform between runs, so `markdown-figure.component.test.ts` spent its budget
fetching a package rather than drawing one: 569ms on an idle machine against 19,946ms with
twelve spinning processes on eight cores, measured on 2026-08-18 (TASK-150). **Name the
module among the test file's own imports instead** — a file's imports are on no budget at
all, and the dynamic import then resolves from the module cache, so the load stops being a
term in what the test is timed against. **Do not answer this with a larger `testTimeout`.**
Neither project sets one, deliberately: a raised budget hides the next occurrence rather
than removing it, and a budget wide enough to absorb a slow load is wide enough to leave a
hang unreported for as long.

**Wire payloads are recorded, with the Rust side as their source.** `src/lib/wire.ts`
mirrors this crate's serde output by hand and neither compiler checks the other.
`src-tauri/src/wire_fixtures.rs` serializes one sample per payload and compares it with
`src-tauri/wire-fixtures/*.json`; `src/lib/wire-fixture.test.ts` checks each recording
against `wire.ts` three ways — its keys against `keyof`, its **value types** against an
exemplar annotated with the same type, and its **serde enum tokens and variant tags**
against `unionValues`-locked member lists — and then runs the frontend's functions over
the payload. All three are needed: `keyof` fixes the field names, a field that changed
from a number to a string keeps its name, and a renamed variant token keeps both its name
and its type.

A payload sample only exercises the variants it happens to carry, so `wire_tokens.json`
records the **complete** token set for every union — otherwise a member no sample uses is
anchored to `wire.ts` alone and a Rust-side rename of it passes everything. Each list in
`wire_fixtures.rs` is kept complete by an exhaustive `match` beside it: adding a variant
stops that match compiling, which is the prompt to add the sample. Nothing there spells a
token — serde produces them all. Neither is a cast (a cast accepts any JSON) and
neither is a spec written in the test (tsc decides both from `wire.ts`), so the Rust
output, `wire.ts`, and the test cannot be brought into agreement two at a time. Populate
every field of an exemplar rather than leaving it `null`: a `null` agrees with anything.
Re-record with
`ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` and **commit the result** — the frontend test
reads the committed file. The samples are built as struct literals with fabricated
absolute paths, not from a temp-dir read: a literal makes the compiler name a new field,
and a recorded fixture has to be byte-identical on every machine.

**The call itself is held by a scan, not a recording** (`src/lib/invoke-signature.test.ts`,
TASK-93). The fixtures above tie the payloads and leave the call untied: a command name is spelled
three times (the `#[tauri::command]` function, the `generate_handler!` entry, the `invoke("…")`
literal), an argument name twice, a return type twice, and an event name twice — and both sides
build, both test suites pass, and the call fails in a Tauri window, which is the one place none of
the three layers reaches. **Nothing is recorded here, because none of those four needs to be:** each
is a literal in the source on both sides, so a fixture would add a third place to drift.
**Changing a command therefore means changing both sides and re-running `pnpm test` — there is
nothing to re-record.**

Four things about it are deliberate. **A Rust type the small primitive table cannot map is a failure,
not a skip** — the table holds `String`/`PathBuf`/`bool`/`()`/`tauri::ipc::Response`, `Result`,
`Option` and `Vec`, and every other type is compared by name, which is why the table does not need
`wire.ts`'s names in it. **A parameter Tauri injects is recognised by its type**, not by the
spellings `app` and `state`, so renaming a handle costs nothing; the pattern list lives in the test
(`INJECTED`) rather than here, and an injected type it does not carry reddens the test rather than
silently dropping a required key. **The Rust parameter name is converted rather than compared** — the
macro defaults to `rename_all = "camelCase"`, and only that direction is implemented, so writing the
attribute reddens the scan and is *meant* to: changing the frontend does not clear it, because the
scan still camelCases. Supporting the attribute means teaching the scan about it. And **the set of
commands the frontend never calls is locked at three** (`cross_task_id_generate`,
`cross_task_id_parse`, `project_close`) instead of excused one by one with a reason: the reasons are
a reading, and locking the set is what makes a fourth one somebody's decision.

### The GUI E2E, which `pnpm test` does not run

**A third layer sits outside `pnpm test`** — `pnpm run e2e`, in `scripts/e2e/` (decision-40). It
drives the shipped binary through `tauri-driver` along one route — 登録 → スイムレーン表示 → タスク
詳細 → 編集保存 → アプリの再起動 — with the real WebView, the real Rust commands, the real Backlog
CLI and the real アプリ設定ディレクトリ all in it. It is the only thing here that states the whole
stack works at once: the two projects above stop at Svelte's `mount`, and `cargo test` stops below
the IPC boundary.

**The last step is a restart, not doc-9's 再読み込み.** What it claims is that the ledger entry and
the edit survive the process, and re-reading inside a running app never claims that.

**It runs on Linux and nowhere else, which is not what `tauri-driver`'s README says.** That README
lists Linux and Windows, but only the Linux half reaches a Tauri app: Tauri asks wry to allow
automation (`TAURI_WEBVIEW_AUTOMATION`), and wry implements that for webkitgtk alone — every other
platform gets an empty default. So on Windows the WebView2 never opens a debugging port and session
creation fails outright, and on macOS `tauri-driver` refuses to start at all. Both measured
2026-08-22; decision-40 §実測 carries them. **CI runs it on ubuntu-24.04 under `xvfb-run`.**

**So a session's checks are still `pnpm test`, `pnpm run check` and `pnpm run lint` — three, not
four.** Putting the E2E in that list would write a rule this machine cannot keep.

**Running it needs four things standing**: a Linux machine (the owner's WSL Ubuntu 24 qualifies),
`tauri-driver` on PATH (`cargo install tauri-driver --locked`), a Backlog CLI on PATH, and the
binary from **`pnpm tauri build --no-bundle`**.

**That command, and not `cargo build --release`.** Tauri's build script sets
`dev = !has_feature("custom-protocol")`, and only the Tauri CLI passes that feature — measured, it
runs `cargo build --bins --features tauri/custom-protocol --release`. So a plain cargo release build
is a *dev* binary: it loads `devUrl` and comes up on `Could not connect to localhost` with no server
there, and nothing about the file says which of the two it is. `--no-bundle` stops after the binary
and `beforeBuildCommand` builds the frontend, so it replaces both steps. It is also what makes the
CSP apply, which is the form decision-28 says is the only one where the CSP is in force at all. **On macOS everything up to starting the driver still runs** — the fixture, the aside
and the restore — which is deliberate, and it is how those are exercised from a development machine.

**It moves `projects.toml`, `settings.toml` and `.window-state.json` aside for the run and puts
them back.** On Windows the directory cannot be redirected instead — `dirs::config_dir()` asks
`SHGetKnownFolderPath` and never reads `APPDATA` — so this is the only isolation there is.
**A backup left by a run that died is refused rather than overwritten**, because otherwise the
second run's empty ledger becomes the backup and the real one is gone.

**The route's selectors are constants at the top of `scripts/e2e/run.mjs`**, and they were measured
against the real `App.svelte` rather than read off it. A refactor that moves them is meant to redden
this job. **Do not widen a selector to make it green** — a route that matches anything states
nothing.

### 規模計測, which reports numbers and no verdict

**A run path outside `pnpm test` again, and the only one here that cannot fail** — `pnpm run scale`,
in `scripts/scale/` (decision-42). 規模計測 reads synthetic Backlog roots at chosen sizes and prints
読取時間・再読込時間・snapshot の直列化サイズ・フロントエンド再計算時間・監視 1 ルートあたりの
thread 増分. Nothing asserts, and nothing goes red on a slow machine.

**A session's checks are therefore still `pnpm test`, `pnpm run check` and `pnpm run lint`.** 規模計測
is not a fourth, for the reason the GUI E2E above is not.

**Two halves, in one command.** `src-tauri/src/scale.rs` is the read side: `#[cfg(test)]`, its tests
`#[ignore]`d, run **in release** — a debug build reads 2–3× slower, so a number taken there describes
a binary nobody ships. `scripts/scale/frontend.mjs` is the recompute side, timing the real
`buildSwimlane` and `collectFacets` loaded through Vite's `ssrLoadModule`; **Node/V8, not the
WebView**, which is a gap the numbers are labelled with rather than one they close.

**What keeps each half from rotting is different, and one of them is nothing.** The Rust half is
compiled by every `cargo test`, so a signature change in the read layer reddens the build before it
can silently stop measuring the product. The frontend half is read by no check at all —
`tsconfig.json` does not include `scripts/`, so `pnpm run check` does not see it either.
**Run `pnpm run scale` in the session that touches it.**

**`ATLAS_SCALE_ROOT` points the read side at a real root** beside the synthetic ones, defaulting to
this repository's own `backlog/`. That anchor is the point of it: a shape nobody writes by hand can
be fast for reasons no real root shares.

**The measured values are in decision-42, and are not restated here**, along with the three numbers
that reopen the judgment it records. A copy of a measurement goes stale the moment the machine
changes, and nothing in this file would notice.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on `main` after one lands
(decision-33). It is a different thing from `release.yml`, which builds bundles for a `v*` tag
and checks no code.

- **`frontend`** on ubuntu — `pnpm run lint`, `pnpm run check`, `pnpm test`, `pnpm run build`,
  each its own step so a failure names itself.
- **`rust`** on macOS and Windows — `cargo fmt --check`, `cargo clippy --all-targets -- -D
  warnings`, `cargo test`. **Deliberately not Linux**: the two runners between them compile
  every OS-conditional predicate in `src-tauri/src` but one, and a Linux runner would need the
  WebView `apt-get` list written in a third place. The workflow's own trailing comment carries
  the full reasoning; do not add a Linux job without reading it.
- **`e2e`** on ubuntu-24.04 under `xvfb-run` — the GUI E2E above, against a release build
  (decision-40). **The one Linux job here, and the exception `rust`'s reasoning is measured
  against**: it writes the WebView apt list a third time because it cannot run anywhere else at
  all, where a Linux `rust` job would buy the compilation of one `return` for a fourth copy. Pinned
  to `ubuntu-24.04` for `release.yml`'s reason, not following `ubuntu-latest`.

**Three checks are required before a pull request can merge** — `frontend`,
`rust (macos-latest)` and `rust (windows-latest)` — through the repository ruleset named `main`.
**A job's `name` is that string.** Rename a job and the ruleset waits forever on the old name;
change the two together.

**`e2e (ubuntu-24.04)` is deliberately not one of the three** (decision-40 §5). A WebKitGTK or
driver update that reddens it must not block a pull request that did not cause it. The cost is
that a check nothing enforces is a check someone has to read; making it required later means adding
that exact string to the ruleset.

**Repository admins can bypass those checks**, on purpose. It is what keeps `main` writable for
the `Done` commits Task state describes, and it is what makes a broken workflow fixable — without
it, the change that repairs a check would be blocked by that check. **A pull request is not
itself required**, only the checks when one exists.

**A local `cargo clippy` can pass while CI's fails, and the difference is the toolchain.**
`dtolnay/rust-toolchain@stable` resolves to whatever stable is on the day the job runs, and a
clippy release extends its lints — so a machine a version or two behind sees fewer of them.
TASK-178 hit exactly this: 1.96.0 locally against 1.97.1 on the runner, one `question_mark`
finding, on both runners, in code nobody had touched. Rust is deliberately unpinned here (the
release workflow tracks stable too, and there is no `rust-toolchain.toml`), so the fix is to
match the runner rather than to pin it: `rustc --version` against the version the job prints,
and `rustup toolchain install <it>` then `cargo +<it> clippy` when they differ. Updating your
default works too; the `+` form is what checks CI's answer without moving your default.

## Release

**A release session reads `backlog/docs/doc-13` first.** That doc is this layer's source —
what to re-read before tagging, how the workflow produces the draft, the third-party notice,
the bundle metadata, macOS signing and notarization — and this file restates none of it. A
summary here would be read in place of the doc, and the doc is where the measured values are.

Four lines stay below, and each passes the same test: the rule fires on something other than a
release, so a session that never opens doc-13 would break it, and there is nowhere at the site
to state it — a JSON config takes no comment, and a section a README does not have says
nothing. Removing one removes the path to doc-13 along with it. None of them tells you what
doc-13 says, and doc-13's opening paragraph names the same four.

- **The README carries no implementation-status section, and none is to be added back**
  (TASK-90). doc-13 §2.
- **`bundle.copyright` and LICENSE carry the same wording, and the two files are unrelated to
  each other** — change them together. doc-13 §5.
- **The generic icon in the About panel of an unbundled `pnpm tauri dev` run is not a defect.**
  doc-13 §5.
- **The macOS signing identity does not name the copyright holder, and that is deliberate.**
  doc-13 §6.

## Working conventions

- Code comments in English; user-facing explanations in Japanese by default.
- **In Japanese Markdown, leave a half-width space after a closing `**` when text follows
  it.** A closing delimiter has to be right-flanking, and one preceded by `。` with a
  non-space after it is not — so `**…です。**Atlas` renders its asterisks literally rather
  than as bold. Every Japanese sentence that ends inside the emphasis hits this, which is
  most of them. It applies wherever the Markdown is rendered: the READMEs, and task and
  document bodies, which Atlas draws with `markdown-it` (decision-25).
  **`src/lib/emphasis-closing.test.ts` holds the part of this that renders wrong** — over
  `backlog/` and the four prose files — and it holds two things rather than one: no asterisks
  markdown-it gave up on, and **every bold run bolding the span the author delimited.** The
  second is not the first said differently — where a closer fails, the next opener can absorb
  it and the emphasis nests silently, leaving no asterisk for a count to find. TASK-161
  rewrote 426 delimiters across 44 files and found one of those.
  **The rule's letter is wider than what that check holds, and the difference is 3,454 sites**
  (measured 2026-08-19). `**Ubuntu なら 24.04 以降**で` renders correctly because the closer is
  preceded by `降` rather than by punctuation, and the sentence above still asks for a space
  after it. **A clean `pnpm test` is therefore not proof the letter is met** — nothing holds
  that, so **write new prose to the letter** — the sentence this bullet opens with binds what you
  write, whether or not the check can see it. **What TASK-194 settles is only whether the 3,454
  sites already in the tree count as defects** — leave those alone until it does, and do not read
  a green run as licence to add another. **The letter is harder to follow than it looks** —
  TASK-194's own body was written with it in mind and still broke it five times, once where the
  following character was `:`; there the fix was to rewrite the sentence rather than wedge a space
  in, because a space before `:` or `（` costs more than it buys.
- After implementation, run the relevant checks and report anything that cannot be run, with the
  reason. **The frontend has no formatter** — its checks are `pnpm test`, `pnpm run check` and
  `pnpm run lint`. The Rust side does have one: `cargo fmt`, alongside `cargo test` and
  `cargo clippy`, from `src-tauri/`. Why the frontend has none is decision-32.
- Do not commit, rewrite history, or push to a remote without an explicit request.
