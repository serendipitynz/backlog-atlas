//! Git・Pull Request 履歴参照系 — a task id → (commits, pull requests, and, when the remote
//! supports it, their relation). Implements doc-6 "タスクID からの Git・Pull Request 履歴参照".
//!
//! Read-only by construction (doc-6 §2): every Git touch here reads. Nothing commits, rewrites,
//! pushes, or edits managed Markdown. All Git access uses `std::process::Command` with a fixed
//! subcommand and an argument *array*, never a shell string — the same invariant the ledger's
//! `detect_git_remote` follows and AGENTS §"Git and Pull Request references" requires (AC #5).
//!
//! The layer is split along doc-6's own seams so the remote-dependent parts degrade
//! independently of the remote-independent ones (doc-6 §6, AC #4):
//!
//! - [`search_commits`] (§3) and [`extract_pull_requests`] (§4) need no remote. Local commit
//!   history is available whenever `project_root` is a Git repo, remote or not; PR URLs come
//!   from the task's own References.
//! - [`detect_remote_host`] (§5) and [`resolve_relations`] (§6) are remote-dependent. Relation
//!   resolution runs only when a remote host kind was actually determined, which by construction
//!   requires `git_remote_present` to be true (AC #3).
//!
//! doc-6 §6 fixes only the *structure* of relation resolution — "pick the reference means by
//! remote host kind" — and leaves each host's concrete means (its API, auth, rate, offline
//! behavior) to be added per kind. The fetch of a PR's commit set is therefore an injected
//! [`PrCommitSource`], so the gating and the local⇄remote commit matching stay testable without a
//! network. [`HostReferences`] is the production implementation: it dispatches on the target's
//! host kind and, for GitHub, asks the `gh` CLI (decision-14).

use crate::ledger::ProjectEntry;
use serde::Serialize;
use std::path::Path;
use std::process::Command;

/// A remote host kind judged from a Git remote URL's host, or from a Pull Request URL's host
/// (doc-6 §1, §5). Only kinds Atlas can act on are named; an unrecognized host yields `None`
/// at the call sites rather than a variant here, which is what keeps relation resolution off
/// for hosts we cannot reference (AC #3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RemoteHostKind {
    GitHub,
}

/// One commit found by コミット検索 (doc-6 §3 "結果"): identifier, summary, date, author. `id`
/// is the full SHA (the stable key relation resolution matches on); `short_id` is git's
/// abbreviation for display.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    /// Author date in strict ISO 8601 (`%aI`).
    pub date: String,
    pub author: String,
}

/// A Pull Request URL selected from a task's References by the PR URL 抽出規則 (doc-6 §4).
/// `host`/`owner`/`repo`/`number` are filled when the URL's shape makes them decidable; a
/// generically-matched URL may carry only `number`, or none of them. The raw `url` is always
/// kept verbatim — this layer never rewrites References (doc-6 §4 "本層は URL を書き換えない").
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestRef {
    pub url: String,
    /// The URL's own host kind when recognized, else `None` (matched by the generic PR path form).
    pub host: Option<RemoteHostKind>,
    pub owner: Option<String>,
    pub repo: Option<String>,
    pub number: Option<u64>,
}

/// A determined remote host for the owning project (doc-6 §5): the kind plus the `owner`/`repo`
/// normalized out of the remote URL (SSH or HTTPS). Produced only when `git_remote_present` is
/// true and the host kind is recognized — its `Some` is the precondition for relation
/// resolution (AC #3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteHost {
    pub kind: RemoteHostKind,
    pub owner: String,
    pub repo: String,
}

/// The per-Pull-Request result of relation resolution (doc-6 §6). One entry per extracted PR so
/// the display layer sees every PR's state, not just the ones with a hit — [`RelationOutcome`]
/// keeps "resolved with no shared commit", "host we cannot reference", and "lookup failed" apart,
/// which doc-6 §6 requires the UI to distinguish from コミット不在 / Git 対象不在 / remote 不在.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrRelation {
    pub pull_request: String,
    pub outcome: RelationOutcome,
}

/// What became of one PR during relation resolution (doc-6 §6). Serialized with a `state` tag,
/// mirroring [`crate::domain::TaskHealth`], so the frontend switches on one field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum RelationOutcome {
    /// The PR was queried at its own coordinates and its commit set intersected with the task's
    /// local commits. `commit_ids` (full SHAs from [`search_commits`]) may be empty — a *resolved*
    /// state meaning "no shared commit", not a failure (doc-6 §6 "取得成功だが関連なし").
    // The enum-level rename_all camelCases only the variant tags, not struct-variant fields, so
    // `commit_ids` needs its own rename to reach the wire as `commitIds` (doc-4 §3.1 camelCase
    // contract); this mirrors how `DegradeEvent`'s variants are annotated in `domain`.
    #[serde(rename_all = "camelCase")]
    Resolved { commit_ids: Vec<String> },
    /// The PR's host is not a kind Atlas can reference (or its coordinates were incomplete), so it
    /// is excluded from resolution and shown independently (doc-6 §6 "判別できないホストは…対象外").
    HostUnsupported,
    /// The reference means failed (network / auth / offline). This is 関連解決不能 — kept distinct
    /// from a resolved-but-empty result and from the PR's target not existing (doc-6 §6 "参照不能").
    LookupFailed { detail: String },
}

/// Why a Git read could not produce a commit list. Kept distinct from an *empty* list because
/// doc-6 §3/§6 separate 該当なし (repo present, no matching commit → `Ok(vec![])`) from 対象不在
/// (`project_root` is not a Git repo → [`NotAGitRepo`](HistoryError::NotAGitRepo)); the display
/// layer (TASK-13) must tell those apart.
#[derive(Debug)]
pub enum HistoryError {
    /// The `git` binary could not be spawned (not on PATH / not executable).
    GitUnavailable(std::io::Error),
    /// `project_root` is not inside a Git repository (Git 対象不在, doc-6 §6).
    NotAGitRepo,
    /// A Git command ran but failed for another reason; carries stderr for diagnosis.
    CommandFailed { args: Vec<String>, stderr: String },
}

impl std::fmt::Display for HistoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HistoryError::GitUnavailable(e) => write!(f, "git is unavailable: {e}"),
            HistoryError::NotAGitRepo => write!(f, "project root is not a Git repository"),
            HistoryError::CommandFailed { args, stderr } => {
                write!(f, "git {} failed: {}", args.join(" "), stderr.trim())
            }
        }
    }
}

impl std::error::Error for HistoryError {}

// --- コミット検索 (doc-6 §3) --------------------------------------------------------------------

// Field separator inside one `git log` record. ASCII Unit Separator: it cannot appear in a
// hash, an ISO date, a git author name, or a subject line, so splitting on it is unambiguous.
const FIELD_SEP: char = '\u{1f}';

/// Search the owning project's repository for commits whose message contains the bare `task_id`
/// (doc-6 §3). Runs `git log` with `project_root` as the working directory (`-C`), a fixed
/// argument array, and `task_id` passed as one array element — never concatenated into a shell
/// string (AC #5). Results are newest-first (git log's default order, doc-6 §3).
///
/// Two-stage matching keeps the boundary rule authoritative and portable: `--grep --fixed-strings`
/// asks git for a cheap case-insensitive *substring* superset, then [`message_mentions_task_id`]
/// applies the word-boundary rule in Rust so `TASK-1` never picks up `TASK-12` (doc-6 §3 "誤検出
/// の抑制", AC #1). Doing the boundary in Rust avoids depending on git's regex-newline semantics.
///
/// Returns `Ok(vec![])` when the repo exists but nothing matches (該当なし). A `project_root`
/// that is not a Git repo yields [`HistoryError::NotAGitRepo`]; an empty repo (no commits yet)
/// is still a repo and yields `Ok(vec![])`.
pub fn search_commits(project_root: &Path, task_id: &str) -> Result<Vec<Commit>, HistoryError> {
    // Preflight: distinguish 対象不在 from 該当なし without parsing locale-dependent stderr.
    if !is_git_repo(project_root)? {
        return Err(HistoryError::NotAGitRepo);
    }
    // An initialized-but-empty repo has no HEAD; `git log` would fail there. Treat "no commits"
    // as an empty result, not a failure — the repo exists (対象は在る), it just has no history.
    if !has_any_commit(project_root)? {
        return Ok(Vec::new());
    }

    // %H full sha, %h abbrev, %an author, %aI author-date (ISO 8601), %s subject. Records are
    // NUL-terminated (`-z`) so a subject can never be confused with a record boundary; fields
    // within a record are FIELD_SEP-joined. `--fixed-strings` makes `task_id` a literal, so no
    // regex metacharacter in it (or in a custom task prefix) can change the match.
    let format = format!("%H{FIELD_SEP}%h{FIELD_SEP}%an{FIELD_SEP}%aI{FIELD_SEP}%s");
    let args = vec![
        "log".to_string(),
        "-z".to_string(),
        format!("--format={format}"),
        "--fixed-strings".to_string(),
        "--regexp-ignore-case".to_string(),
        format!("--grep={task_id}"),
    ];
    let out = run_git(project_root, &args)?;
    if !out.status.success() {
        return Err(HistoryError::CommandFailed {
            args,
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        });
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut commits = Vec::new();
    for record in stdout.split('\0') {
        if record.is_empty() {
            continue;
        }
        let mut fields = record.splitn(5, FIELD_SEP);
        let (Some(id), Some(short_id), Some(author), Some(date), Some(summary)) = (
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
        ) else {
            // A record that does not split into the five requested fields is malformed; skip it
            // rather than surface a half-built commit.
            continue;
        };
        // Authoritative boundary filter: git's substring superset is narrowed here so the
        // TASK-1 / TASK-12 mix-up cannot survive (AC #1). The subject alone is enough because
        // git matched the *whole* message; a body-only match still made git include the record,
        // and we then require the boundary hit somewhere in the subject OR keep it if git matched
        // the body. To stay correct for body-only mentions we re-run git for the raw body only
        // when the subject does not satisfy the boundary.
        if message_mentions_task_id(summary, task_id)
            || commit_body_mentions_task_id(project_root, id, task_id)?
        {
            commits.push(Commit {
                id: id.to_string(),
                short_id: short_id.to_string(),
                summary: summary.to_string(),
                date: date.to_string(),
                author: author.to_string(),
            });
        }
    }
    Ok(commits)
}

/// Whether `project_root` is inside a Git work tree. A spawn failure (git missing) is a hard
/// [`HistoryError::GitUnavailable`]; a non-zero exit means "not a repo" → `Ok(false)`.
fn is_git_repo(project_root: &Path) -> Result<bool, HistoryError> {
    let out = run_git(
        project_root,
        &["rev-parse".to_string(), "--git-dir".to_string()],
    )?;
    Ok(out.status.success())
}

/// Whether the repo has at least one commit (a resolvable HEAD). Uses `rev-parse --verify HEAD`,
/// which fails quietly on an empty repo — a locale-independent "has history?" probe.
fn has_any_commit(project_root: &Path) -> Result<bool, HistoryError> {
    let out = run_git(
        project_root,
        &[
            "rev-parse".to_string(),
            "--verify".to_string(),
            "--quiet".to_string(),
            "HEAD".to_string(),
        ],
    )?;
    Ok(out.status.success())
}

/// Fetch one commit's raw body (`%B`) and apply the boundary rule to it. Used only as a fallback
/// when the subject did not satisfy the boundary, so a TASK-ID mentioned only in a commit's body
/// is still honored (git matched the whole message; we must not drop a body-only match).
fn commit_body_mentions_task_id(
    project_root: &Path,
    commit_id: &str,
    task_id: &str,
) -> Result<bool, HistoryError> {
    let out = run_git(
        project_root,
        &[
            "log".to_string(),
            "-1".to_string(),
            "--format=%B".to_string(),
            commit_id.to_string(),
        ],
    )?;
    if !out.status.success() {
        return Ok(false);
    }
    let body = String::from_utf8_lossy(&out.stdout);
    Ok(message_mentions_task_id(&body, task_id))
}

/// Word-boundary membership of `task_id` in `message` (doc-6 §3 "誤検出の抑制", AC #1).
/// Case-insensitive (commit messages historically write `TASK-N` while a default `config.yml`
/// carries `task_prefix: "task"`, doc-4 §3.1). A match requires the char before the id to not be
/// ASCII-alphanumeric (a real left boundary), and the char after the id to not be an ASCII
/// *digit* — the trailing-digit rule that stops `TASK-1` from matching inside `TASK-12` (doc-6
/// §3). The trailing side rejects only digits, not all word chars, so `TASK-12:` or `TASK-12 done`
/// still match while `TASK-120` does not.
pub fn message_mentions_task_id(message: &str, task_id: &str) -> bool {
    if task_id.is_empty() {
        return false;
    }
    let hay = message.as_bytes();
    let needle = task_id.as_bytes();
    let mut i = 0;
    while i + needle.len() <= hay.len() {
        if hay[i..i + needle.len()].eq_ignore_ascii_case(needle) {
            let left_ok = i == 0 || !hay[i - 1].is_ascii_alphanumeric();
            let after = i + needle.len();
            let right_ok = after >= hay.len() || !hay[after].is_ascii_digit();
            if left_ok && right_ok {
                return true;
            }
        }
        i += 1;
    }
    false
}

// --- PR URL 抽出規則 (doc-6 §4) -----------------------------------------------------------------

/// Select Pull Request URLs from a task's References (doc-6 §4). Every URL whose host+path form
/// is a Pull Request is kept — multiple PRs are never rounded to one (doc-6 §4 "複数 PR", AC #2).
/// A recognized host (GitHub) is judged by its typed path form; an unrecognized host falls back
/// to the generic PR path form (`.../pull/<n>`, `.../pull-requests/<id>`). URLs that satisfy
/// neither are not returned — they stay ordinary references, judged elsewhere.
pub fn extract_pull_requests(references: &[String]) -> Vec<PullRequestRef> {
    references
        .iter()
        .filter_map(|url| parse_pull_request(url))
        .collect()
}

/// Try to read one URL as a Pull Request reference. Returns `None` for a non-PR URL.
fn parse_pull_request(url: &str) -> Option<PullRequestRef> {
    let parts = split_url(url)?;
    let host_kind = host_kind_of(parts.host);
    let segments: Vec<&str> = parts.path.split('/').filter(|s| !s.is_empty()).collect();

    match host_kind {
        // GitHub typed form: /<owner>/<repo>/pull/<number> (doc-6 §4 example). owner/repo are
        // the two segments before the `pull` marker, so it must sit at index >= 2.
        Some(RemoteHostKind::GitHub) => {
            let pos = segments.iter().position(|s| *s == "pull")?;
            if pos < 2 {
                return None;
            }
            let number = segments.get(pos + 1).and_then(|s| s.parse::<u64>().ok())?;
            Some(PullRequestRef {
                url: url.to_string(),
                host: host_kind,
                owner: Some(segments[pos - 2].to_string()),
                repo: Some(segments[pos - 1].to_string()),
                number: Some(number),
            })
        }
        // Generic form: a `pull` / `pull-requests` marker segment followed by a numeric id
        // (doc-6 §4 "緩く判定"). owner/repo are taken from the two segments before the marker
        // when present, otherwise left unresolved.
        None => {
            let pos = segments
                .iter()
                .position(|s| *s == "pull" || *s == "pull-requests")?;
            let number = segments.get(pos + 1).and_then(|s| s.parse::<u64>().ok())?;
            let owner = (pos >= 2).then(|| segments[pos - 2].to_string());
            let repo = (pos >= 1).then(|| segments[pos - 1].to_string());
            Some(PullRequestRef {
                url: url.to_string(),
                host: None,
                owner,
                repo,
                number: Some(number),
            })
        }
    }
}

// --- remote ホスト種別の判別 (doc-6 §5) ---------------------------------------------------------

/// Determine the owning project's remote host (doc-6 §5). Returns `None` — so relation
/// resolution never runs (AC #3) — when `git_remote_present` is false, when no remote URL can be
/// read, or when the host is not a kind Atlas recognizes. The remote URL is read with a fixed
/// argument array (AC #5). SSH (`git@github.com:owner/repo.git`) and HTTPS forms both normalize
/// to the same `owner`/`repo`.
pub fn detect_remote_host(entry: &ProjectEntry) -> Option<RemoteHost> {
    // git_remote_present is the ledger's recorded fact (doc-3 §3.2); honoring it here is the
    // AC #3 gate and also avoids a Git call when there is provably no remote.
    if !entry.git_remote_present {
        return None;
    }
    let remote = pick_remote_name(&entry.project_root)?;
    let out = run_git(
        &entry.project_root,
        &["remote".to_string(), "get-url".to_string(), remote],
    )
    .ok()?;
    if !out.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&out.stdout).trim().to_string();
    parse_remote_url(&url)
}

/// Choose which remote to read: `origin` when present, else the first configured remote. `None`
/// when the repo has no remotes (or Git is unavailable — treated as "no host" here, since
/// detection is best-effort and the caller degrades to remote-independent output).
fn pick_remote_name(project_root: &Path) -> Option<String> {
    let out = run_git(project_root, &["remote".to_string()]).ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let names = || text.lines().map(str::trim).filter(|l| !l.is_empty());
    if names().any(|l| l == "origin") {
        Some("origin".to_string())
    } else {
        names().next().map(str::to_string)
    }
}

/// Parse a remote URL into a [`RemoteHost`] when its host is a recognized kind (doc-6 §5).
/// Handles scp-like SSH (`git@host:owner/repo.git`), `ssh://`/`https://`/`http://` forms, and a
/// trailing `.git`. Returns `None` for an unrecognized host or an unparseable owner/repo pair.
fn parse_remote_url(url: &str) -> Option<RemoteHost> {
    let (host, path) = if let Some(rest) = url.strip_prefix("git@") {
        // scp-like: git@github.com:owner/repo(.git)
        let (host, path) = rest.split_once(':')?;
        (host, path)
    } else {
        let parts = split_url(url)?;
        (parts.host, parts.path)
    };
    let kind = host_kind_of(host)?;
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let owner = segments.first()?;
    let repo = segments.get(1)?.trim_end_matches(".git");
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some(RemoteHost {
        kind,
        owner: (*owner).to_string(),
        repo: repo.to_string(),
    })
}

// --- コミット・PR 関連解決 (doc-6 §6) -----------------------------------------------------------

/// Errors from fetching a PR's commit set from a remote host. The concrete source (network,
/// auth, offline) is per-host and injected, so this is deliberately opaque here.
#[derive(Debug)]
pub struct RelationError(pub String);

impl std::fmt::Display for RelationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "pull request commit lookup failed: {}", self.0)
    }
}

impl std::error::Error for RelationError {}

/// One Pull Request's own coordinates, taken from the extracted PR URL (doc-6 §6 "抽出した Pull
/// Request URL から owner/repo と PR 番号を得て"). This — not the owning project's remote — is what
/// a PR is queried by, so a reference to a fork or a different repo is looked up where it actually
/// lives rather than against the project's remote.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PullRequestTarget {
    pub host: RemoteHostKind,
    pub owner: String,
    pub repo: String,
    pub number: u64,
}

/// The remote-host reference means for relation resolution (doc-6 §6). The concrete implementation
/// is chosen by the target's `host` kind — the one structural point doc-6 §6 fixes. The GitHub
/// network implementation is a later, per-kind addition (with its own dependency decision), which
/// is why this is a trait rather than a hardcoded HTTP call.
pub trait PrCommitSource {
    /// The commit SHAs that belong to the Pull Request named by `target`. Read-only.
    fn commits_for_pull_request(
        &self,
        target: &PullRequestTarget,
    ) -> Result<Vec<String>, RelationError>;
}

/// Entry point for commit⇄PR relation resolution with the AC #3 gate enforced (doc-6 §5, §6).
/// Resolution runs only when the owning project's remote host is determined — `remote` is the
/// [`detect_remote_host`] result, whose `Some` already means `git_remote_present` is true *and* the
/// host kind is recognized. When the gate fails, `source` is never consulted and an empty list is
/// returned: the task's commits and Pull Requests stay independent (doc-6 §6 縮退, AC #3/#4). This —
/// not [`resolve_relations`] — is the callable path, so the gate cannot be bypassed. When the gate
/// passes, each PR is resolved at its own coordinates.
///
/// The gate is taken as a value rather than re-derived from the [`ProjectEntry`] because the caller
/// displaying the 関連解決の状態 needs the same `RemoteHost` (doc-8 §5); deriving it twice would spawn
/// a second `git remote` read per history load and let the two answers disagree mid-read.
pub fn resolve_task_relations(
    remote: Option<&RemoteHost>,
    commits: &[Commit],
    pull_requests: &[PullRequestRef],
    source: &dyn PrCommitSource,
) -> Vec<PrRelation> {
    // `None` covers both a missing remote (git_remote_present false — no Git call was even made)
    // and an unrecognized host kind.
    if remote.is_none() {
        return Vec::new();
    }
    resolve_relations(commits, pull_requests, source)
}

/// Resolve commit⇄PR relations against the local commits (doc-6 §6). Private on purpose: the AC #3
/// project-remote gate lives in [`resolve_task_relations`], the only public path, so this cannot be
/// reached with the gate unchecked. Each PR is queried at *its own* coordinates
/// ([`PullRequestTarget`]), not the project's remote, so a reference to another owner/repo/host is
/// never misattributed to the project's PR of the same number (doc-6 §6). Returns one
/// [`PrRelation`] per input PR, in order:
///   - a PR whose host kind is recognized and whose owner/repo are known is queried; its
///     [`RelationOutcome`] is `Resolved` (commit-id intersection, possibly empty) or `LookupFailed`;
///   - a PR on an unrecognized host, or missing owner/repo, is `HostUnsupported` — excluded from
///     resolution, never sent to a source that would query the wrong repo (doc-6 §6 "対象外").
///
/// A failing lookup yields `LookupFailed` for that PR only; the rest still resolve (doc-6 §6
/// "参照不能時" keeps the other views). SHA matching tolerates abbreviation (prefix either way).
fn resolve_relations(
    commits: &[Commit],
    pull_requests: &[PullRequestRef],
    source: &dyn PrCommitSource,
) -> Vec<PrRelation> {
    pull_requests
        .iter()
        .map(|pr| PrRelation {
            pull_request: pr.url.clone(),
            outcome: resolve_one(commits, pr, source),
        })
        .collect()
}

/// Resolve a single PR against the local commits (doc-6 §6). Split out so the per-PR outcome —
/// including the unsupported-host and lookup-failure cases — is decided in one place.
fn resolve_one(
    commits: &[Commit],
    pr: &PullRequestRef,
    source: &dyn PrCommitSource,
) -> RelationOutcome {
    // A PR is resolvable only when its own host kind is recognized and owner/repo/number are all
    // known; anything less would force a query against the wrong repo (or no repo at all), so it
    // is excluded from resolution rather than guessed (doc-6 §6 "対象外").
    let (Some(host), Some(owner), Some(repo), Some(number)) =
        (pr.host, pr.owner.clone(), pr.repo.clone(), pr.number)
    else {
        return RelationOutcome::HostUnsupported;
    };
    let target = PullRequestTarget {
        host,
        owner,
        repo,
        number,
    };
    match source.commits_for_pull_request(&target) {
        Ok(remote_shas) => {
            let commit_ids = commits
                .iter()
                .filter(|c| remote_shas.iter().any(|r| sha_relates(&c.id, r)))
                .map(|c| c.id.clone())
                .collect();
            RelationOutcome::Resolved { commit_ids }
        }
        Err(e) => RelationOutcome::LookupFailed { detail: e.0 },
    }
}

/// Whether two SHAs name the same commit, tolerating abbreviation: equal, or one a
/// case-insensitive hex prefix of the other.
fn sha_relates(a: &str, b: &str) -> bool {
    let (long, short) = if a.len() >= b.len() { (a, b) } else { (b, a) };
    !short.is_empty()
        && long.len() >= short.len()
        && long[..short.len()].eq_ignore_ascii_case(short)
}

// --- 種別ごとの参照手段 (doc-6 §6, decision-14) --------------------------------------------------

/// The production [`PrCommitSource`]: doc-6 §6's "remote ホスト種別を鍵に参照手段を選ぶ" made
/// concrete. The dispatch is an exhaustive `match` on the target's kind, so adding a
/// [`RemoteHostKind`] forces its reference means to be decided rather than silently falling through
/// to GitHub's.
pub struct HostReferences;

impl PrCommitSource for HostReferences {
    fn commits_for_pull_request(
        &self,
        target: &PullRequestTarget,
    ) -> Result<Vec<String>, RelationError> {
        match target.host {
            RemoteHostKind::GitHub => github_pull_request_commits(target),
        }
    }
}

/// The `gh` invocation used for GitHub (decision-14): `gh api` with a fixed subcommand and an
/// argument array, the same rule every other external program in Atlas is run under (AGENTS).
///
/// Why `gh` rather than an in-process HTTP client: it carries the user's existing authentication, so
/// private repositories resolve and the rate limit is the authenticated one, and Atlas never holds a
/// GitHub token. It also costs no new crate — an in-process client would have added a whole TLS
/// stack, since the `reqwest` already in the tree (via `tauri`) is built without a TLS backend.
///
/// `--jq` reduces the response to one SHA per line inside `gh`, so no JSON parser is needed here;
/// `--paginate` walks every page (a PR's commit listing is paged at 100, capped by GitHub at 250);
/// `--hostname` pins the request to github.com so a user's `GH_HOST` cannot redirect a github.com PR
/// to an enterprise host. Read-only: `gh api` defaults to GET, and nothing here writes.
///
/// There is deliberately no timeout: `std` cannot wait on a child with one without a new dependency,
/// and the caller already tolerates a slow read — the command runs off the UI thread and the panel's
/// loader supersedes a stale answer, with 再取得 as the manual retry.
fn github_pull_request_commits(target: &PullRequestTarget) -> Result<Vec<String>, RelationError> {
    // owner/repo reach here from a *task's* References URL, and they are interpolated into an API
    // path. Restricting them to GitHub's own name charset stops a crafted reference (`.`, `..`, an
    // encoded slash) from steering the request at another endpoint.
    let owner = api_path_segment(&target.owner)?;
    let repo = api_path_segment(&target.repo)?;
    let args = [
        "api".to_string(),
        "--hostname".to_string(),
        "github.com".to_string(),
        "--paginate".to_string(),
        "--jq".to_string(),
        ".[].sha".to_string(),
        format!("repos/{owner}/{repo}/pulls/{}/commits", target.number),
    ];
    let out = Command::new("gh")
        .args(&args)
        // gh must never stop on a prompt here — there is no terminal to answer it — and its update
        // notice would otherwise land in the stderr we report as the failure reason.
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1")
        .output()
        .map_err(|e| RelationError(format!("gh を起動できません（{e}）")))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(RelationError(first_line(&stderr)));
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| is_sha(line))
        .map(str::to_string)
        .collect())
}

/// Accept one owner/repo segment for interpolation into an API path. GitHub's own charset for both
/// is ASCII alphanumerics with `-`, `_` and `.`; `.`/`..` are rejected outright because they are the
/// only values in that charset that traverse rather than name.
fn api_path_segment(value: &str) -> Result<&str, RelationError> {
    let ok = !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'));
    if ok {
        Ok(value)
    } else {
        Err(RelationError(format!(
            "Pull Request URL の owner/repo が GitHub の名前として扱えません（{value}）"
        )))
    }
}

/// Whether a line of `gh` output is a commit SHA. Hex-only and at least abbreviation length, so a
/// stray notice on stdout cannot be mistaken for a commit id.
fn is_sha(line: &str) -> bool {
    line.len() >= 7 && line.bytes().all(|b| b.is_ascii_hexdigit())
}

/// The first non-empty line of a program's stderr, for reporting a failure without pasting a whole
/// help text into the screen. Kept short — the panel shows this inline.
fn first_line(text: &str) -> String {
    let line = text
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("gh の実行に失敗しました");
    line.chars().take(200).collect()
}

// --- shared Git invocation + URL parsing --------------------------------------------------------

/// Run `git -C <project_root> <args...>` with a fixed argument array (never a shell string,
/// AC #5). A spawn failure (git missing) is the only hard error surfaced; a non-zero exit is
/// left for the caller to interpret, because "failure" means different things per subcommand
/// (not-a-repo vs no-commits vs no-remote).
fn run_git(project_root: &Path, args: &[String]) -> Result<std::process::Output, HistoryError> {
    Command::new("git")
        .arg("-C")
        .arg(project_root)
        .args(args)
        .output()
        .map_err(HistoryError::GitUnavailable)
}

/// The pieces of a URL this layer needs: host and path. Query/fragment are dropped — PR
/// identity lives in the path.
struct UrlParts<'a> {
    host: &'a str,
    path: &'a str,
}

/// Minimal URL split (scheme://host/path), enough for the PR and remote-URL forms doc-6 handles
/// without pulling in a URL-parsing dependency (AGENTS: prefer minimal dependencies). Returns
/// `None` for input without a `scheme://host` shape.
fn split_url(url: &str) -> Option<UrlParts<'_>> {
    let after_scheme = url.split_once("://")?.1;
    // userinfo (`user@`) may precede the host on ssh URLs; the host ends at the first '/'.
    let (authority, path) = match after_scheme.split_once('/') {
        Some((a, p)) => (a, p),
        None => (after_scheme, ""),
    };
    let authority = authority.rsplit_once('@').map_or(authority, |(_, h)| h);
    // Drop a :port and any query/fragment already excluded by splitting on '/'.
    let host = authority.split(':').next().unwrap_or(authority);
    // Strip query/fragment from the path so segments stay clean.
    let path = path.split(['?', '#']).next().unwrap_or(path);
    if host.is_empty() {
        None
    } else {
        Some(UrlParts { host, path })
    }
}

/// Map a host to a recognized kind (doc-6 §5 "host 部で行う"). `www.` is tolerated. An
/// unrecognized host is `None`, which keeps relation resolution off for it (AC #3).
fn host_kind_of(host: &str) -> Option<RemoteHostKind> {
    let host = host.strip_prefix("www.").unwrap_or(host);
    match host.to_ascii_lowercase().as_str() {
        "github.com" => Some(RemoteHostKind::GitHub),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    // --- word-boundary commit matching (AC #1, doc-6 §3) -----------------------------------

    #[test]
    fn task_id_boundary_rejects_trailing_digit() {
        // The core AC #1 case: searching TASK-1 must not match TASK-12 / TASK-10.
        assert!(message_mentions_task_id("Fix TASK-1 today", "TASK-1"));
        assert!(!message_mentions_task_id("Work on TASK-12", "TASK-1"));
        assert!(!message_mentions_task_id("Work on TASK-120", "TASK-12"));
        assert!(message_mentions_task_id("close TASK-12", "TASK-12"));
    }

    #[test]
    fn task_id_boundary_checks_both_sides() {
        // Left boundary: an alphanumeric run before the id is not a match.
        assert!(!message_mentions_task_id("XTASK-1", "TASK-1"));
        // Non-alphanumeric left neighbors are boundaries.
        assert!(message_mentions_task_id("(TASK-1)", "TASK-1"));
        assert!(message_mentions_task_id("TASK-1: done", "TASK-1"));
        // Start/end of message count as boundaries.
        assert!(message_mentions_task_id("TASK-1", "TASK-1"));
        // Multi-line messages: id at the start of a body line still matches (preceded by \n).
        assert!(message_mentions_task_id("subject\n\nTASK-7 body", "TASK-7"));
    }

    #[test]
    fn task_id_boundary_is_case_insensitive() {
        // A default config.yml writes task_prefix "task" while ids render TASK-N (doc-4 §3.1).
        assert!(message_mentions_task_id("did task-9", "TASK-9"));
        assert!(message_mentions_task_id("did TASK-9", "task-9"));
    }

    // --- PR URL extraction (AC #2, doc-6 §4) -----------------------------------------------

    #[test]
    fn extracts_github_pull_request_with_coordinates() {
        let refs = vec!["https://github.com/serendipitynz/backlog-atlas/pull/5".to_string()];
        let prs = extract_pull_requests(&refs);
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].host, Some(RemoteHostKind::GitHub));
        assert_eq!(prs[0].owner.as_deref(), Some("serendipitynz"));
        assert_eq!(prs[0].repo.as_deref(), Some("backlog-atlas"));
        assert_eq!(prs[0].number, Some(5));
    }

    #[test]
    fn keeps_multiple_pull_requests_unrounded() {
        // doc-6 §4: several PR URLs on one task are all kept, not collapsed to one (AC #2).
        let refs = vec![
            "https://github.com/o/r/pull/1".to_string(),
            "https://example.test/team/proj/pull-requests/42".to_string(),
            "https://example.test/design/doc-4".to_string(), // not a PR → excluded
        ];
        let prs = extract_pull_requests(&refs);
        assert_eq!(prs.len(), 2);
        assert_eq!(prs[0].number, Some(1));
        // Generic host: number resolved, host kind unknown, owner/repo from preceding segments.
        assert_eq!(prs[1].host, None);
        assert_eq!(prs[1].number, Some(42));
        assert_eq!(prs[1].owner.as_deref(), Some("team"));
        assert_eq!(prs[1].repo.as_deref(), Some("proj"));
    }

    #[test]
    fn non_pull_request_urls_are_not_extracted() {
        let refs = vec![
            "https://github.com/o/r/issues/9".to_string(),
            "https://github.com/o/r".to_string(),
            "not a url".to_string(),
        ];
        assert!(extract_pull_requests(&refs).is_empty());
    }

    // --- remote URL parsing (doc-6 §5) -----------------------------------------------------

    #[test]
    fn parses_github_remote_from_ssh_and_https() {
        let https = parse_remote_url("https://github.com/serendipitynz/backlog-atlas.git").unwrap();
        assert_eq!(https.kind, RemoteHostKind::GitHub);
        assert_eq!(https.owner, "serendipitynz");
        assert_eq!(https.repo, "backlog-atlas");

        let ssh = parse_remote_url("git@github.com:serendipitynz/backlog-atlas.git").unwrap();
        assert_eq!(ssh, https);

        let ssh_scheme =
            parse_remote_url("ssh://git@github.com/serendipitynz/backlog-atlas.git").unwrap();
        assert_eq!(ssh_scheme, https);
    }

    #[test]
    fn unrecognized_remote_host_yields_none() {
        // An unknown host cannot be referenced, so no RemoteHost → relation resolution stays off.
        assert!(parse_remote_url("https://git.example.test/o/r.git").is_none());
        assert!(parse_remote_url("git@gitlab.example:o/r.git").is_none());
    }

    // --- relation resolution gating + matching (AC #3, doc-6 §6) ----------------------------

    /// A source keyed on the *full* PR coordinates, so a query against the wrong owner/repo/host
    /// returns nothing — this is what lets the tests catch misattribution ([P1] review finding).
    struct FakeSource {
        by_target: BTreeMap<(RemoteHostKind, String, String, u64), Vec<String>>,
        fail: bool,
    }

    impl FakeSource {
        fn with(entries: &[(&str, &str, u64, &[&str])]) -> Self {
            let mut by_target = BTreeMap::new();
            for (owner, repo, number, shas) in entries {
                by_target.insert(
                    (
                        RemoteHostKind::GitHub,
                        (*owner).to_string(),
                        (*repo).to_string(),
                        *number,
                    ),
                    shas.iter().map(|s| s.to_string()).collect(),
                );
            }
            FakeSource {
                by_target,
                fail: false,
            }
        }
    }

    impl PrCommitSource for FakeSource {
        fn commits_for_pull_request(
            &self,
            target: &PullRequestTarget,
        ) -> Result<Vec<String>, RelationError> {
            if self.fail {
                return Err(RelationError("offline".into()));
            }
            let key = (
                target.host,
                target.owner.clone(),
                target.repo.clone(),
                target.number,
            );
            Ok(self.by_target.get(&key).cloned().unwrap_or_default())
        }
    }

    fn commit(id: &str, summary: &str) -> Commit {
        Commit {
            id: id.to_string(),
            short_id: id[..7.min(id.len())].to_string(),
            summary: summary.to_string(),
            date: "2026-07-22T00:00:00+00:00".to_string(),
            author: "Dev".to_string(),
        }
    }

    fn github_pr(url: &str, owner: &str, repo: &str, number: u64) -> PullRequestRef {
        PullRequestRef {
            url: url.into(),
            host: Some(RemoteHostKind::GitHub),
            owner: Some(owner.into()),
            repo: Some(repo.into()),
            number: Some(number),
        }
    }

    #[test]
    fn resolves_intersection_of_pr_and_local_commits() {
        let commits = vec![
            commit("aaaaaaaaaaaa1111", "TASK-1 a"),
            commit("bbbbbbbbbbbb2222", "TASK-1 b"),
        ];
        let prs = vec![github_pr("https://github.com/o/r/pull/5", "o", "r", 5)];
        // The remote reports one shared commit (abbreviated) and one unrelated one.
        let source = FakeSource::with(&[("o", "r", 5, &["aaaaaaa", "ffffffffffff9999"])]);

        let relations = resolve_relations(&commits, &prs, &source);
        assert_eq!(relations.len(), 1);
        assert_eq!(relations[0].pull_request, "https://github.com/o/r/pull/5");
        // Only the shared commit relates; abbreviation is tolerated via prefix match.
        assert_eq!(
            relations[0].outcome,
            RelationOutcome::Resolved {
                commit_ids: vec!["aaaaaaaaaaaa1111".into()],
            }
        );
    }

    #[test]
    fn queries_each_pr_at_its_own_coordinates() {
        // [P1]: a reference to a *different* owner/repo must be looked up there, not against the
        // project's remote. Here the shared sha lives under fork/r#7; a same-number PR under o/r
        // must not borrow it.
        let commits = vec![commit("aaaaaaaaaaaa1111", "TASK-1")];
        let prs = vec![
            github_pr("https://github.com/o/r/pull/7", "o", "r", 7),
            github_pr("https://github.com/fork/r/pull/7", "fork", "r", 7),
        ];
        // Only fork/r#7 contains the local commit; o/r#7 has an unrelated sha.
        let source = FakeSource::with(&[
            ("o", "r", 7, &["ffffffffffff9999"]),
            ("fork", "r", 7, &["aaaaaaa"]),
        ]);

        let relations = resolve_relations(&commits, &prs, &source);
        assert_eq!(
            relations[0].outcome,
            RelationOutcome::Resolved { commit_ids: vec![] },
            "o/r#7 must not pick up fork/r#7's commit"
        );
        assert_eq!(
            relations[1].outcome,
            RelationOutcome::Resolved {
                commit_ids: vec!["aaaaaaaaaaaa1111".into()],
            }
        );
    }

    #[test]
    fn resolved_but_empty_is_distinct_from_lookup_failure() {
        // [P2]: "queried, no shared commit" and "lookup failed" must be different outcomes so the
        // display layer can tell 取得成功だが関連なし from 関連解決不能 (doc-6 §6).
        let commits = vec![commit("aaaaaaaaaaaa1111", "TASK-1")];
        let prs = vec![github_pr("https://github.com/o/r/pull/9", "o", "r", 9)];

        // Success with no intersection → Resolved{ empty }.
        let ok = FakeSource::with(&[("o", "r", 9, &["ffffffffffff9999"])]);
        assert_eq!(
            resolve_relations(&commits, &prs, &ok)[0].outcome,
            RelationOutcome::Resolved { commit_ids: vec![] }
        );

        // Lookup error → LookupFailed, carrying the reason.
        let mut down = FakeSource::with(&[]);
        down.fail = true;
        assert_eq!(
            resolve_relations(&commits, &prs, &down)[0].outcome,
            RelationOutcome::LookupFailed {
                detail: "offline".into()
            }
        );
    }

    #[test]
    fn a_failing_pr_lookup_does_not_abort_the_rest() {
        // doc-6 §6: one unreachable PR must not hide the others. With a source that fails every
        // lookup, each PR still gets its own LookupFailed outcome — none is dropped.
        let commits = vec![commit("aaaaaaaaaaaa1111", "TASK-1")];
        let prs = vec![
            github_pr("https://github.com/o/r/pull/9", "o", "r", 9),
            github_pr("https://github.com/o/r/pull/10", "o", "r", 10),
        ];
        let mut source = FakeSource::with(&[]);
        source.fail = true;
        let relations = resolve_relations(&commits, &prs, &source);
        assert_eq!(relations.len(), 2);
        assert!(relations
            .iter()
            .all(|r| matches!(r.outcome, RelationOutcome::LookupFailed { .. })));
    }

    #[test]
    fn unsupported_host_pr_is_excluded_not_queried() {
        // doc-6 §6 "対象外": a PR whose host kind is unknown (generic match, host None) must not be
        // sent to a source that would query the wrong repo — it is reported HostUnsupported.
        let commits = vec![commit("aaaaaaaaaaaa1111", "TASK-1")];
        let prs = vec![PullRequestRef {
            url: "https://example.test/team/proj/pull-requests/42".into(),
            host: None,
            owner: Some("team".into()),
            repo: Some("proj".into()),
            number: Some(42),
        }];
        // A source that would panic if ever called — it must not be, for an unsupported host.
        struct NeverCalled;
        impl PrCommitSource for NeverCalled {
            fn commits_for_pull_request(
                &self,
                _t: &PullRequestTarget,
            ) -> Result<Vec<String>, RelationError> {
                panic!("unsupported-host PR must not be queried");
            }
        }
        let relations = resolve_relations(&commits, &prs, &NeverCalled);
        assert_eq!(relations[0].outcome, RelationOutcome::HostUnsupported);
    }

    #[test]
    fn detect_remote_host_gated_on_git_remote_present() {
        // AC #3: with git_remote_present false, no Git call is made and no host is returned,
        // so relation resolution never runs regardless of the on-disk repo.
        let entry = ProjectEntry {
            slug: "p".into(),
            project_root: PathBuf::from("/nonexistent"),
            backlog_root: PathBuf::from("/nonexistent/backlog"),
            git_remote_present: false,
            status_aliases: BTreeMap::new(),
        };
        assert!(detect_remote_host(&entry).is_none());
    }

    #[test]
    fn task_relations_gate_blocks_when_project_remote_absent() {
        // AC #3: the callable entry (resolve_task_relations) must not consult the source when the
        // owning project has no determined remote — `None`, which detect_remote_host returns for both
        // git_remote_present false and an unrecognized host — even though the PR itself is a
        // well-formed GitHub reference. The PR-coordinate fix must not bypass this.
        struct NeverCalled;
        impl PrCommitSource for NeverCalled {
            fn commits_for_pull_request(
                &self,
                _t: &PullRequestTarget,
            ) -> Result<Vec<String>, RelationError> {
                panic!("source must not be queried when the project-remote gate fails");
            }
        }
        let commits = vec![commit("aaaaaaaaaaaa1111", "TASK-1")];
        let prs = vec![github_pr("https://github.com/o/r/pull/5", "o", "r", 5)];
        assert!(resolve_task_relations(None, &commits, &prs, &NeverCalled).is_empty());
    }

    #[test]
    fn task_relations_resolve_once_the_project_remote_is_determined() {
        // The other side of the gate: with a determined host, the same call resolves — and returns
        // one entry per extracted PR, which is what lets the screen read "0 relations" as "this task
        // has no Pull Request URL" rather than "resolution did not run".
        let commits = vec![commit("aaaaaaaaaaaa1111", "TASK-1")];
        let prs = vec![github_pr("https://github.com/o/r/pull/5", "o", "r", 5)];
        let source = FakeSource::with(&[("o", "r", 5, &["aaaaaaa"])]);
        let remote = RemoteHost {
            kind: RemoteHostKind::GitHub,
            owner: "o".into(),
            repo: "r".into(),
        };
        let relations = resolve_task_relations(Some(&remote), &commits, &prs, &source);
        assert_eq!(
            relations[0].outcome,
            RelationOutcome::Resolved {
                commit_ids: vec!["aaaaaaaaaaaa1111".into()],
            }
        );
        // No PR URL on the task → no relation, with the gate still open.
        assert!(resolve_task_relations(Some(&remote), &commits, &[], &source).is_empty());
    }

    // --- GitHub の参照手段 (doc-6 §6, decision-14) -------------------------------------------

    #[test]
    fn api_path_segments_reject_traversal_and_foreign_characters() {
        // owner/repo come from a task's own References URL and are interpolated into an API path,
        // so anything that could steer the request elsewhere is refused before `gh` is spawned.
        assert_eq!(api_path_segment("backlog-atlas").unwrap(), "backlog-atlas");
        assert_eq!(api_path_segment("serendipitynz").unwrap(), "serendipitynz");
        for bad in ["", ".", "..", "o/r", "o r", "o%2Fr", "o?x"] {
            assert!(api_path_segment(bad).is_err(), "{bad} must be refused");
        }
    }

    #[test]
    fn only_hex_lines_are_read_as_commit_ids() {
        assert!(is_sha("aaaaaaa"));
        assert!(is_sha("aaaaaaaaaaaa1111bbbbbbbbbbbb2222cccc3333"));
        // Too short, and not hex: a stray notice on stdout must not become a commit id.
        assert!(!is_sha("abc"));
        assert!(!is_sha("gh: not found"));
        assert!(!is_sha(""));
    }

    /// `#[ignore]` by default for the same reason as the CLI tests in `commands.rs`: it asserts on
    /// environment properties (an authenticated `gh` on PATH, and network reach to github.com), so a
    /// machine without them would go red for something that is not a code defect. Everything that is
    /// Atlas's own logic — the gate, the per-PR outcomes, the SHA matching, the argument guards — is
    /// covered by the deterministic tests above, which need no network. Run it where `gh` is
    /// available: `cargo test --lib -- --ignored the_gh_reference_means_returns_a_pr_commit_set`
    #[test]
    #[ignore = "requires an authenticated gh on PATH and network access to github.com"]
    fn the_gh_reference_means_returns_a_pr_commit_set() {
        // Atlas's own repository, whose PR #28 is merged and therefore fixed.
        let target = PullRequestTarget {
            host: RemoteHostKind::GitHub,
            owner: "serendipitynz".into(),
            repo: "backlog-atlas".into(),
            number: 28,
        };
        let shas = HostReferences.commits_for_pull_request(&target).unwrap();
        assert!(!shas.is_empty());
        assert!(shas.iter().all(|sha| is_sha(sha)));
        // One commit that is in that PR, matched the way relation resolution matches (prefix).
        assert!(shas.iter().any(|sha| sha_relates(sha, "0057353")));
    }

    #[test]
    fn a_failure_reason_is_one_short_line() {
        assert_eq!(
            first_line("\n  gh: To use GitHub CLI, run: gh auth login\nmore\n"),
            "gh: To use GitHub CLI, run: gh auth login"
        );
        assert_eq!(first_line("   \n"), "gh の実行に失敗しました");
        assert!(first_line(&"x".repeat(500)).chars().count() <= 200);
    }

    #[test]
    fn pr_relation_serializes_in_camelcase_wire_shape() {
        // doc-4 §3.1 wire contract: the whole IPC model is camelCase. The tagged enum's struct
        // fields must reach the frontend as `commitIds`, or a resolved commit list is lost.
        let resolved = PrRelation {
            pull_request: "https://github.com/o/r/pull/5".into(),
            outcome: RelationOutcome::Resolved {
                commit_ids: vec!["aaaaaaaaaaaa1111".into()],
            },
        };
        let json = serde_json::to_value(&resolved).unwrap();
        assert_eq!(json["pullRequest"], "https://github.com/o/r/pull/5");
        assert_eq!(json["outcome"]["state"], "resolved");
        assert_eq!(
            json["outcome"]["commitIds"],
            serde_json::json!(["aaaaaaaaaaaa1111"])
        );
        assert!(json["outcome"].get("commit_ids").is_none());

        let unsupported = serde_json::to_value(RelationOutcome::HostUnsupported).unwrap();
        assert_eq!(unsupported["state"], "hostUnsupported");

        let failed = serde_json::to_value(RelationOutcome::LookupFailed {
            detail: "offline".into(),
        })
        .unwrap();
        assert_eq!(failed["state"], "lookupFailed");
        assert_eq!(failed["detail"], "offline");
    }

    // --- commit search against a real repo (AC #1, #4, doc-6 §3, §6) ------------------------

    /// Minimal self-cleaning temp dir (mirrors ledger.rs's test helper; no tempfile dependency).
    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn new() -> Self {
            static CTR: AtomicU64 = AtomicU64::new(0);
            let n = CTR.fetch_add(1, Ordering::Relaxed);
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "atlas-history-test-{}-{nanos}-{n}",
                std::process::id()
            ));
            std::fs::create_dir_all(&path).unwrap();
            TempDir { path }
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn git(root: &Path, args: &[&str]) -> bool {
        Command::new("git")
            .arg("-C")
            .arg(root)
            .args(args)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn commit_msg(root: &Path, msg: &str) {
        // Empty commits keep the fixture free of file churn; the message is all we search.
        assert!(git(root, &["commit", "--allow-empty", "-q", "-m", msg]));
    }

    /// Init a repo with deterministic identity/branch. Returns false if git is unavailable so
    /// the caller can skip (the CI-less dev box may lack git).
    fn init_repo(root: &Path) -> bool {
        if !git(root, &["init", "-q"]) {
            return false;
        }
        git(root, &["config", "user.email", "t@example.invalid"]);
        git(root, &["config", "user.name", "Tester"]);
        git(root, &["config", "commit.gpgsign", "false"]);
        true
    }

    #[test]
    fn search_distinguishes_not_a_repo_from_no_match() {
        let tmp = TempDir::new();
        // 対象不在: a plain directory is not a Git repo.
        match search_commits(&tmp.path, "TASK-1") {
            Err(HistoryError::NotAGitRepo) => {}
            Err(HistoryError::GitUnavailable(_)) => {} // git missing → skip
            other => panic!("expected NotAGitRepo, got {other:?}"),
        }
    }

    #[test]
    fn search_finds_matching_commits_newest_first_with_boundary() {
        let tmp = TempDir::new();
        let repo = tmp.path.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        if !init_repo(&repo) {
            return; // git unavailable
        }
        // Empty repo (no HEAD) is a repo with no history → 該当なし, not an error (doc-6 §6).
        assert_eq!(search_commits(&repo, "TASK-1").unwrap(), Vec::new());

        commit_msg(&repo, "TASK-1 first");
        commit_msg(&repo, "unrelated change");
        commit_msg(&repo, "TASK-12 different task"); // must NOT match a TASK-1 search
        commit_msg(&repo, "close TASK-1 again"); // newest matching

        let found = search_commits(&repo, "TASK-1").unwrap();
        let summaries: Vec<&str> = found.iter().map(|c| c.summary.as_str()).collect();
        // Newest-first, and TASK-12 excluded by the boundary rule (AC #1).
        assert_eq!(summaries, vec!["close TASK-1 again", "TASK-1 first"]);
        // Full sha and author populated (doc-6 §3 結果).
        assert_eq!(found[0].id.len(), 40);
        assert_eq!(found[0].author, "Tester");
    }

    #[test]
    fn search_matches_task_id_in_commit_body() {
        let tmp = TempDir::new();
        let repo = tmp.path.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        if !init_repo(&repo) {
            return;
        }
        // TASK-7 appears only in the body, not the subject.
        commit_msg(&repo, "subject line\n\nRefs TASK-7 in the body");
        let found = search_commits(&repo, "TASK-7").unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].summary, "subject line");
    }
}
