//! How Atlas's own two files reach the disk — 一時ファイル置換 (decision-17, implements TASK-84).
//!
//! The ledger (`projects.toml`, doc-3 §2) and the app settings (`settings.toml`, decision-13) are
//! the only files Atlas writes itself; everything else in a Backlog root is the Backlog CLI's to
//! write (decision-2). Both used to reach the disk through `std::fs::write`, which truncates the
//! destination before writing it: a failure between the truncation and the last byte leaves an
//! empty or half-written TOML under the destination's name. A broken `projects.toml` opens none of
//! the registered projects, and a broken `settings.toml` starts on the defaults.
//!
//! ## Referent table (decision-17 term → identifier here)
//!
//! Fixed before naming, following the ledger/read/update/settings modules' convention.
//!
//! | term | here | is |
//! |---|---|---|
//! | decision-17 一時ファイル置換 | [`replace`] | write the whole content to a temp file beside the destination, sync it, then `rename` it over |
//! | decision-17 保存境界 | [`Files`] | the filesystem operations a replacement is made of, behind one trait so each can be failed |
//! | decision-17 保存の段 | [`Step`] | the name of one of those operations, as a value a test can point a failure at |
//! | decision-17 ファイル同期 | [`Files::sync_all`] | getting the temp file's bytes out of the page cache before the `rename` |
//!
//! decision-17 sets the durability level at ファイル同期 and stops there: 親ディレクトリ同期 is not
//! done, because it takes an unsafe `CreateFileW` on Windows and macOS's `fsync` would still not
//! reach the drive without `F_FULLFSYNC`. What is left is "a power cut may lose the most recent
//! save", with the old file intact — not "a half-written file under the destination's name".
//!
//! The module is named `store` and not `sync` because `sync` already names the same-root freshness
//! layer (doc-9), and ファイル同期 would put one spelling on two referents.

use std::fs::File;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// One operation a 一時ファイル置換 is made of. A value rather than a `cfg` or a string so a test
/// can name the step it wants to fail, and so [`Files`] implementations cannot disagree about which
/// steps exist.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// Create the destination's parent directory (first run: the app-config dir may not exist).
    Directory,
    /// Create the temp file, refusing to reuse an existing one.
    Create,
    /// Write the whole content to the temp file.
    Write,
    /// ファイル同期 — the temp file's bytes leave the page cache before anything points at them.
    Sync,
    /// Replace the destination with the temp file.
    Rename,
}

impl Step {
    /// What the step was doing, for the message the user is shown when it fails. Present tense
    /// participle so it reads as `… while creating the temporary file (…): No space left on device`.
    fn describe(self) -> &'static str {
        match self {
            Step::Directory => "creating the parent directory",
            Step::Create => "creating the temporary file",
            Step::Write => "writing the temporary file",
            Step::Sync => "syncing the temporary file",
            Step::Rename => "replacing the destination",
        }
    }
}

/// The 保存境界: the filesystem, as a 一時ファイル置換 uses it. Behind a trait so each step's failure
/// can be injected — decision-17 requires "the old file is unchanged" and "only the whole new file
/// is ever visible" to be asserted, and neither can be asserted by waiting for a real disk to fail.
pub trait Files {
    fn create_dir_all(&self, dir: &Path) -> io::Result<()>;
    /// Create `path` for writing, failing if it already exists — another writer's temp file is
    /// never adopted.
    fn create_new(&self, path: &Path) -> io::Result<File>;
    fn write_all(&self, file: &mut File, bytes: &[u8]) -> io::Result<()>;
    fn sync_all(&self, file: &File) -> io::Result<()>;
    fn rename(&self, from: &Path, to: &Path) -> io::Result<()>;
    /// Best-effort cleanup of an abandoned temp file. Returns nothing on purpose: decision-17 says
    /// a cleanup failure must not overwrite the failure that caused it, and a leftover temp file
    /// points at nothing.
    fn remove_file(&self, path: &Path);
}

/// The real filesystem.
pub struct SystemFiles;

impl Files for SystemFiles {
    fn create_dir_all(&self, dir: &Path) -> io::Result<()> {
        std::fs::create_dir_all(dir)
    }

    fn create_new(&self, path: &Path) -> io::Result<File> {
        File::options().write(true).create_new(true).open(path)
    }

    fn write_all(&self, file: &mut File, bytes: &[u8]) -> io::Result<()> {
        file.write_all(bytes)
    }

    fn sync_all(&self, file: &File) -> io::Result<()> {
        file.sync_all()
    }

    fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        std::fs::rename(from, to)
    }

    fn remove_file(&self, path: &Path) {
        let _ = std::fs::remove_file(path);
    }
}

/// Write `contents` to `path` by 一時ファイル置換 (decision-17). On success the destination holds
/// the whole of `contents`; on any failure it holds exactly what it held before, and no temp file
/// of ours is left behind.
pub fn replace(files: &dyn Files, path: &Path, contents: &str) -> io::Result<()> {
    let temp = temp_path(path)?;
    if let Some(parent) = path.parent() {
        files
            .create_dir_all(parent)
            .map_err(|e| failed(Step::Directory, parent, e))?;
    }
    let mut file = files
        .create_new(&temp)
        .map_err(|e| failed(Step::Create, &temp, e))?;
    // From here the temp file exists, so every exit removes it: a save that did not happen leaves
    // the directory as it found it. The handle is dropped before the rename because Windows will
    // not replace a file that is still open.
    if let Err(e) = fill(files, &mut file, contents.as_bytes(), &temp) {
        drop(file);
        files.remove_file(&temp);
        return Err(e);
    }
    drop(file);
    files.rename(&temp, path).map_err(|e| {
        files.remove_file(&temp);
        failed(Step::Rename, path, e)
    })
}

/// The two steps that need the open handle, split out so `replace` has one cleanup path for both.
fn fill(files: &dyn Files, file: &mut File, bytes: &[u8], temp: &Path) -> io::Result<()> {
    files
        .write_all(file, bytes)
        .map_err(|e| failed(Step::Write, temp, e))?;
    files
        .sync_all(file)
        .map_err(|e| failed(Step::Sync, temp, e))
}

/// Where the temp file goes: **beside the destination**, because `fs::rename` cannot cross a
/// filesystem and the OS temp directory is regularly on another one. The name carries the process
/// id and a counter so two Atlas processes, or two saves in one process, never pick the same one —
/// `create_new` would otherwise refuse the second.
fn temp_path(path: &Path) -> io::Result<PathBuf> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let Some(name) = path.file_name() else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("not a file to save to: {}", path.display()),
        ));
    };
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let mut temp = name.to_os_string();
    temp.push(format!(".{}-{n}.tmp", std::process::id()));
    Ok(path.with_file_name(temp))
}

/// Name the step and the path in the error the user is shown. The kind is kept from the source so
/// callers that branch on it (`NotFound`, `PermissionDenied`) still can.
fn failed(step: Step, path: &Path, source: io::Error) -> io::Error {
    io::Error::new(
        source.kind(),
        format!("{} ({}): {source}", step.describe(), path.display()),
    )
}

/// One call a [`replace`] made, recorded by [`FakeFiles`]. Carrying the paths is what lets a test
/// assert decision-17's real contract — that the destination's name is reached by `rename` alone,
/// and so a reader of it sees either the whole old file or the whole new one.
#[cfg(test)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Call {
    Directory(PathBuf),
    Create(PathBuf),
    Write(usize),
    Sync,
    Rename(PathBuf, PathBuf),
    Remove(PathBuf),
}

/// The real filesystem with one step failed. Shared by `ledger` and `settings` rather than copied
/// into each: a copy would be outside the assertions this one carries (the TASK-59 rule for
/// fixture helpers). Delegating the steps it is not failing is deliberate — the tests assert what
/// is really on disk afterwards, which a fully simulated filesystem could not show.
#[cfg(test)]
pub(crate) struct FakeFiles {
    fails_at: Option<Step>,
    calls: std::cell::RefCell<Vec<Call>>,
}

#[cfg(test)]
impl FakeFiles {
    pub(crate) fn working() -> Self {
        FakeFiles {
            fails_at: None,
            calls: std::cell::RefCell::new(Vec::new()),
        }
    }

    pub(crate) fn failing_at(step: Step) -> Self {
        FakeFiles {
            fails_at: Some(step),
            calls: std::cell::RefCell::new(Vec::new()),
        }
    }

    pub(crate) fn calls(&self) -> Vec<Call> {
        self.calls.borrow().clone()
    }

    /// Every path this replacement opened, created, renamed away from, or removed — that is, every
    /// path it could have left a partial file at. The `rename` *target* is excluded: that is the
    /// destination, and replacing it is the one operation that is atomic to a reader.
    pub(crate) fn paths_written(&self) -> Vec<PathBuf> {
        self.calls
            .borrow()
            .iter()
            .filter_map(|c| match c {
                Call::Create(p) | Call::Rename(p, _) | Call::Remove(p) => Some(p.clone()),
                Call::Directory(_) | Call::Write(_) | Call::Sync => None,
            })
            .collect()
    }

    fn record(&self, call: Call) {
        self.calls.borrow_mut().push(call);
    }

    fn injected(&self, step: Step) -> io::Result<()> {
        if self.fails_at == Some(step) {
            return Err(io::Error::other("injected failure"));
        }
        Ok(())
    }
}

#[cfg(test)]
impl Files for FakeFiles {
    fn create_dir_all(&self, dir: &Path) -> io::Result<()> {
        self.record(Call::Directory(dir.to_path_buf()));
        self.injected(Step::Directory)?;
        SystemFiles.create_dir_all(dir)
    }

    fn create_new(&self, path: &Path) -> io::Result<File> {
        self.record(Call::Create(path.to_path_buf()));
        self.injected(Step::Create)?;
        SystemFiles.create_new(path)
    }

    fn write_all(&self, file: &mut File, bytes: &[u8]) -> io::Result<()> {
        self.record(Call::Write(bytes.len()));
        if self.fails_at == Some(Step::Write) {
            // Write a prefix and *then* fail. An injection that writes nothing would leave an empty
            // temp file, which is not the failure TASK-84 exists to survive: the finding is about a
            // half-written TOML, and a test that never produces one proves less than it claims.
            SystemFiles.write_all(file, &bytes[..bytes.len() / 2])?;
            return Err(io::Error::other("injected failure"));
        }
        SystemFiles.write_all(file, bytes)
    }

    fn sync_all(&self, file: &File) -> io::Result<()> {
        self.record(Call::Sync);
        self.injected(Step::Sync)?;
        SystemFiles.sync_all(file)
    }

    fn rename(&self, from: &Path, to: &Path) -> io::Result<()> {
        self.record(Call::Rename(from.to_path_buf(), to.to_path_buf()));
        self.injected(Step::Rename)?;
        SystemFiles.rename(from, to)
    }

    fn remove_file(&self, path: &Path) {
        self.record(Call::Remove(path.to_path_buf()));
        SystemFiles.remove_file(path)
    }
}

/// Assert decision-17 AC #5 for a replacement that has just succeeded: the destination's name was
/// reached by the `rename` and by nothing else, so a reader of it saw the whole old file or the
/// whole new one.
///
/// The `rename` is asserted *positively*, not just "no other call named the destination". Without
/// that half, a caller that bypassed the 保存境界 altogether — which is what a regression to
/// `fs::write` looks like — would record no calls and pass an emptily-quantified check. Shared by
/// the `ledger` and `settings` tests rather than copied into each: a copy is a second assertion
/// that can weaken on its own (the TASK-59 rule for fixture helpers).
#[cfg(test)]
pub(crate) fn assert_reached_only_by_rename(files: &FakeFiles, path: &Path) {
    let calls = files.calls();
    assert!(
        matches!(calls.last(), Some(Call::Rename(_, to)) if to == path),
        "the replacement has to end by renaming onto {}: {calls:?}",
        path.display()
    );
    for written in files.paths_written() {
        assert_ne!(
            written,
            path.to_path_buf(),
            "only the rename target may be the destination: {calls:?}"
        );
    }
}

/// Every step, so a test that loops over them fails to compile when a step is added rather than
/// silently leaving the new one uninjected.
#[cfg(test)]
pub(crate) const EVERY_STEP: [Step; 5] = [
    Step::Directory,
    Step::Create,
    Step::Write,
    Step::Sync,
    Step::Rename,
];

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    /// Minimal self-cleaning temp directory, as in `ledger.rs` — no `tempfile` dependency.
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
                "atlas-store-test-{}-{nanos}-{n}",
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

    /// The names left in `dir`, sorted — used to show that no temp file of ours survived.
    fn entries(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn the_step_list_covers_the_boundary() {
        // EVERY_STEP is what the failure-injection tests loop over, here and in `ledger`/`settings`.
        // The exhaustive match is what makes adding a variant to `Step` stop compiling until the
        // list grows too — otherwise a new step would be injected by no test at all.
        for step in EVERY_STEP {
            match step {
                Step::Directory | Step::Create | Step::Write | Step::Sync | Step::Rename => {}
            }
        }
        assert_eq!(EVERY_STEP.len(), 5);
    }

    #[test]
    fn a_replacement_reaches_the_destination_only_by_rename() {
        // decision-17's guarantee rests on this: if nothing but `rename` ever names the
        // destination, a reader of that name sees the whole old file or the whole new one.
        let tmp = TempDir::new();
        let path = tmp.path.join("projects.toml");
        std::fs::write(&path, "old").unwrap();
        let files = FakeFiles::working();

        replace(&files, &path, "new").unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert_reached_only_by_rename(&files, &path);
    }

    #[test]
    fn the_temporary_file_sits_beside_the_destination() {
        // `fs::rename` cannot cross a filesystem, so a temp file in the OS temp dir would make the
        // last step fail on any machine whose config dir is on another mount.
        let path = Path::new("/some/config/dir/projects.toml");
        let temp = temp_path(path).unwrap();
        assert_eq!(temp.parent(), path.parent());
        assert_ne!(temp, path);
    }

    #[test]
    fn two_replacements_of_one_file_pick_different_temporary_names() {
        // `create_new` refuses an existing name, so a fixed temp name would make a second save fail
        // whenever the first one's file survived (or another Atlas process was mid-save).
        let path = Path::new("/some/config/dir/projects.toml");
        assert_ne!(temp_path(path).unwrap(), temp_path(path).unwrap());
    }

    #[test]
    fn a_failure_at_any_step_leaves_the_old_file_and_no_temporary() {
        for step in EVERY_STEP {
            let tmp = TempDir::new();
            let path = tmp.path.join("projects.toml");
            std::fs::write(&path, "old contents, longer than the new ones").unwrap();
            let files = FakeFiles::failing_at(step);

            let error = replace(&files, &path, "new").unwrap_err();

            assert!(
                error.to_string().contains(step.describe()),
                "{step:?} should name itself: {error}"
            );
            assert_eq!(
                std::fs::read_to_string(&path).unwrap(),
                "old contents, longer than the new ones",
                "{step:?} changed the destination"
            );
            assert_eq!(
                entries(&tmp.path),
                vec!["projects.toml".to_string()],
                "{step:?} left a temporary file behind"
            );
        }
    }

    #[test]
    fn a_failed_write_really_did_put_bytes_in_the_temporary_file() {
        // Guards the test above: if the injection wrote nothing, "the old file is unchanged" would
        // pass without ever having produced the half-written file the finding is about.
        let tmp = TempDir::new();
        let path = tmp.path.join("projects.toml");
        let content = "a".repeat(64);
        let files = FakeFiles::failing_at(Step::Write);

        replace(&files, &path, &content).unwrap_err();

        let written = files
            .calls()
            .iter()
            .find_map(|c| match c {
                Call::Write(n) => Some(*n),
                _ => None,
            })
            .expect("the write step ran");
        assert_eq!(written, 64);
        assert!(!path.exists(), "a partial write must not become the file");
    }

    #[test]
    fn the_parent_directory_is_created_on_first_run() {
        // The app-config dir does not exist before the first save; `replace` owns that now, so
        // neither caller has to.
        let tmp = TempDir::new();
        let path = tmp.path.join("cfg").join("settings.toml");

        replace(&SystemFiles, &path, "schema_version = 2\n").unwrap();

        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "schema_version = 2\n"
        );
    }

    #[test]
    fn a_path_with_no_file_name_is_refused_before_anything_is_touched() {
        let files = FakeFiles::working();
        let error = replace(&files, Path::new("/"), "x").unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        assert!(files.calls().is_empty(), "{:?}", files.calls());
    }
}
