//! 外部コマンド解決の順序 (decision-29) — which executable Atlas hands to `Command::new` for an
//! 外部コマンド whose automatic resolution is nothing more than the bare program name.
//!
//! ## Referent table (decision term → identifier here)
//!
//! Fixed before naming, following the ledger/read/update modules' convention.
//!
//! | term | here | is |
//! |---|---|---|
//! | decision-29 外部コマンド | [`ExternalProgram`], one value per command | a program Atlas launches that its own bundle does not contain |
//! | decision-29 外部コマンド指定 | [`ExternalProgram::configured`] | the executable's absolute path, as アプリ設定 holds it |
//! | decision-29 外部コマンド解決の順序 | [`ExternalProgram::program`] | the two steps: 外部コマンド指定, else the bare name |
//! | decision-29 解決結果の出どころ | [`ExternalProgramSource`] | which of the two steps produced the program in hand |
//!
//! ## Why this is not the Backlog CLI's resolution
//!
//! `backlog`'s 実行ファイル解決の順序 has three steps, and the middle one walks npm's package layout
//! on Windows (decision-16 順序 2). It stays in [`crate::update`] rather than being generalized to
//! here: decision-29 fixes that every 外部コマンド puts 外部コマンド指定 first, not that they share
//! one automatic step. `git` and `gh` have no npm layout to walk — nothing installs them through npm
//! — so their order is the two steps below and a third would be a step that can never fire.
//!
//! ## Why a blank 外部コマンド指定 is unset
//!
//! The value reaches アプリ設定 from a text field, so "cleared" arrives as an empty or whitespace-only
//! string rather than as an absent key. Treated as a path it would be handed to `Command::new` and
//! fail every launch, which is the one outcome no user can have meant by emptying the field. The
//! 外部エディタ指定 drops a blank `program` for the same reason (`EditorCommand::named`).
//!
//! ## What is *not* checked here
//!
//! A configured path is used as written: its existence is not tested and a missing one does not fall
//! back to the bare name. decision-16 fixed that rule for `backlog` and decision-29 keeps it for
//! every 外部コマンド — a fallback would turn a mistyped path into "some other program ran", which
//! is an error the user cannot see and therefore cannot correct.

use crate::subprocess::{self, Cancel};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

/// 解決結果の出どころ (decision-29): which step of the 外部コマンド解決の順序 produced the program
/// being used. Reported to the 設定画面 so the 解決結果の表示 can say where the value came from —
/// the whole point of that display is telling "Atlas is using what you typed" apart from "Atlas is
/// leaving it to the OS", and those two are indistinguishable from the program string alone when the
/// user configured the very path PATH would have found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExternalProgramSource {
    /// アプリ設定 の外部コマンド指定, used as written. The first step of every 外部コマンド's order.
    Configured,
    /// The プラットフォーム別実行ファイル reached from an npm shim's directory. **`backlog` only**
    /// (decision-16 順序 2) — nothing else Atlas launches installs through npm. It is in this
    /// enumeration rather than folded into `OnPath` because the two are different answers to the
    /// user's question: one says the OS found it, the other says Atlas walked npm's layout to it.
    SubPackage,
    /// The bare name, left for the OS to resolve on PATH. The last step of every order.
    OnPath,
}

/// One 外部コマンド and the 外部コマンド指定 in force for it (decision-29).
///
/// Resolution is pure and total: there is no filesystem access and no failure case, so a value can
/// be constructed in a test and asserted on any host. Whether the program actually exists is
/// answered where it is launched — by the spawn failing — which is also the only place that answer
/// stays true, since PATH and the filesystem may change between a probe and a launch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalProgram {
    /// The bare program name (順序 2). `'static` because the set of 外部コマンド is this build's,
    /// not the user's: a name from settings would be a way to run an arbitrary program under a
    /// fixed argument array Atlas chose for a different one.
    name: &'static str,
    configured: Option<PathBuf>,
}

impl ExternalProgram {
    /// doc-6 §3 コミット検索・§5 remote ホスト種別の判別 and doc-3 §3.2 Git remote 有無属性判定.
    pub const GIT: &'static str = "git";
    /// doc-6 §6 の GitHub 参照手段 (decision-14).
    pub const GH: &'static str = "gh";

    pub fn new(name: &'static str, configured: Option<&Path>) -> ExternalProgram {
        ExternalProgram {
            name,
            configured: configured
                .filter(|path| !path.as_os_str().is_empty())
                .filter(|path| !path.to_string_lossy().trim().is_empty())
                .map(Path::to_path_buf),
        }
    }

    pub fn git(configured: Option<&Path>) -> ExternalProgram {
        ExternalProgram::new(ExternalProgram::GIT, configured)
    }

    pub fn gh(configured: Option<&Path>) -> ExternalProgram {
        ExternalProgram::new(ExternalProgram::GH, configured)
    }

    /// The program `Command::new` receives — the whole of the 外部コマンド解決の順序.
    pub fn program(&self) -> &Path {
        match &self.configured {
            Some(path) => path,
            None => Path::new(self.name),
        }
    }

    pub fn source(&self) -> ExternalProgramSource {
        match self.configured {
            Some(_) => ExternalProgramSource::Configured,
            None => ExternalProgramSource::OnPath,
        }
    }

    pub fn name(&self) -> &'static str {
        self.name
    }

    /// A `Command` for the resolved program. Callers add their own fixed subcommand and argument
    /// array; nothing here builds a command line, so the AGENTS rule against shell strings holds by
    /// construction rather than by each caller remembering it.
    pub fn command(&self) -> Command {
        Command::new(self.program())
    }
}

/// 解決結果の表示 の 1 行 (decision-29): one 外部コマンド, what it resolved to, and whether that
/// program actually starts.
///
/// The launch is what makes this worth showing. TASK-156's defect is invisible from the resolution
/// alone — "`git`, left to the OS" reads identically whether PATH holds it or not — so a display
/// that stopped at [`ExternalProgram::program`] would restate the setting back to the user and still
/// not answer the question they came to the 設定画面 with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalProgramReport {
    pub name: String,
    /// What `Command::new` receives, as text. A `PathBuf` is shown, not tested for existence — the
    /// launch below is the test, and it is the only one that stays true (PATH and the filesystem may
    /// both change between a probe and a use).
    pub program: String,
    pub source: ExternalProgramSource,
    pub outcome: ProbeOutcome,
}

/// Whether the resolved program started (decision-29 解決結果の表示).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum ProbeOutcome {
    /// It ran and identified itself. `report` is the first line of its `--version` output, shown as
    /// written rather than parsed: this display says *which program answered*, and every version
    /// requirement Atlas actually enforces is `backlog`'s, checked by `update::probe` against
    /// `MIN_VERSION` (decision-7). Parsing a version here would be a second, unenforced opinion.
    Launched { report: String },
    /// It could not be started, or started and failed. This is TASK-156's symptom made visible.
    Failed {
        reason: ProbeFailure,
        detail: String,
    },
}

/// 失敗理由符号 (decision-35 §3) for a `--version` probe that did not report a version.
///
/// **The three are told apart by what was observed**, not by what the program wrote: a probe that
/// exited with an empty stderr and one that wrote a line are the same observation, and the screen
/// says the same thing about both — the line, when there is one, is added after that sentence rather
/// than replacing it. Deciding it here is what keeps one 失敗理由符号 from having two sentences.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "reason", rename_all = "camelCase")]
pub enum ProbeFailure {
    /// The program could not be started. Names it, because the errno alone does not say which one
    /// was not found and that is the whole content of the answer here.
    SpawnFailed { program: String },
    /// It ran and exited unsuccessfully. Its first stderr line is the `detail`, and may be empty.
    Exited,
    /// The bounded wait ended without it answering. Whatever the wait noticed is the `detail`, and
    /// is usually empty.
    NoResponse,
}

/// How long one 解決結果の表示 probe may take. Far below doc-5 §5's 30-second CLI 終了期限, because
/// this one is not an operation the user asked for — it fills a panel, and three of them run when the
/// 設定画面 opens. A `--version` that has not answered in five seconds has already told the user what
/// the panel needs to say.
const PROBE_DEADLINE: Duration = Duration::from_secs(5);

/// Run `<program> --version` and report what happened (decision-29 解決結果の表示).
///
/// `--version` is the one argument every 外部コマンド here accepts, writes nothing for, and exits 0
/// from. The launch goes through [`subprocess::launch`] like every other external program Atlas
/// starts, so the wait is bounded by the same mechanism rather than by a second one written here
/// (decision-18's reason for that module).
pub fn probe(command: &ExternalProgram) -> ExternalProgramReport {
    probe_program(command.name(), command.program(), command.source())
}

/// The same probe against a program some other order resolved — `backlog`'s (doc-5 §4), whose three
/// steps live in [`crate::update`]. Split out rather than making that order produce an
/// [`ExternalProgram`]: its middle step has no counterpart here, and a type that could hold it would
/// be a shape `git` and `gh` can never take.
pub fn probe_program(
    name: &str,
    program: &Path,
    source: ExternalProgramSource,
) -> ExternalProgramReport {
    let mut spawn = Command::new(program);
    spawn.arg("--version");
    // `gh` would otherwise reach the network for its update notice and print it into the output this
    // panel shows — the same two variables doc-6 §6's 照会 sets, for the same reason.
    spawn.env("GH_PROMPT_DISABLED", "1");
    spawn.env("GH_NO_UPDATE_NOTIFIER", "1");
    let outcome = match subprocess::launch(&mut spawn, PROBE_DEADLINE, &Cancel::new()) {
        Ok(completed) if completed.status.success() => ProbeOutcome::Launched {
            report: first_line(&completed.stdout),
        },
        Ok(completed) => ProbeOutcome::Failed {
            reason: ProbeFailure::Exited,
            detail: first_line(&completed.stderr),
        },
        Err(subprocess::Stopped::Spawn(e)) => ProbeOutcome::Failed {
            reason: ProbeFailure::SpawnFailed {
                program: program.display().to_string(),
            },
            detail: e.to_string(),
        },
        Err(subprocess::Stopped::Ended { detail }) => ProbeOutcome::Failed {
            reason: ProbeFailure::NoResponse,
            detail: detail.unwrap_or_default(),
        },
    };
    ExternalProgramReport {
        name: name.to_string(),
        program: program.display().to_string(),
        source,
        outcome,
    }
}

fn first_line(text: &str) -> String {
    text.lines().next().unwrap_or_default().trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unset_指定_leaves_the_bare_name_for_the_os() {
        let git = ExternalProgram::git(None);
        assert_eq!(git.program(), Path::new("git"));
        assert_eq!(git.source(), ExternalProgramSource::OnPath);
    }

    #[test]
    fn a_configured_指定_is_used_as_written() {
        let path = PathBuf::from("/opt/homebrew/bin/gh");
        let gh = ExternalProgram::gh(Some(&path));
        assert_eq!(gh.program(), path);
        assert_eq!(gh.source(), ExternalProgramSource::Configured);
    }

    /// The path is taken as written even when nothing is there: decision-16's rule, kept by
    /// decision-29 for every 外部コマンド. A fallback here is what would hide a typo.
    #[test]
    fn a_指定_naming_nothing_does_not_fall_back() {
        let missing = PathBuf::from("/nowhere/at/all/git");
        let git = ExternalProgram::git(Some(&missing));
        assert_eq!(git.program(), missing);
        assert_eq!(git.source(), ExternalProgramSource::Configured);
    }

    #[test]
    fn a_blank_指定_counts_as_unset() {
        for blank in ["", " ", "\t", "\n  "] {
            let path = PathBuf::from(blank);
            let git = ExternalProgram::git(Some(&path));
            assert_eq!(
                git.program(),
                Path::new("git"),
                "{blank:?} should read as unset"
            );
            assert_eq!(git.source(), ExternalProgramSource::OnPath);
        }
    }
}
