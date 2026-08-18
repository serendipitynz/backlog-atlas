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
  `backlog decision` offers `create` alone, and its only options are `<title>` and
  `-s/--status` — so a decision's body is unwritable through the CLI at creation as
  well as afterwards (measured on v1.49.3; `doc`, by contrast, has
  `update --content`). Every body in `backlog/decisions/` was therefore written by
  editing the file, and that is how to write one. The three named kinds — tasks,
  documents, milestones — keep the rule above without exception. **The owner
  confirmed this reading on 2026-08-13** (TASK-162); it is recorded because the
  enumeration's silence is not what establishes it, and a later session that
  re-derives permission from an omission would be making the move the last bullet
  here forbids.
- **The product's one exception — a milestone's description** (decision-21).
  v1.49.3's `milestone` has no `update`/`edit`, so a description can only be set
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
  repeated in `.github/workflows/release.yml`, whose Linux runner has to install them
  before any step could read prose. **The list therefore has two places, not one**
  (TASK-101 added the second) — change them together, and send a reader to the README.
  The runner already carries the generic half of the list; it is installed again anyway,
  so the two stay comparable line by line instead of drifting into a subset nobody
  re-derives.
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
goal and a full GUI E2E is a separate thing again (TASK-105); a component test per
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

**Three checks are required before a pull request can merge** — `frontend`,
`rust (macos-latest)` and `rust (windows-latest)` — through the repository ruleset named `main`.
**A job's `name` is that string.** Rename a job and the ruleset waits forever on the old name;
change the two together.

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

**Before tagging a release, read `README.md` and `README.ja.md` against the build being
shipped, and read them together.** A fix applied to one language only is the failure this
step exists to catch. The claims that go stale are the ones tied to a measured value or to
a decision that can be revisited: the platforms and the Linux minimum, the Backlog CLI
minimum version, whether the app updates itself, and what the feature list says the app
can do.

**The README carries no implementation-status section, and none is to be added back**
(TASK-90). Where work stands lives in `backlog/tasks/`, and why the design is what it is
lives in `backlog/decisions/`; a status list in the README is a second copy of both, and it
goes stale between releases without anything failing. The check above is over claims a
reader acts on — what to install, what will run it, how a new version arrives — not over a
progress report.

### Producing a release

`.github/workflows/release.yml` builds the three platforms' bundles for a `v*` tag — pushed,
or handed to the workflow from the Actions tab — and attaches them to a **draft** release
whose notes GitHub generates from the merged Pull Requests (`.github/release.yml` groups
them). **Publishing the draft is a manual step and stays one**: the notes are meant to be
read first, and a platform whose job failed leaves the draft short an asset.

Six things about that workflow are decisions rather than details, and an edit undoing one
should say why.

- **It refuses to build when the six macOS signing secrets are unregistered**, in the job
  that would otherwise create the draft, so the run stops before any asset exists. An
  unsigned macOS bundle is worse than a missing one — Gatekeeper refuses it, and the user
  has already downloaded it by then.
- **It checks that `THIRD-PARTY-LICENSES.txt` still describes the tagged tree**, in that
  same job and for the same reason: every bundle carries a copy, so a stale one is a defect
  in every asset at once rather than in the platform whose job noticed.
- **It does not run `pnpm test`.** m-3 TASK-150's intermittent component-test timeout would
  fail releases at random for a fault that is not in the build. Tests run before the Pull
  Request that produced the tag.
- **It checks the tag against `package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` before building.** Tauri names the
  bundles after `tauri.conf.json` and the build passes no `--locked`, so a tag out of step
  with them yields assets carrying the previous version's name over a lockfile the build
  silently rewrote.
- **It deletes the `.app.tar.gz` that tauri-action uploads beside the `.dmg`** (TASK-170).
  tauri-action archives any `.app` it finds, updater or not, and offers no input to leave
  one asset out — `bundle.targets` cannot prevent it either, because building the `.dmg`
  produces the `.app`. With no updater (decision-30) nobody consumes the archive, and the
  `.dmg` carries the same `.app`, so shipping it would keep an asset on the release page
  that README tells every reader to skip. v0.1.0 shipped it once; the owner deleted it on
  2026-08-14.
- **It builds Linux twice, on `ubuntu-24.04` and on `ubuntu-24.04-arm`** (TASK-172). v0.1.0
  shipped x86_64 alone, and the owner's Linux environment is a VM on Apple silicon, so that
  release held nothing they could run. Each runner builds for its own architecture, so
  nothing cross-compiles and neither row passes a `--target`; `ubuntu-24.04-arm` is a
  GitHub-hosted label, free on public repositories, and carries the same Ubuntu the
  Toolchain section's WebView requirement names. **The two rows' six assets cannot collide**
  — tauri-bundler writes the architecture into every name: `amd64`/`arm64` for the `.deb`,
  `x86_64`/`aarch64` for the `.rpm`, `amd64`/`aarch64` for the `.AppImage` (read out of the
  bundler at @tauri-apps/cli 2.11.4, which also fetches an aarch64 linuxdeploy rather than
  refusing the AppImage; **confirmed on an arm64 Ubuntu machine on 2026-08-16**, where a
  local `pnpm tauri build` produced those three names and the app it built ran). **What is
  still unmeasured is the `ubuntu-24.04-arm` runner itself** — the apt list and the build on
  it — which the first tag carrying arm64 assets settles. **The Linux-only steps are keyed on the matrix's `linux` flag
  rather than on a runner label**: with two Linux rows, a condition naming one label leaves
  the other bundle's two checks unrun, and a skipped check is a green run that read nothing.

### Third-party notices

**The generator adds no dependency, and that was the dependency gate's outcome rather than
its accident** (TASK-159, confirmed with the owner on 2026-08-14). The npm half is
`pnpm licenses list --prod --json`, pnpm's own subcommand, so it is already pinned by
`packageManager`; the cargo half is `cargo metadata` and a tar reader inside the script. The
alternative put beside it was `cargo-about`, which carries the SPDX text corpus this repo
instead keeps in `scripts/spdx/` — it was declined because it covers only the cargo half (the
npm half would still be written here), it compiles on every release run, and its `accepted`
allowlist stops a release for a licence change the notice would otherwise just record.

**`THIRD-PARTY-LICENSES.txt` is generated and committed. Do not edit it.**
`scripts/generate-third-party-licenses.mjs` writes it out of the two lockfiles and the
packages they resolve, so a hand edit is lost the next time a dependency moves. Regenerate
and commit it whenever an input changes — either lockfile, `THIRD-PARTY-NOTICES.md`, or an
`scripts/spdx/` text:

```
pnpm install
cargo fetch --manifest-path src-tauri/Cargo.toml \
  --target aarch64-apple-darwin --target x86_64-apple-darwin \
  --target x86_64-pc-windows-msvc --target x86_64-unknown-linux-gnu \
  --target aarch64-unknown-linux-gnu
node scripts/generate-third-party-licenses.mjs
```

The file records a digest of each of those inputs in its own header.
`src/lib/third-party-licenses.test.ts` compares them against the tree and fails when one has
moved, and the release workflow makes the same comparison before creating the draft — so
"someone has to remember to re-run it" is not what this rests on.

Four things about the generator are decisions rather than details.

- **Its output is committed rather than produced in CI**, because `tauri.conf.json` lists
  the file under `bundle.resources`: a resource that exists only on a runner breaks
  `pnpm tauri build` for everyone following README's "Building from source". Committing it is
  safe because the output is byte-reproducible — nothing in the generator reads a clock, a
  path, or a machine-specific value, and every list it emits is sorted.
- **It opens by reproducing `THIRD-PARTY-NOTICES.md` in full.** Ace and Lucide are vendored
  into this tree and appear in neither lockfile, so no inventory built from one lists either.
  One file rather than two is what makes shipping the generated list without them impossible,
  instead of a rule someone has to remember at bundling time.
- **The crate set is the union over the five release target triples**, one
  `cargo metadata --filter-platform` pass each. The unfiltered graph is 442 crates against
  that union's 352: cargo resolves every platform the lockfile can describe, so the notice
  would claim the Android, wasm, Redox, iOS and GNU-ABI Windows crates ship inside these
  bundles. **The list follows the release's bundles, so the arm64 Linux row put
  `aarch64-unknown-linux-gnu` in it** (TASK-172) — the two Linux triples resolve the same
  crates today (measured 2026-08-15, the union unchanged at 352), so it is there against a
  later `cfg(target_arch)` dependency going unlisted in the arm64 bundles.
- **Crate texts are read out of the `.crate` tarballs in the cargo registry cache**, not out
  of the extracted sources beside them. `cargo fetch --target` fills the cache for a platform
  it never builds, but extraction happens at build time — so on any one machine the extracted
  set covers the host alone, and this notice has to cover five triples at once (measured on
  2026-08-14: 58 of the tree's crates were cached and unextracted).

**`.gitattributes` is load-bearing here, not housekeeping.** The digests are taken over the
bytes on disk, so the scheme rests on every checkout producing the same bytes; `* text=auto
eol=lf` is what delivers that against git's default `core.autocrlf=true` on Windows. Without
it a Windows checkout changes all nine digests at once **and** leaves the notice's header
unparseable, which was worse than it sounds: the staleness test then compared an empty list
against an empty list and passed, so the one check that reads every input agreed nothing had
gone stale, having read none of them. `third-party-licenses.test.ts` now fails on a converted
checkout and on a header it cannot parse, rather than going quiet.

**Nineteen crates publish no licence text at all**, declaring only an SPDX expression in
`Cargo.toml` — the `objc2` and `unic` families, `selectors`, `tauri-plugin`, `alloc-stdlib`,
`webview2-com`, `dlopen2`, `libappindicator-sys`. The standard text of each identifier stands
in for them, kept in `scripts/spdx/` with its provenance in that directory's README. **An
identifier with no text there stops the generator rather than being invented** — that stop is
the point, because it means the tree took on a licence nobody has looked at.

**All three bundles were confirmed to carry it, on real machines** (TASK-159, 2026-08-14),
and the release workflow re-checks each. The paths were worth measuring rather than assuming
because `tauri.conf.json` names the two files as `../LICENSE` and `../THIRD-PARTY-LICENSES.txt`
— above `src-tauri/`, which each bundler has to resolve for itself, and any of them could have
failed to.

| bundle | where the copy lands | how the workflow reads it |
|---|---|---|
| macOS `.app` | `Contents/Resources/` | the path directly |
| Linux `.deb` | `usr/lib/<productName>/` | `dpkg-deb -x`, then find by name |
| Windows `.msi` | `Program Files\<productName>\` | `msiexec /a` to unpack, then find by name |

Two of the three **search for the file rather than naming its directory**, because that
directory is the product name: spelling it in the workflow would put it in a second place for
a rename to miss. **The notice is attached to the release as its own asset as well**, so no
platform depends on its bundler for the notice to exist at all.

### Bundle metadata

The three `bundle` values that a screen or a package manager shows, and what reads each.

- **`copyright` is what the macOS About panel prints**, and it reaches the `.app`'s
  `NSHumanReadableCopyright` and the `.deb`/`.msi` metadata at the same time. No code is
  involved: Tauri's default menu builds `AboutMetadata` from the config, so a session asked to
  change the About panel edits `tauri.conf.json` and nothing else. **The wording is a second
  copy of LICENSE's** — the two files are unrelated to each other, so change them together.
- **The About panel's icon is AppKit's own default and is not set anywhere.** Tauri's default
  menu passes `icon: None`, so muda leaves `NSAboutPanelOptionApplicationIcon` out of the
  options dictionary and the panel falls back to `NSApp.applicationIconImage` — which in a
  bundle resolves `CFBundleIconFile`. **An unbundled `pnpm tauri dev` run has no bundle for
  that fallback to resolve and shows a generic icon; the built `.app` is correct** (the owner
  confirmed the launch mode on 2026-08-14, TASK-168). Do not raise the dev-run icon as a
  defect, and do not build a custom menu to set it — that means maintaining a copy of Tauri's
  default Edit/View/Window/Help structure in Rust for a difference no user sees.
- **`category` fills both platforms' classification from one value.** `DeveloperTool` becomes
  `public.app-category.developer-tools` on macOS and `Categories=Development` on Linux, so the
  launcher stops filing the app under "Other". Both halves were read out of built bundles on
  2026-08-14 (TASK-163): the `.app`'s `Info.plist`, and the `.desktop` entry inside the `.deb`,
  unpacked with `dpkg-deb -x`. **Re-measuring the Linux half needs a Linux machine** — no macOS
  build produces a `.deb`, so a session working only on macOS can confirm one half and no more.
- **Text that reaches a Linux package must stay ASCII.** The crate `description` becomes the
  `.deb` control `Description` and the `.desktop` `Comment`, where Desktop Entry escaping
  defines `\s \n \t \r \\` and nothing else — TASK-163's em dash arrived as the six literal
  characters `\u2014`. The constraint is written above the line it binds in
  `src-tauri/Cargo.toml`; it binds `bundle.shortDescription` and `bundle.longDescription`
  equally, and neither is set.

### macOS signing and notarization

A macOS build that opens without a Gatekeeper warning has to be signed with a **Developer ID
Application** certificate and notarized by Apple. Tauri does both when the credentials are in
the environment and produces an unsigned bundle when they are not, so `pnpm tauri build` and
the rest of the README's "Building from source" need none of them.

- **Building signed** — fill in `.env.signing` from `.env.signing.example` (git-ignored) and
  run `./scripts/macos-sign-build.sh`. Its arguments are forwarded to `pnpm tauri build`.
- **Checking the result** — `./scripts/macos-verify-gatekeeper.sh`, over the built bundles or
  over paths handed to it, including a release asset downloaded from GitHub.
- **CI** — `./scripts/setup-ci-signing-secrets.sh path/to/DeveloperID.p12` registers the six
  repository secrets a macOS runner needs, printing no value: `APPLE_CERTIFICATE` (the .p12
  base64-encoded), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_PASSWORD`, `APPLE_TEAM_ID`.

**The certificate and the Apple ID are the owner's assets.** The repository holds no
credential, and an agent neither generates nor registers one.

**The signing identity does not name the copyright holder, and that is deliberate.** The
certificate is `Developer ID Application: Yoko Otani (9EYB4D9GGQ)`, so Gatekeeper and
`codesign` show "Yoko Otani" while LICENSE says "Takuya Otani / SerendipityNZ Ltd." and the
identifier says `com.serendipitynz.backlog-atlas`. The owner confirmed on 2026-08-14 that
this is historical and not worth the work of changing. Do not raise it as a defect.

**Tauri notarizes the .app but not the .dmg that wraps it**, so the disk image a user
downloads is refused; `macos-sign-build.sh` notarizes and staples each produced .dmg
afterwards. Measured on @tauri-apps/cli 2.11.4: the CLI drives `bundle_dmg.sh`, that script
takes a `--notarize` option, and the argument list the CLI passes does not include it.

**`APPLE_SIGNING_IDENTITY` is not the same value locally and in CI.** Local signing accepts
the certificate's SHA-1 hash; a runner imports the certificate and string-matches its common
name, so CI needs that name. `setup-ci-signing-secrets.sh` derives it from the .p12 instead
of copying `.env.signing`.

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
  that. **TASK-194 settles which of the two readings this bullet means** — until it does, neither
  is the repository's answer: do not narrow the sentence to the rendering condition, and do
  not read a green run as having satisfied it. **The letter is harder to follow than it
  looks** — TASK-194's own body was written with it in mind and still broke it five times,
  once where the following character was `:` and a space would have hurt the typography.
- After implementation, run the relevant checks and report anything that cannot be run, with the
  reason. **The frontend has no formatter** — its checks are `pnpm test`, `pnpm run check` and
  `pnpm run lint`. The Rust side does have one: `cargo fmt`, alongside `cargo test` and
  `cargo clippy`, from `src-tauri/`. Why the frontend has none is decision-32.
- Do not commit, rewrite history, or push to a remote without an explicit request.
