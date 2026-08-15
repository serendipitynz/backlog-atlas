<img src="src-tauri/icons/128x128@2x.png" alt="" width="128">

# Backlog Atlas

A desktop app for working across the tasks, documents, and milestones of several projects
from one screen. Your tasks stay where they are — as the Markdown that
[Backlog.md](https://github.com/MrLesk/Backlog.md) manages, in each project — and Atlas
reads them, lays them out, and delegates updates to the Backlog CLI.

**This is an unofficial Backlog.md client.** It is a separate project, not affiliated with
the authors of Backlog.md and not provided or endorsed by them.

Atlas is a single app. You do not need a resident `backlog browser` per project, and you do
not run more than one Atlas.

## Platforms

macOS, Windows, and Linux (on Linux, a distribution carrying webkit2gtk-4.1 and libsoup-3.0 —
Ubuntu 24.04 or newer). The interface is in Japanese only.

## What it does

- Register several projects and work with them together.
- See every project's tasks in a swimlane: a row per project, a column per status.
- View and edit task detail, with the body rendered as Markdown and diagram fences drawn
  by mermaid.
- Extract Pull Request URLs from a task's References, and look up its Git commits and Pull
  Requests from the task ID.
- Derive Type from `kind:*` labels and the frontmatter, shown apart from ordinary labels.
- List and edit documents and milestones.
- List and read decisions (`backlog/decisions/`).
- Keep the display theme, card density, filters, and sort order in settings.

## What Atlas does not change

- **Your tasks do not move.** Atlas keeps no copy of them; it reads and writes each
  project's Backlog.md files as they are, and never gathers every project's tasks into one
  central Backlog.
- **No extra process stays resident.** The one you start is Atlas itself.
- **The Backlog CLI is what writes managed files.** There are two exceptions: a milestone's
  description, which the CLI offers no way to change, and edits you make yourself in an
  external editor Atlas opened at your request.

Because several projects share one screen, Atlas identifies a task there as
`<project-slug>:<TASK-ID>`. Inside a project it is the usual `TASK-N`.

## Installing

Builds are on the [Releases page](https://github.com/serendipitynz/backlog-atlas/releases).
Which file to take:

- **macOS** — the `.dmg`. It is a universal build, for Apple silicon and Intel alike.
- **Windows** — the `.msi`. The `x64-setup.exe` installs the same app through a different
  installer; either works. x64 only.
- **Linux** — the `.deb` on Debian and Ubuntu, the `.rpm` on Fedora and openSUSE, or the
  `.AppImage` on any distribution, with no install step. x86_64 and arm64 both: take the
  file whose name carries your architecture (`amd64` or `x86_64` for the former, `arm64`
  or `aarch64` for the latter).

The macOS builds are signed and notarized, so macOS does not refuse them. The Windows and
Linux builds are unsigned. On Windows that surfaced in two places when the v0.1.0 `.msi`
was installed on an English-language machine: the browser flagged the download — Edge said
the file "isn't commonly downloaded" and offered **Keep**, then **Keep anyway** — and the
elevation prompt that opens the installer named its publisher as unknown
("Publisher Unknown").

Creating and updating anything needs the **Backlog CLI (`backlog.md`)**, which is not bundled
with Atlas — install it yourself. The latest release is fine; no upper bound is fixed. Git
history uses `git` and `gh`.

```sh
npm install -g backlog.md
```

**Atlas starts without it.** Reading never goes through the CLI, so with no `backlog` — or one
below the version Atlas needs — it opens read-only: every screen renders, and only the
operations that would write are held back, with the reason stated where the control is. Atlas
checks the version at startup and names the one it needs when yours is short of it.

**An app started from Finder or the Dock does not always inherit your shell's `PATH`.** If
Atlas cannot find a tool you know is installed, give its absolute path in **設定 → 外部コマンド**
(Settings → External commands). For `backlog` on an npm install, `which backlog` prints a shim —
pass the binary inside the package instead.

```sh
# macOS / Linux
ls "$(npm prefix -g)"/lib/node_modules/backlog.md/node_modules/backlog.md-*/backlog
# Windows (PowerShell)
Get-ChildItem "$(npm prefix -g)\node_modules\backlog.md\node_modules\backlog.md-*\backlog.exe"
```

## Updating

v0.1.0 does not update itself. New versions are published on the
[Releases page](https://github.com/serendipitynz/backlog-atlas/releases); download a build and
replace your copy (watch Releases to be notified when one appears).

## Building from source

### Requirements

- Node v24 (pinned in `.node-version`; needed to build only, not shipped in the app)
- pnpm 10.30.3
- The Rust toolchain Tauri 2 asks for

On Linux the WebView's development headers are needed too (Ubuntu 24.04 or newer):

```sh
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  pkg-config libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Build

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

Design decisions live in `backlog/decisions/`, and the specifications in `backlog/docs/`.

## License

MIT — see [LICENSE](LICENSE).

Two works by other authors are vendored into this repository: the
[Ace](https://github.com/ajaxorg/ace) editor (BSD 3-Clause) and the icon figures from
[Lucide](https://lucide.dev/) (ISC, with some Feather-derived icons under MIT). Their notices
are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

A built app carries more than those two — every package `pnpm` and `cargo` resolve into the
binary keeps its own licence. Those notices are generated from the two lockfiles into
[THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt), which reproduces the file above in full
before listing them. It is attached to every release and bundled into the app itself.

## Contributing

This is a personal project. Bug reports and requests are welcome in
[Issues](https://github.com/serendipitynz/backlog-atlas/issues). For a Pull Request, please open
an issue first.

## Language

日本語版は [README.ja.md](README.ja.md) を参照してください。
