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
  the reader nothing: the install command they are given fetches the latest. **This layer
  is not in decision-27**, which stops at code, screen text, docs and 実測註 — TASK-162
  writes it in there, and until it does, this bullet is where the rule lives.

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
  script through it: `pnpm test`, `pnpm run check`, `pnpm run build`, `pnpm tauri dev`,
  `pnpm tauri build`. Do not run npm or yarn in this repository — either would write a
  second lockfile beside `pnpm-lock.yaml`.
- The Rust side keeps its own commands, run from `src-tauri/`: `cargo test`,
  `cargo fmt`, `cargo clippy`.
- **Building on Linux needs Ubuntu 24.04 or newer.** The WebView is a system library
  there, not a cargo dependency, and which one follows from the lockfile: the
  `webkit2gtk` crate binds webkit2gtk-4.1 and `soup3` binds libsoup-3.0. 24.04 carries
  both; 20.04 and 22.04 do not, and a build on them stops early in `pkg-config` saying
  `glib-2.0` was not found — an error that names neither WebKit nor the Ubuntu version,
  so it invites installing packages one at a time instead of changing the distribution.
  The development packages to install are listed in README's "Building from source",
  and only there, so the list has one home.
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

## Working conventions

- Code comments in English; user-facing explanations in Japanese by default.
- **In Japanese Markdown, leave a half-width space after a closing `**` when text follows
  it.** A closing delimiter has to be right-flanking, and one preceded by `。` with a
  non-space after it is not — so `**…です。**Atlas` renders its asterisks literally rather
  than as bold. Every Japanese sentence that ends inside the emphasis hits this, which is
  most of them. It applies wherever the Markdown is rendered: the READMEs, and task and
  document bodies, which Atlas draws with `markdown-it` (decision-25).
- After implementation, run the relevant tests, formatter, and static analysis.
  Report anything that cannot be run, with the reason.
- Do not commit, rewrite history, or push to a remote without an explicit request.
