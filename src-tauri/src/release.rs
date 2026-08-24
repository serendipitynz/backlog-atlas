//! 版の告知 (decision-44) — whether a newer Atlas release is published, and where its page is.
//!
//! ## Referent table (decision term → identifier here)
//!
//! Fixed before naming, following the ledger/read/update modules' convention.
//!
//! | term | here | is |
//! |---|---|---|
//! | decision-44 利用中の版 | [`RUNNING_VERSION`] | the version this build itself carries |
//! | decision-44 公開されている版 | the tag [`lookup`] reads | the tag of the one release `releases/latest` answers with |
//! | decision-44 新しい版 | [`ReleaseNotice`] | 公開されている版 when it is strictly above 利用中の版, and that value |
//! | decision-44 版照会 | [`lookup`] | one `gh` launch that asks for that tag |
//! | decision-44 照会の縮退 | [`lookup`] returning `None` | the 照会 answered with no 公開されている版 |
//! | decision-44 リリース置き場 | [`RELEASE_OWNER`] / [`RELEASE_REPO`] | the owner/repo both the 照会 and the page are built from |
//! | decision-44 リリースページ | [`releases_url`] | the URL 版の告知 opens in the default browser |
//!
//! ## Why `None` covers two different things
//!
//! Both 照会の縮退 and "the published release is the one already running" return `None`, and the
//! difference is deliberately not on the wire: the screen draws the same nothing for either, so a
//! value carrying which one it was could only be a value nobody may use.
//!
//! ## Why the page's URL is not read from the response
//!
//! `releases/latest` answers with an `html_url` as well as a tag, and it is not read. The URL handed
//! to the default browser is built from the two constants below instead, so no string that arrived
//! over the network reaches a launcher.

use crate::external::{self, ExternalProgram};
use crate::history::GH_DEADLINE;
use crate::subprocess::{self, Cancel};
use crate::update::Version;
use serde::Serialize;
use std::time::Duration;

/// 利用中の版 (decision-44): the version of the crate this binary was built from — one of the four
/// places doc-13 §3.1 checks a tag against, and the only one that reaches a running process.
const RUNNING_VERSION: &str = env!("CARGO_PKG_VERSION");

/// リリース置き場 (decision-44 §4). This build's, not the user's: neither アプリ設定 nor the ledger
/// holds it, because a 版の告知 is about the program the user is running and not about anything they
/// registered.
const RELEASE_OWNER: &str = "serendipitynz";
const RELEASE_REPO: &str = "backlog-atlas";

/// 新しい版 (decision-44), as the screen receives it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNotice {
    /// 公開されている版, without the tag's leading `v` — a version value, not a tag.
    pub version: String,
}

/// リリースページ (decision-44 §4): the listing, not the newest release's own page. The menu line
/// that opens it is there whether or not a 新しい版 exists, so a URL naming one release would be
/// wrong exactly when there is none.
pub fn releases_url() -> String {
    format!("https://github.com/{RELEASE_OWNER}/{RELEASE_REPO}/releases")
}

/// 版照会 (decision-44 §1): ask for 公開されている版 and answer whether it is a 新しい版.
///
/// The launch is decision-14's — a fixed argument array, `--hostname` so a user's `GH_HOST` cannot
/// redirect it, `--jq` so no JSON parser is needed here — and the wait is decision-19's bound through
/// [`subprocess`]. `--paginate` is absent because `releases/latest` answers with a single object
/// rather than a page of them. Read-only: `gh api` defaults to GET.
///
/// Nothing here is cancellable. The [`Cancel`] is constructed and kept, which is the module's own
/// documented shape for a caller with nothing to cancel: no clone escapes, so the deadline is the
/// only bound. 履歴読取の取消 exists because a screen stops wanting a PR's commits when it moves on
/// (decision-19); a 版照会 has no screen waiting on it — the answer is read whenever it arrives.
pub fn lookup(gh: &ExternalProgram) -> Option<ReleaseNotice> {
    lookup_within(gh, GH_DEADLINE)
}

/// The same 照会 against a chosen bound. **Private**: decision-19 fixes the deadline at
/// [`GH_DEADLINE`], and a production caller able to pass another value would be a second opinion about
/// it. It exists so a test can reach 照会期限到達 without waiting thirty seconds for it.
fn lookup_within(gh: &ExternalProgram, deadline: Duration) -> Option<ReleaseNotice> {
    let mut command = gh.command();
    command.args([
        "api",
        "--hostname",
        "github.com",
        "--jq",
        ".tag_name",
        &format!("repos/{RELEASE_OWNER}/{RELEASE_REPO}/releases/latest"),
    ]);
    external::quiet_gh(&mut command);
    let completed = subprocess::launch(&mut command, deadline, &Cancel::new()).ok()?;
    if !completed.status.success() {
        return None;
    }
    notice_for(completed.stdout.lines().next()?)
}

/// Whether a tag names a 新しい版 (decision-44). Split from the launch so the comparison is testable
/// without a `gh` on the host.
///
/// The tag is parsed with the same [`Version`] the CLI probe uses, which tolerates the leading `v`
/// and treats a trailing non-numeric part as absent. A prerelease tag would therefore compare as its
/// release, and cannot arrive here: `releases/latest` excludes drafts and prereleases.
fn notice_for(tag: &str) -> Option<ReleaseNotice> {
    let published = Version::parse(tag)?;
    let running = Version::parse(RUNNING_VERSION)?;
    if published > running {
        Some(ReleaseNotice {
            version: published.to_string(),
        })
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn bump_major() -> String {
        let running = Version::parse(RUNNING_VERSION).unwrap();
        format!("v{}.0.0", running.major + 1)
    }

    /// Derived from [`RUNNING_VERSION`] rather than spelled, for decision-27 §1's reason: a literal
    /// here would keep passing after the release that made it the version being run.
    #[test]
    fn a_tag_above_the_running_version_is_a_新しい版() {
        let notice = notice_for(&bump_major()).unwrap();
        assert_eq!(notice.version, bump_major().trim_start_matches('v'));
    }

    #[test]
    fn the_running_version_is_not_a_新しい版() {
        assert_eq!(notice_for(RUNNING_VERSION), None);
        assert_eq!(notice_for(&format!("v{RUNNING_VERSION}")), None);
    }

    #[test]
    fn a_tag_below_the_running_version_is_not_a_新しい版() {
        assert_eq!(notice_for("v0.0.1"), None);
    }

    /// A tag Atlas cannot compare is not a 新しい版. `gh` writes its own notices to stderr, but a
    /// `--jq` that matched nothing leaves stdout with something that is not a version.
    #[test]
    fn a_tag_that_does_not_parse_is_not_a_新しい版() {
        for tag in ["", "null", "latest", "v"] {
            assert_eq!(
                notice_for(tag),
                None,
                "{tag:?} should not announce a version"
            );
        }
    }

    /// リリースページ is the listing (decision-44 §4), built from the two constants and never from a
    /// response.
    #[test]
    fn the_リリースページ_is_the_listing_under_the_release_置き場() {
        assert_eq!(
            releases_url(),
            format!("https://github.com/{RELEASE_OWNER}/{RELEASE_REPO}/releases")
        );
    }

    /// 版照会 against a program standing in for `gh`: the launch runs, the answer on stdout becomes
    /// 公開されている版, and output past the tag does not change it.
    ///
    /// **It does not hold that only the first line is read.** Reading the whole of stdout instead
    /// passes this too, because [`Version::parse`] takes the leading whitespace-delimited token —
    /// which is why the claim here is about the answer and not about which slice produced it.
    ///
    /// Unix only, because writing an executable that ignores its arguments is the shell's business
    /// and a Windows equivalent could not be run on this host. What is under test is
    /// platform-independent; only the way to stand in for `gh` is not — the same split
    /// `update.rs` states for its descendant test.
    #[cfg(unix)]
    #[test]
    fn the_版照会_answers_with_the_tag_the_照会_wrote() {
        let dir = TempDir::new();
        let tag = bump_major();
        let gh = fake_gh(
            &dir,
            &format!("echo {tag}\necho ignored-second-line\nexit 0"),
        );
        assert_eq!(
            lookup(&gh),
            Some(ReleaseNotice {
                version: tag.trim_start_matches('v').to_string()
            })
        );
    }

    /// 照会の縮退 (decision-44 §5): a `gh` that ran and failed announces nothing, and what it wrote
    /// on stdout is not read as a tag. A tag on stdout with a non-zero exit is the case that tells
    /// the status gate apart from the parse.
    #[cfg(unix)]
    #[test]
    fn a_照会_that_exits_unsuccessfully_announces_nothing() {
        let dir = TempDir::new();
        let gh = fake_gh(&dir, &format!("echo {}\nexit 4", bump_major()));
        assert_eq!(lookup(&gh), None);
    }

    /// 照会の縮退: 照会期限到達 (decision-19). The bound ends the wait and the 照会 announces nothing —
    /// the same `None` every other 縮退 produces, which is decision-44 §5's point.
    ///
    /// The deadline is the test's rather than [`GH_DEADLINE`], so this takes a fraction of a second
    /// instead of thirty. What that costs is stated rather than hidden: **this holds that the bound
    /// ending the wait yields `None`, not that the bound is 30 seconds** — the value is decision-19's
    /// and `lookup` is the only thing that names it.
    #[cfg(unix)]
    #[test]
    fn a_照会_that_outlives_its_deadline_announces_nothing() {
        let dir = TempDir::new();
        let gh = fake_gh(&dir, &format!("sleep 5\necho {}", bump_major()));
        assert_eq!(lookup_within(&gh, Duration::from_millis(150)), None);
    }

    /// 照会の縮退: `gh` 不在. A 外部コマンド指定 naming nothing does not fall back (decision-16,
    /// kept by decision-29), so this is the shape of a host without `gh` as well.
    #[test]
    fn a_照会_that_cannot_start_announces_nothing() {
        let missing = PathBuf::from("/nowhere/at/all/gh");
        assert_eq!(lookup(&ExternalProgram::gh(Some(&missing))), None);
    }

    /// An executable that answers whatever `body` writes, whatever arguments it is handed. Reached
    /// as a 外部コマンド指定, which decision-29 puts first in every 外部コマンド解決の順序.
    #[cfg(unix)]
    fn fake_gh(dir: &TempDir, body: &str) -> ExternalProgram {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.path.join("gh");
        fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        ExternalProgram::gh(Some(&path))
    }

    /// Minimal self-cleaning temp directory so tests need no `tempfile` dependency, as
    /// `body_image.rs` and `commands.rs` each hold one.
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
                "atlas-release-test-{}-{nanos}-{n}",
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
