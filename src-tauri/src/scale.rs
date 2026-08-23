//! Test-only: the Rust half of 規模計測 (TASK-94, decision-42). Not a layer — it holds no logic the
//! app runs, only synthetic Backlog roots at chosen sizes and the clocks around the real read path.
//!
//! Nothing here asserts. The tests are `#[ignore]`d and print numbers; what guards them is that
//! `#[cfg(test)]` makes `cargo test` compile them, so a signature change in the read layer reddens
//! the build rather than leaving a harness that silently stopped measuring the product.
//!
//! `scripts/scale/run.mjs` is the entry point that runs these and the frontend half together.
//!
//! **The synthetic roots hold ASCII, and every string this file prints is ASCII too.** Not a style
//! choice: `screen-text.test.ts` reads the crate with its inline `#[cfg(test)] mod` blocks stripped,
//! and a module that *is* a file has no block to strip, so Japanese in a literal here reddens that
//! scan the way the two sibling test-only modules avoid — by keeping their Japanese in comments.
//! What the synthetic bodies therefore do not carry is multibyte text; [`scale_of_a_real_root`] is
//! what covers that, and it is why the real-root arm is not optional decoration.

use crate::commands::ProjectState;
use crate::ledger::ProjectEntry;
use crate::read::scan::{ScanDir, ScanSource, WorkingTree};
use crate::sync::{FsVersions, ReloadReason, WatchSession};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

/// Task counts swept at a fixed body size, and body sizes swept at a fixed task count. Both axes
/// are needed because they move different costs: the first moves the per-file cost the filesystem
/// charges, the second moves only the bytes parsed and serialized.
const TASK_COUNTS: [usize; 6] = [100, 250, 500, 1000, 2000, 4000];
const BODY_BYTES: usize = 2_000;
const BODY_SIZES: [usize; 3] = [500, 8_000, 32_000];
const BODY_SIZE_TASKS: usize = 250;
const ROOT_COUNTS: [usize; 5] = [1, 3, 5, 10, 20];
const TASKS_PER_ROOT: usize = 200;
const WATCHED_ROOTS: usize = 20;

/// Non-task file counts, held at this repository's own `backlog/` so a synthetic root is comparable
/// with the real one measured beside it.
const DOCS: usize = 13;
const DECISIONS: usize = 41;
const MILESTONES: usize = 4;

/// The best of this many timed runs is reported. The minimum rather than the mean: the thing being
/// characterized is what the work costs, and every source of noise on a shared machine adds time.
const RUNS: usize = 3;

const CONFIG: &str = "project_name: \"Scale\"\n\
default_status: \"To Do\"\n\
statuses: [\"To Do\", \"In Progress\", \"In Review\", \"Done\"]\n\
task_prefix: \"TASK\"\n";

/// A temp directory that removes itself, mirroring the read layer's test helper so this module
/// needs no `tempfile` dependency either.
struct TempRoot {
    path: PathBuf,
}

impl TempRoot {
    fn new(tag: &str) -> TempRoot {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let unique = NEXT.fetch_add(1, Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("atlas-scale-{tag}-{}-{unique}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("temp dir");
        TempRoot { path }
    }
}

impl Drop for TempRoot {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn filler(bytes: usize) -> String {
    let line = "A filler line for the synthetic root, long enough to be a plausible body line.\n";
    line.repeat(bytes / line.len() + 1)
}

fn task_file(n: usize, body_bytes: usize) -> String {
    let status = ["To Do", "In Progress", "In Review", "Done"][n % 4];
    let priority = ["high", "medium", "low"][n % 3];
    format!(
        "---\n\
id: TASK-{n}\n\
title: Measured task {n}\n\
status: {status}\n\
assignee: []\n\
created_date: '2026-08-01 00:00'\n\
updated_date: '2026-08-02 00:00'\n\
labels:\n  - performance\n  - 'kind:chore'\n\
milestone: m-{milestone}\n\
dependencies: []\n\
priority: {priority}\n\
ordinal: {n}000\n\
---\n\n\
## Description\n\n\
<!-- SECTION:DESCRIPTION:BEGIN -->\n{body}\n<!-- SECTION:DESCRIPTION:END -->\n\n\
## Acceptance Criteria\n\
<!-- AC:BEGIN -->\n- [ ] #1 first\n- [x] #2 second\n<!-- AC:END -->\n",
        milestone = (n % MILESTONES) + 1,
        body = filler(body_bytes),
    )
}

/// Write one synthetic Backlog root with `tasks` tasks and this repository's own count of docs,
/// decisions and milestones. Every scanned directory is created, so a missing one never stands in
/// for an empty one (doc-4 §5 tells those apart, and a measurement of the wrong branch is worse
/// than no measurement).
fn build_root(root: &Path, tasks: usize, body_bytes: usize) {
    for dir in ScanDir::ALL {
        fs::create_dir_all(root.join(dir.rel_path())).expect("scan dir");
    }
    fs::write(root.join("config.yml"), CONFIG).expect("config");
    for n in 1..=tasks {
        fs::write(
            root.join("tasks")
                .join(format!("task-{n} - measured task.md")),
            task_file(n, body_bytes),
        )
        .expect("task file");
    }
    for n in 1..=DOCS {
        fs::write(
            root.join("docs").join(format!("doc-{n} - measured doc.md")),
            format!(
                "---\nid: doc-{n}\ntitle: Measured doc {n}\ntype: guide\n---\n\n{}",
                filler(body_bytes)
            ),
        )
        .expect("doc file");
    }
    for n in 1..=DECISIONS {
        fs::write(
            root.join("decisions")
                .join(format!("decision-{n} - measured decision.md")),
            format!(
                "---\nid: decision-{n}\ntitle: Measured decision {n}\nstatus: accepted\n---\n\n{}",
                filler(body_bytes)
            ),
        )
        .expect("decision file");
    }
    for n in 1..=MILESTONES {
        fs::write(
            root.join("milestones")
                .join(format!("milestone-{n} - measured milestone.md")),
            format!(
                "---\nid: m-{n}\ntitle: Measured milestone {n}\n---\n\n## Description\n\n{}",
                filler(200)
            ),
        )
        .expect("milestone file");
    }
}

fn entry_for(slug: &str, backlog_root: &Path) -> ProjectEntry {
    ProjectEntry {
        slug: slug.to_string(),
        project_root: backlog_root.parent().unwrap_or(backlog_root).to_path_buf(),
        backlog_root: backlog_root.to_path_buf(),
        git_remote_present: false,
        status_aliases: BTreeMap::new(),
    }
}

/// What one root's read costs. `raw_io` is the same files read with no parsing at all — the term
/// that separates what the filesystem charges from what the read layer does with the bytes.
struct RootCost {
    files: usize,
    raw_io: Duration,
    read: Duration,
    reload: Duration,
    serialize: Duration,
    snapshot_bytes: usize,
}

fn raw_io(root: &Path) -> Duration {
    let source = WorkingTree::new(root);
    let started = Instant::now();
    let _ = source.read_config();
    for dir in ScanDir::ALL {
        for path in source.list(dir).unwrap_or_default() {
            let _ = source.read(&path);
        }
    }
    started.elapsed()
}

fn file_count(root: &Path) -> usize {
    let source = WorkingTree::new(root);
    ScanDir::ALL
        .iter()
        .map(|dir| source.list(*dir).map(|paths| paths.len()).unwrap_or(0))
        .sum()
}

/// One timed pass over a root: the first read, a reload of the same root, and the serialization of
/// the snapshot the reload's caller would send. `open` and `reload` are the product's own two
/// entry points, taken through [`ProjectState`] rather than through the read layer directly, so the
/// number includes the read-version index that doc-9 §4 makes part of every read.
fn measure_once(root: &Path, slug: &str) -> RootCost {
    let entry = entry_for(slug, root);
    let source = WorkingTree::new(root);
    let mut state = ProjectState::default();

    let started = Instant::now();
    let snapshot = state.open(&entry, &source, &FsVersions).expect("open");
    let read = started.elapsed();

    let started = Instant::now();
    state
        .reload(&entry, ReloadReason::ExternalChange, &source, &FsVersions)
        .expect("reload");
    let reload = started.elapsed();

    let started = Instant::now();
    let bytes = serde_json::to_vec(&snapshot).expect("serialize").len();
    let serialize = started.elapsed();

    RootCost {
        files: file_count(root),
        raw_io: raw_io(root),
        read,
        reload,
        serialize,
        snapshot_bytes: bytes,
    }
}

/// Read the root [`RUNS`] times after a warm-up and keep **each term's own** fastest, not the whole
/// pass that had the fastest read. Taking the terms from one pass reports the others at whatever
/// they happened to be in it — an earlier version of this did, and printed a reload 1.6× its own
/// read. The warm-up is what makes any of it about the read rather than about the page cache the
/// writes just left behind.
fn measure(root: &Path, slug: &str) -> RootCost {
    let _ = measure_once(root, slug);
    let mut best = measure_once(root, slug);
    for _ in 1..RUNS {
        let next = measure_once(root, slug);
        best.raw_io = best.raw_io.min(next.raw_io);
        best.read = best.read.min(next.read);
        best.reload = best.reload.min(next.reload);
        best.serialize = best.serialize.min(next.serialize);
    }
    best
}

fn report(label: &str, cost: &RootCost) {
    println!(
        "{label:<28} files={:<5} rawIo={:>8} read={:>8} reload={:>8} serialize={:>8} snapshot={:>7}KB",
        cost.files,
        ms(cost.raw_io),
        ms(cost.read),
        ms(cost.reload),
        ms(cost.serialize),
        cost.snapshot_bytes / 1024,
    );
}

fn ms(d: Duration) -> String {
    format!("{:.2}ms", d.as_secs_f64() * 1_000.0)
}

/// The process's live OS thread count, or `None` where this harness cannot ask for one.
///
/// Windows is the `None`: reaching its thread count means a `windows-sys` call, which only the CI
/// runner compiles (AGENTS の 継続的インテグレーション), and 規模計測 does not run in CI. Reporting
/// 未測定 there is the honest answer; returning 0 would read as "no threads".
fn thread_count() -> Option<usize> {
    #[cfg(target_os = "linux")]
    {
        fs::read_dir("/proc/self/task").ok().map(|d| d.count())
    }
    #[cfg(target_os = "macos")]
    {
        // No /proc on macOS. `ps -M` lists one line per thread after its header.
        let out = std::process::Command::new("ps")
            .args(["-M", "-p", &std::process::id().to_string()])
            .output()
            .ok()?;
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .count()
            .checked_sub(1)
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        None
    }
}

/// One row of the watch cost. `watchers` is not a measurement and says so: [`WatchSession::start`]
/// creates exactly one `notify` watcher per session, so the count is the number of live sessions.
/// What is measured is what that costs in threads — which is where notify's own watcher thread shows
/// up, and it is not something the count of watchers would have told anyone.
fn watch_line(label: &str, watchers: usize, threads: Option<usize>) {
    match threads {
        Some(n) => println!("{label:<20} watchers={watchers:<4} threads={n}"),
        None => println!(
            "{label:<20} watchers={watchers:<4} threads=unmeasured (not counted on this OS)"
        ),
    }
}

#[test]
#[ignore = "scale measurement: run by `pnpm run scale`; reports numbers and no verdict"]
fn scale_of_one_root() {
    println!("--- one root, {BODY_BYTES}B bodies ---");
    for tasks in TASK_COUNTS {
        let temp = TempRoot::new("one");
        let root = temp.path.join("backlog");
        build_root(&root, tasks, BODY_BYTES);
        report(&format!("tasks={tasks}"), &measure(&root, "scale"));
    }
    println!("--- {BODY_SIZE_TASKS} tasks, body size swept ---");
    for body in BODY_SIZES {
        let temp = TempRoot::new("body");
        let root = temp.path.join("backlog");
        build_root(&root, BODY_SIZE_TASKS, body);
        report(&format!("body={body}B"), &measure(&root, "scale"));
    }
}

/// The startup path's shape: [`crate::commands::workspace_open`] opens every registered root in
/// ledger order, one after another, so what the user waits for is the sum and not the slowest.
#[test]
#[ignore = "scale measurement: run by `pnpm run scale`; reports numbers and no verdict"]
fn scale_of_all_roots_read_serially() {
    println!("--- every root read serially, {TASKS_PER_ROOT} tasks each ---");
    for roots in ROOT_COUNTS {
        let temp = TempRoot::new("many");
        let backlog_roots: Vec<PathBuf> = (0..roots)
            .map(|r| {
                let root = temp.path.join(format!("p{r}")).join("backlog");
                build_root(&root, TASKS_PER_ROOT, BODY_BYTES);
                root
            })
            .collect();
        for (i, root) in backlog_roots.iter().enumerate() {
            let _ = measure_once(root, &format!("warm{i}"));
        }

        let mut bytes = 0usize;
        let mut best = Duration::MAX;
        for _ in 0..RUNS {
            let started = Instant::now();
            bytes = 0;
            for (i, root) in backlog_roots.iter().enumerate() {
                let slug = format!("p{i}");
                let entry = entry_for(&slug, root);
                let source = WorkingTree::new(root);
                let mut state = ProjectState::default();
                let snapshot = state.open(&entry, &source, &FsVersions).expect("open");
                bytes += serde_json::to_vec(&snapshot).expect("serialize").len();
            }
            best = best.min(started.elapsed());
        }
        println!(
            "roots={roots:<3} serial={:>9} snapshotTotal={:>7}KB",
            ms(best),
            bytes / 1024
        );
    }
}

/// What one watched root costs in threads. [`WatchSession`] is the half this harness can start;
/// `project_watch_start` spawns one more per root for its `watch_loop`, which needs an `AppHandle`
/// and is therefore **not** in these numbers.
#[test]
#[ignore = "scale measurement: run by `pnpm run scale`; reports numbers and no verdict"]
fn scale_of_the_watch_threads() {
    println!("--- threads added per watched root (WatchSession only) ---");
    watch_line("watched=0", 0, thread_count());
    let mut sessions = Vec::new();
    let mut temps = Vec::new();
    for n in 1..=WATCHED_ROOTS {
        let temp = TempRoot::new("watch");
        let root = temp.path.join("backlog");
        build_root(&root, 1, 200);
        sessions.push(WatchSession::start(&root, Duration::from_millis(250)).expect("watch"));
        temps.push(temp);
        if n == 1 || n == 5 || n == 10 || n == WATCHED_ROOTS {
            std::thread::sleep(Duration::from_millis(200));
            watch_line(&format!("watched={n}"), sessions.len(), thread_count());
        }
    }
    drop(sessions);
    std::thread::sleep(Duration::from_millis(300));
    watch_line("after drop", 0, thread_count());
}

/// A real root instead of a synthetic one, named by `ATLAS_SCALE_ROOT`. `scripts/scale/run.mjs`
/// points it at this repository's own `backlog/`, which is what keeps the synthetic numbers
/// anchored: a shape nobody writes by hand can be fast for reasons no real root shares.
#[test]
#[ignore = "scale measurement: run by `pnpm run scale`; reports numbers and no verdict"]
fn scale_of_a_real_root() {
    let Ok(root) = std::env::var("ATLAS_SCALE_ROOT") else {
        println!("--- real root: ATLAS_SCALE_ROOT unset, so nothing was measured ---");
        return;
    };
    println!("--- real root {root} ---");
    report("real", &measure(Path::new(&root), "real"));
}
