//! 添付画像 (doc-8 §9.2): resolving one `/assets/<name>` reference written in a 本文 to a file under
//! the Backlog root, and reading its bytes.
//!
//! **The rule here is Backlog CLI's, copied.** v1.49.3's `handleAssetRequest` is what serves these
//! same references in the CLI's own browser mode, so a different resolution would make one 台帳 mean
//! two different things depending on which tool opened it (AGENTS). Read out of the shipped binary on
//! 2026-08-17, it is five steps: percent-decode, the path must start with `/assets/`, the remainder
//! must not contain `..` **anywhere** — as a substring, not as a path segment — the join must stay
//! under the assets directory, and a file that is not there is a 404.
//!
//! **Four of the five are here; the decode is the screen's** (`markdown.ts`'s `bodyImagePlan`, which
//! has to decode anyway to write the reference a reader sees). doc-8 §9.5 records the split.
//!
//! **That split does not weaken the門, and the reason is worth stating rather than assuming.** The
//! four steps below hold for *any* string, decoded or not: an escape that arrives undecoded is a
//! literal path segment, so `/assets/%2e%2e/x` joins to a directory named `%2e%2e` and reads nothing
//! rather than escaping. So the decode decides **which file is found**, not **whether containment
//! holds** — which is why it can live on the screen while containment cannot. What the split does
//! cost is that [`resolve`] alone is not the CLI's rule: called with an undecoded `%2e%2e` it answers
//! `Ok` where the CLI answers 404. **Any second caller must decode first**, or move the decode here.
//!
//! **This module is the門, and the screen's classification is the second of the two** — the shape
//! doc-8 §9.3 already settled for the URL a 本文リンク hands to the OS, for the same reason: the value
//! comes from a file a person edited by hand, not from anything Atlas resolved.
//!
//! **What is deliberately *not* here is which extensions are drawable.** That is the 媒体型表
//! (`src/lib/markdown-image.ts`), and it lives on the screen side because the screen is what needs the
//! media type — a `Blob` has to declare one for SVG to render at all. Keeping the table there and the
//! bytes raw is what lets the response body stay `Raw` rather than becoming a JSON array of numbers,
//! which for one 80KB screenshot is about 370KB of text. Nothing is lost by the split: a reference
//! this module would resolve but the screen will not draw never reaches here.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// The one prefix a 本文画像 may use to name a 添付画像 (Backlog CLI v1.49.3).
const REFERENCE_PREFIX: &str = "/assets/";

/// The Backlog root's own directory for these files.
const ASSETS_DIR: &str = "assets";

/// 失敗理由符号 for one 添付画像 that was not read (decision-35 §3).
///
/// Three, not four: "the extension is not one we draw" is the screen's own judgement and never
/// reaches this module (see the module comment). `absent` and `unreadable` are spelled as the rest of
/// `wire.ts` spells them, so the same state reads the same way across payloads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "reason", rename_all = "camelCase")]
pub enum ImageRefusal {
    /// The reference does not name a file under `<backlog root>/assets/`: a missing prefix, a `..`
    /// anywhere in the remainder, or a join that leaves the directory. **Nothing was opened.**
    OutsideAssets,
    /// The reference resolved, and there is no file there.
    Absent,
    /// The file is there and the OS would not read it. `detail` beside this token is the OS's own
    /// description (decision-35 §5), so the screen shows that rather than a sentence written here.
    Unreadable,
}

/// Where a reference resolves under `backlog_root`, or why it does not.
///
/// Split out from [`read`] so the rule can be tested without a file on disk: every refusal but
/// [`ImageRefusal::Absent`] and [`ImageRefusal::Unreadable`] is decided here, with no I/O at all.
pub fn resolve(backlog_root: &Path, reference: &str) -> Result<PathBuf, ImageRefusal> {
    let Some(name) = reference.strip_prefix(REFERENCE_PREFIX) else {
        return Err(ImageRefusal::OutsideAssets);
    };
    // A substring test rather than a segment test, because that is what the CLI does — `a..b.png` is
    // refused there too. Copying the wider rule keeps the two tools agreeing on every input,
    // including the ones where the CLI is stricter than it needs to be.
    if name.contains("..") {
        return Err(ImageRefusal::OutsideAssets);
    }
    let assets = backlog_root.join(ASSETS_DIR);
    let resolved = assets.join(name);
    // Kept even though `..` is already gone: an absolute `name`, or a Windows drive-relative one,
    // makes `join` discard `assets` entirely rather than append to it.
    if !resolved.starts_with(&assets) {
        return Err(ImageRefusal::OutsideAssets);
    }
    Ok(resolved)
}

/// The bytes of one 添付画像, or why there are none.
///
/// The `String` beside a refusal is the OS's own description and is empty for the two that carry
/// their whole reason in the token (decision-35 §5).
pub fn read(backlog_root: &Path, reference: &str) -> Result<Vec<u8>, (ImageRefusal, String)> {
    let path = resolve(backlog_root, reference).map_err(|refusal| (refusal, String::new()))?;
    fs::read(&path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            (ImageRefusal::Absent, String::new())
        } else {
            (ImageRefusal::Unreadable, error.to_string())
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        PathBuf::from("/projects/atlas/backlog")
    }

    #[test]
    fn a_reference_resolves_under_the_roots_assets_directory() {
        assert_eq!(
            resolve(&root(), "/assets/TASK-82.png"),
            Ok(root().join("assets").join("TASK-82.png"))
        );
    }

    #[test]
    fn a_subdirectory_of_assets_resolves() {
        // The CLI joins the whole remainder, so `/assets/shots/a.png` is a file it serves.
        assert_eq!(
            resolve(&root(), "/assets/shots/a.png"),
            Ok(root().join("assets").join("shots").join("a.png"))
        );
    }

    #[test]
    fn anything_not_starting_with_the_prefix_is_outside() {
        for reference in [
            "assets/TASK-82.png",
            "./TASK-82.png",
            "../assets/TASK-82.png",
            "/other/TASK-82.png",
            "/assetsTASK-82.png",
            "",
        ] {
            assert_eq!(
                resolve(&root(), reference),
                Err(ImageRefusal::OutsideAssets),
                "{reference} resolved"
            );
        }
    }

    #[test]
    fn two_dots_anywhere_in_the_remainder_are_refused() {
        // Including the ones that would not escape: the CLI refuses these too, and a rule that is
        // stricter in one tool than the other is the divergence this copy exists to avoid.
        for reference in [
            "/assets/../../etc/passwd",
            "/assets/a/../b.png",
            "/assets/a..b.png",
            "/assets/..",
        ] {
            assert_eq!(
                resolve(&root(), reference),
                Err(ImageRefusal::OutsideAssets),
                "{reference} resolved"
            );
        }
    }

    #[test]
    fn an_absolute_remainder_does_not_escape_the_assets_directory() {
        // `Path::join` replaces rather than appends when handed an absolute path, so without the
        // prefix check below this would resolve to `/etc/passwd` with no `..` in sight.
        assert_eq!(
            resolve(&root(), "/assets//etc/passwd"),
            Err(ImageRefusal::OutsideAssets)
        );
    }

    #[test]
    fn a_file_that_is_not_there_is_absent_rather_than_unreadable() {
        let (refusal, detail) = read(&root(), "/assets/nothing-here.png").expect_err("resolved");
        assert_eq!(refusal, ImageRefusal::Absent);
        assert_eq!(detail, "", "an absent file has no OS description to show");
    }

    #[test]
    fn bytes_come_back_unchanged() {
        let dir = TempDir::new();
        fs::create_dir_all(dir.path.join(ASSETS_DIR)).expect("temp assets dir");
        // Every byte value, so a read that went through a string type anywhere would not survive.
        let bytes: Vec<u8> = (0u8..=255).collect();
        fs::write(dir.path.join(ASSETS_DIR).join("sample.png"), &bytes).expect("write sample");

        assert_eq!(read(&dir.path, "/assets/sample.png"), Ok(bytes));
    }

    #[test]
    fn a_file_outside_assets_is_refused_even_though_it_is_there() {
        let dir = TempDir::new();
        fs::create_dir_all(dir.path.join(ASSETS_DIR)).expect("temp assets dir");
        fs::write(dir.path.join("config.yml"), "secret").expect("write neighbour");

        assert_eq!(
            read(&dir.path, "/assets/../config.yml"),
            Err((ImageRefusal::OutsideAssets, String::new()))
        );
    }

    /// Minimal self-cleaning temp directory so tests need no `tempfile` dependency.
    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn new() -> Self {
            static CTR: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let n = CTR.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "atlas-body-image-test-{}-{nanos}-{n}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            TempDir { path }
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}
