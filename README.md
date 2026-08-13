<img src="src-tauri/icons/128x128@2x.png" alt="" width="128">

# Backlog Atlas

A desktop app for working across the tasks, documents, and milestones of several projects
from one screen. Your tasks stay where they are — as the Markdown that
[Backlog.md](https://github.com/MrLesk/Backlog.md) manages, in each project — and Atlas
reads them, lays them out, and delegates updates to the Backlog CLI.

**This is an unofficial Backlog.md client.** It is a separate project, not affiliated with
the authors of Backlog.md and not provided or endorsed by them. It works by using the
management-file format Backlog.md defines and the Backlog CLI it ships.

Atlas is a single app. You do not need a resident `backlog browser` per project, and you do
not run more than one Atlas.

## Platforms

macOS, Windows, and Linux. On Linux the WebView comes from system libraries — webkit2gtk-4.1
and libsoup-3.0 — so a distribution carrying them is required: **Ubuntu 24.04 or newer**, as
20.04 and 22.04 do not ship both.

The interface is in Japanese only.

## What it does

- Register several projects and work with them together.
- See every project's tasks in a swimlane: a row per project, a column per status.
- View and edit task detail, with the body rendered as Markdown and diagram fences drawn
  by mermaid.
- Extract Pull Request URLs from a task's References, and look up its Git commits and Pull
  Requests from the task ID.
- Derive Type from `kind:*` labels and the frontmatter `type`, shown apart from ordinary
  labels.
- List and edit documents and milestones.
- Keep the display theme, card density, filters, and sort order in settings.

## What Atlas does not change

- **Your tasks do not move.** Atlas keeps no copy of them; it reads and writes each
  project's Backlog.md files as they are, and never gathers every project's tasks into one
  central Backlog.
- **No extra process stays resident.** The one you start is Atlas itself.
- **The Backlog CLI is what writes managed files.** Updates Atlas originates are delegated
  to the Backlog CLI, run with the target project as its working directory. There are two
  exceptions: a milestone's description, which the CLI offers no way to change, and edits
  you make yourself in an external editor Atlas opened at your request.

Because several projects share one screen, Atlas identifies a task there as
`<project-slug>:<TASK-ID>`. Inside a project it is the usual `TASK-N`.

## Installing

Builds are on the [Releases page](https://github.com/serendipitynz/backlog-atlas/releases).

Creating and updating anything needs the **Backlog CLI (`backlog.md`) at v1.49.3 or newer**.
It is not bundled with Atlas, so install it yourself:

```sh
npm install -g backlog.md
```

**Atlas starts without it.** Reading never goes through the CLI — Atlas parses the
Backlog.md files directly — so with no `backlog` on your `PATH`, or one below v1.49.3, it
opens read-only: every screen renders, and only the operations that would write are held
back, with the reason stated where the control is. Install the CLI, restart, and they turn
on.

Git commit and Pull Request history uses `git` and `gh`. Without them you simply do not get
that display.

**An app started from Finder or the Dock does not always inherit your shell's `PATH`.** If
Atlas cannot find a tool you know is installed, name it in **設定 → 外部コマンド** (Settings →
External commands) by its absolute path; the same panel shows what each tool currently
resolves to. For `backlog`, do not use what `which backlog` prints — that is a shim. Point
at the native binary inside the package:

```sh
# macOS / Linux
ls "$(npm prefix -g)"/lib/node_modules/backlog.md/node_modules/backlog.md-*/backlog
```

```powershell
# Windows
Get-ChildItem "$(npm prefix -g)\node_modules\backlog.md\node_modules\backlog.md-*\backlog.exe"
```

## Updating

v0.1.0 has no mechanism for updating itself. New versions are published on the
[Releases page](https://github.com/serendipitynz/backlog-atlas/releases); download a build
and replace your copy. Watching Releases will notify you when one appears.

## Building from source

You need Node 24 (`.node-version` pins the Node major), pnpm 10.30.3 (pinned in
`package.json`'s `packageManager`), and the Rust toolchain Tauri 2 asks for. Node is a
build-time requirement only — it is not in the shipped app.

On Linux the WebView is a system library, so its development headers are needed too
(Ubuntu 24.04 or newer):

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

Design decisions live in `backlog/decisions/`, and the screen and read-layer specifications
in `backlog/docs/`.

## License

MIT — see [LICENSE](LICENSE).

Two things by other authors ship with the app: the [Ace](https://github.com/ajaxorg/ace)
editor (BSD 3-Clause) and the icon figures from [Lucide](https://lucide.dev/) (ISC, with some
Feather-derived icons under MIT). Their notices are in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Contributing

This is a personal project. Bug reports and requests are welcome in
[Issues](https://github.com/serendipitynz/backlog-atlas/issues). If you would like to send a
Pull Request, please open an issue first so we can talk it over.

## Language

日本語版は [README.ja.md](README.ja.md) を参照してください。
