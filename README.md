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

## Boundaries

Atlas does not edit managed Markdown directly. It delegates updates to the Backlog
CLI, run with the target project as its working directory. The Backlog update
adapter — the part that translates an Atlas operation into a Backlog CLI call — uses
fixed subcommands and argument arrays, and never concatenates user input into a
shell string.

## Status

This is the initialization stage. The desktop implementation approach (Tauri or
Wails), the read strategy (parsing Backlog management files, or going through the
Backlog CLI / MCP), whether the Backlog CLI is bundled as a sidecar, and the
distribution method are all undecided.

Bundling the Backlog CLI as a sidecar is a distribution choice; it does not mean
Backlog Atlas owns the source of truth for tasks.

## Related planning

- This project's own planning lives in this repository's Backlog root
  (`backlog/`): the terminology table (`backlog/docs/doc-1`) and the bootstrap
  guide (`backlog/docs/doc-2`), plus tasks under `backlog/tasks/`.
- Portfolio-level governance stays in the `personal-planning` repository under
  `backlog/docs/portfolio/`: the project registry, operating policy, and
  Git-linking rules that span every project.

## Language

日本語版は [README.ja.md](README.ja.md) を参照してください。
