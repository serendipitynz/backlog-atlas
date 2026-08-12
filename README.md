# Backlog Atlas

## What it is

Backlog Atlas is a Backlog.md-compatible client that lets you view and operate on
multiple Backlog roots — along with each repository's Git and Pull Request history —
from a single screen. A Backlog root is the directory that holds a project's
Backlog.md management files together with the project root from which its settings
resolve. Atlas reads several registered project roots and brings them together into
one view, while the source of truth for every task stays in each project's own
Backlog.md files.

## Scope

- Register and manage multiple projects in a project ledger.
- Show per-project swimlanes (a row per project, a column per status).
- Show Type, derived from `kind:*` labels, separately from ordinary labels.
- Show task detail, including References and extracted Pull Request URLs.
- Update tasks, documents, and milestones through the Backlog CLI.
- Look up a task's Git and Pull Request history from its task ID.

## Data ownership

The source of truth for each task stays in that project's Backlog root. Existing
design, specification, and plot documents also stay in each project. Atlas does not
create a second source of truth of its own, and it does not aggregate every
project's tasks into one central Backlog.

Across the aggregated screen, Atlas identifies a task by its cross-project task ID
`<project-slug>:<TASK-ID>`. Within each project, the usual `TASK-N` form is used.
A task's project is determined by the Backlog root it was loaded from, not by any
`project:<slug>` label on the task.

## Runtime model

A single Atlas process starts once and reads all registered Backlog roots. Atlas
does not keep a `backlog browser`, an MCP server, or a separate Atlas process
resident per project.

## Requirements

Atlas needs the **Backlog CLI (`backlog.md`) at v1.48.0 or newer** on your `PATH`. It is
not bundled with Atlas — the reasoning is in decision-26 — so install it yourself:

```sh
npm install -g backlog.md
```

Atlas checks the version at startup by running `backlog --version`, and no upper bound is
fixed: a newer CLI is used as-is.

**Atlas still starts without it.** Reading does not go through the CLI at all — Atlas
parses each project's Backlog.md files directly (decision-2) — so with no `backlog` on
`PATH`, or one below v1.48.0, Atlas opens read-only: every screen renders, and the
operations that would write are held back with the reason stated where the control is.
Installing the CLI and restarting turns them on.

## Boundaries

Atlas never writes managed Markdown itself. Updates that Atlas originates are
delegated to the Backlog CLI, run with the target project as its working directory.
The Backlog update adapter — the part that translates an Atlas operation into a
Backlog CLI call — uses fixed subcommands and argument arrays, and never concatenates
user input into a shell string.

One update path reaches managed Markdown outside the CLI: on the user's explicit
request, Atlas can open a task's file in the user's own external editor. There the
user — not Atlas — writes the file directly, without the Backlog CLI's schema
protection. Atlas only launches the editor and picks up the save as an external
change to reload. The invariant that Atlas itself never writes managed Markdown still
holds; the CLI-mediated path is not the only way managed Markdown changes.

## Building from source

Requirements: Node 24, pnpm 10.30.3, and the Rust toolchain Tauri 2 asks for. The Node
major is pinned in `.node-version`, holding the bare major `24`. fnm reads that file by
default and resolves the bare major on its own (measured with fnm 1.39.0: it selects
v24.18.1), and `actions/setup-node` reads it through `node-version-file`. Other version
managers need a step of their own — asdf reads `.node-version` only under
`legacy_version_file = yes`, mise keeps idiomatic version files off by default, and
nodenv does not resolve a bare major without an alias plugin — so with those, select
Node 24 however that tool expects. pnpm is pinned in `package.json`'s `packageManager`
field, which Corepack reads. Node is a build-time requirement only — the shipped
artifact is a Tauri binary with the Vite output inside it, and it carries no Node.

On Linux the WebView is a system library rather than a cargo dependency, so building
also needs its development headers, and which ones follows from the lockfile: the
`webkit2gtk` crate binds webkit2gtk-4.1 and `soup3` binds libsoup-3.0. **Ubuntu 24.04 or
newer** carries both — it is what this project has been built on. Ubuntu 20.04 and 22.04
do not, and a build there stops in `pkg-config` reporting that `glib-2.0` was not found;
the error names neither WebKit nor the distribution version, so it reads as a missing
package rather than as the wrong Ubuntu.

```sh
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  pkg-config libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

The build itself is the same on every platform:

```sh
pnpm install
pnpm test            # Vitest
pnpm run check       # svelte-check
pnpm run build       # Vite, into dist/
pnpm tauri dev       # run the app
pnpm tauri build     # package the app
```

The Rust core has its own commands, run from `src-tauri/`: `cargo test`, `cargo fmt`,
`cargo clippy`.

## Status

The design phase (m-0) is complete and the implementation phase (m-1) is under way.
Decisions 1–13 are recorded in `backlog/decisions/`, and the specifications
(`backlog/docs/doc-1`–`doc-11`) cover the scope above.

Implemented (TASK-25–42):

- Rust core: reading and writing the project ledger (`projects.toml`) with
  register/remove/update, the domain model, the read layer (config resolution,
  scanning, parsing, storage division, degradation), status normalization and Type
  derivation, commit search and Pull Request URL extraction, the Backlog update
  adapter, and the file watch with its read-version index and pre-update conflict
  detection.
- The Tauri command boundary between the Rust core and the frontend.
- Screens: per-project swimlanes; task detail (Type, References, Pull Requests, Git
  history); GUI editing of a task's detail; the external-editor path; ledger and
  project registration/management; the document and milestone management GUI with
  the entry point for creating a task; and the distinct display of target-absent,
  unreadable, and no-match.

Not started (TASK-43–45): the reference means for resolving relations between commits
and Pull Requests (doc-6 §6 fixes only its structure and leaves each host's means to
a later addition), the OS-association launch on Windows, and the matching rule for
reference-following rewrites that would enable renaming, removing, and archiving a
milestone.

Not started (TASK-46–57), from the screen design proposal and the corrections it
surfaced: the app-settings file and settings screen (decision-13), the display-theme
mechanism (decision-12), the shared drawing rules of doc-11, card information levels
S/M/L, the lane-header-row rebuild of the swimlane with column and row folding, the
token-based filter bar, the fixed order of the top banners, in-column new-task input,
the three task-detail placements with a persisted default, the project detail screen
(doc-10), the fixed header with its menu, and the correction of what `task create`
actually accepts (TASK-57).

Distribution — packaging — has not started. Whether to bundle the Backlog CLI as a
sidecar is settled: it is not bundled (decision-26).

Key decisions:

- Desktop implementation: Tauri, with a Rust core (decision-1).
- Read/update split: read by parsing Backlog management files directly; delegate
  updates to the Backlog CLI (decision-2). Going through an MCP server was not
  adopted.
- cross-branch: limited to the current checkout in the initial version (decision-3).
- status: per-project statuses are allowed and mapped onto the canonical status
  columns (To Do / In Progress / In Review / Done) (decision-4).
- Type: derived by stripping the `kind:` prefix, with multiple, absent, and unknown
  values shown distinctly (decision-5).
- Absence and gaps: target-absent, unreadable, and no-match are shown as distinct
  states rather than one blank (decision-6).
- Backlog CLI: a `backlog` on the user's PATH, both while developing and once
  distributed (decision-7). It is not bundled as a sidecar: doing so would grow the
  macOS bundle from 14 MB to 81 MB, and the friction it would remove is already
  handled — Windows resolution by decision-16, and pre-install use by the read-only
  start (decision-26).
- Frontend: Svelte 5 used plainly (no SvelteKit), built with Vite and TypeScript,
  with component-scoped styles (decision-8).
- Dependency choices: `toml` for the ledger, `serde_yaml_ng` for frontmatter parsing,
  and `notify` for the file watch (decision-9–11).
- Colour: a display theme holds one set of colour values, chosen in the settings; the
  mark families stay defined in one place per theme (decision-12).
- App settings: kept in a file of their own next to the ledger, so the ledger's
  read-only degradation does not take the display defaults with it (decision-13).

Bundling the Backlog CLI as a sidecar was a distribution choice, not a question of
ownership; either way the source of truth for tasks stays in each project's Backlog
root. It is not bundled (decision-26), and decision-7's two remaining triggers — pinning
a version on the distribution side, and CLI-install friction blocking real use — would
reopen it.

## Related planning

- This project's own planning lives in this repository's Backlog root
  (`backlog/`): the terminology table (`backlog/docs/doc-1`) and the bootstrap
  guide (`backlog/docs/doc-2`), plus tasks under `backlog/tasks/`.
- Portfolio-level governance stays in the `personal-planning` repository under
  `backlog/docs/portfolio/`: the project registry, operating policy, and
  Git-linking rules that span every project.

## Language

日本語版は [README.ja.md](README.ja.md) を参照してください。
