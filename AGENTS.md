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
- **The product's one exception — a milestone's description** (decision-21).
  v1.48.0's `milestone` has no `update`/`edit`, so a description can only be set
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
- `pnpm install` reports `@parcel/watcher` and `esbuild` as ignored build scripts.
  Leave them unapproved: sass needs `@parcel/watcher` only for its own watch mode,
  esbuild resolves its platform binary through an optional dependency instead, and the
  build, the tests, and `svelte-check` all pass without either script.

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

## Working conventions

- Code comments in English; user-facing explanations in Japanese by default.
- After implementation, run the relevant tests, formatter, and static analysis.
  Report anything that cannot be run, with the reason.
- Do not commit, rewrite history, or push to a remote without an explicit request.
