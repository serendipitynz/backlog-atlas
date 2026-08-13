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

### Producing a release

`.github/workflows/release.yml` builds the three platforms' bundles for a `v*` tag — pushed,
or handed to the workflow from the Actions tab — and attaches them to a **draft** release
whose notes GitHub generates from the merged Pull Requests (`.github/release.yml` groups
them). **Publishing the draft is a manual step and stays one**: the notes are meant to be
read first, and a platform whose job failed leaves the draft short an asset.

Four things about that workflow are decisions rather than details, and an edit undoing one
should say why.

- **It refuses to build when the six macOS signing secrets are unregistered**, in the job
  that would otherwise create the draft, so the run stops before any asset exists. An
  unsigned macOS bundle is worse than a missing one — Gatekeeper refuses it, and the user
  has already downloaded it by then.
- **It checks that `THIRD-PARTY-LICENSES.txt` still describes the tagged tree**, in that
  same job and for the same reason: every bundle carries a copy, so a stale one is a defect
  in all three assets at once rather than in the platform whose job noticed.
- **It does not run `pnpm test`.** m-3 TASK-150's intermittent component-test timeout would
  fail releases at random for a fault that is not in the build. Tests run before the Pull
  Request that produced the tag.
- **It checks the tag against `package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` before building.** Tauri names the
  bundles after `tauri.conf.json` and the build passes no `--locked`, so a tag out of step
  with them yields assets carrying the previous version's name over a lockfile the build
  silently rewrote.

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
  --target x86_64-pc-windows-msvc --target x86_64-unknown-linux-gnu
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
- **The crate set is the union over the four release target triples**, one
  `cargo metadata --filter-platform` pass each. The unfiltered graph is 442 crates against
  that union's 352: cargo resolves every platform the lockfile can describe, so the notice
  would claim the Android, wasm, Redox, iOS and GNU-ABI Windows crates ship inside these
  bundles.
- **Crate texts are read out of the `.crate` tarballs in the cargo registry cache**, not out
  of the extracted sources beside them. `cargo fetch --target` fills the cache for a platform
  it never builds, but extraction happens at build time — so on any one machine the extracted
  set covers the host alone, and this notice has to cover four triples at once (measured on
  2026-08-14: 58 of the tree's crates were cached and unextracted).

**Nineteen crates publish no licence text at all**, declaring only an SPDX expression in
`Cargo.toml` — the `objc2` and `unic` families, `selectors`, `tauri-plugin`, `alloc-stdlib`,
`webview2-com`, `dlopen2`, `libappindicator-sys`. The standard text of each identifier stands
in for them, kept in `scripts/spdx/` with its provenance in that directory's README. **An
identifier with no text there stops the generator rather than being invented** — that stop is
the point, because it means the tree took on a licence nobody has looked at.

**The copy inside a bundle is confirmed on macOS only.** TASK-159 built locally and found
`Contents/Resources/` carrying `LICENSE` and `THIRD-PARTY-LICENSES.txt` byte-identical to the
committed files; the workflow re-checks that. Where the Windows and Linux bundlers put a
resource has not been measured, so nothing checks them — a check written from a guess would
stop a release for being wrong about itself. **The notice is attached to the release as its
own asset regardless**, so no platform ships without it either way.

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
- After implementation, run the relevant tests, formatter, and static analysis.
  Report anything that cannot be run, with the reason.
- Do not commit, rewrite history, or push to a remote without an explicit request.
