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
  the managed Markdown files directly.
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

## Working conventions

- Code comments in English; user-facing explanations in Japanese by default.
- After implementation, run the relevant tests, formatter, and static analysis.
  Report anything that cannot be run, with the reason.
- Do not commit, rewrite history, or push to a remote without an explicit request.
