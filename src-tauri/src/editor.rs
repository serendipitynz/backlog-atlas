//! 外部エディタ経路 — launching the user's own editor on a task's management file (doc-8 §7,
//! implements TASK-37). The one module that starts a program Atlas does not control the output of.
//!
//! ## Referent table (doc term → identifier here)
//!
//! Fixed before naming, following the read/update/sync modules' convention.
//!
//! | term | here | is |
//! |---|---|---|
//! | doc-8 §7 外部エディタ経路 | this module + [`open`] | handing one management file to the user's editor; the write is the editor's, never Atlas's |
//! | doc-8 §7 `$EDITOR` 起動 | [`LaunchMethod::Configured`] / [`ConfiguredEditor`] | the program `VISUAL`/`EDITOR` names, with its leading arguments |
//! | doc-8 §7 OS の関連付け起動 | [`LaunchMethod::Association`] | the platform's association launcher (`open` / `xdg-open`), where one exists that is not a shell |
//! | 起動できる方式 | [`EditorReadiness`] | which of the two methods this environment has, so the UI offers only those |
//! | 起動した事実 | [`EditorLaunch`] | what was actually spawned — the program and argument array, for the UI to state |
//! | 起動できない・起動に失敗した | [`EditorError`] | no launcher for the chosen method, or the spawn itself failed |
//!
//! ## Atlas still does not write managed Markdown (AC #1)
//!
//! doc-2's invariant is that Atlas never writes a managed Markdown file. Nothing here opens a file
//! for writing, creates one, or copies one: the only effect is a spawned process with the file's path
//! as an argument. The write that follows is the user's editor's, and it reaches Atlas the same way
//! any other external change does — through doc-9's watch (doc-8 §7 書き戻し), so no exit detection
//! is needed and none is attempted.
//!
//! This is nevertheless the exception doc-8 §7 names: the bytes that land in the file did not pass
//! the Backlog CLI's option checking, so a broken frontmatter is possible and is received by doc-4's
//! 縮退表示 rather than being repaired or rejected here.
//!
//! ## No shell, ever (AGENTS)
//!
//! Every launch is `Command::new(program).args(argv)`. A `VISUAL`/`EDITOR` value is split on ASCII
//! whitespace into a program and its leading arguments, which is the whole of the parsing: quoting,
//! `~` expansion and variable substitution are shell features, and running the value through a shell
//! to get them would put the file path — a value from disk — into a string a shell then re-parses.
//! The cost is that an editor whose *executable path* contains a space cannot be expressed in the
//! variable; such a value simply fails to spawn, and the failure names the program it tried.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::{Command, Stdio};

/// Which of doc-8 §7's two launch methods to use. Deserialized from the frontend: the UI offers the
/// methods [`EditorReadiness`] reports and names the one it is asking for, so the choice is the
/// user's rather than a fallback chain guessing on their behalf — a terminal-only `EDITOR` and an
/// association-launched GUI editor are not interchangeable, and only the user knows which they meant.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LaunchMethod {
    /// `VISUAL`, else `EDITOR` (doc-8 §7 `$EDITOR`).
    Configured,
    /// The platform's file-association launcher (doc-8 §7 OS の関連付け起動).
    Association,
}

/// The editor `VISUAL`/`EDITOR` names. `VISUAL` wins: the POSIX convention is that `EDITOR` may be a
/// line editor while `VISUAL` is the screen-oriented one, so a user who set both meant `VISUAL` for
/// a full-screen edit — which is what this path is for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfiguredEditor {
    /// Which variable it came from — shown by the UI, so "which one is in effect" is never guessed.
    pub variable: String,
    pub program: String,
    /// Arguments that precede the file path (`code -w` → `["-w"]`).
    pub args: Vec<String>,
}

/// Which launch methods this environment has (doc-8 §7). The two are independent: a machine with no
/// `EDITOR` still has the association launcher, which is why the UI draws a control per method and
/// states the reason for the one it cannot offer instead of collapsing both into one button.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorReadiness {
    pub configured: Option<ConfiguredEditor>,
    /// The association launcher's program name (`open`, `xdg-open`), for the UI to state what it would
    /// run. `None` on a platform with no launcher this module is willing to spawn (see
    /// [`association_launcher`]); whether a named program is actually installed is only learned by
    /// running it, and a missing one surfaces as a spawn failure.
    pub association: Option<String>,
}

/// What one launch spawned (doc-8 §7). Returned rather than discarded because a launch that "did
/// nothing visible" is the expected failure mode of a terminal-only editor started from a GUI
/// process: with the program and argument array on screen, the user can see what ran.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorLaunch {
    pub method: LaunchMethod,
    pub program: String,
    pub args: Vec<String>,
}

/// Why no editor was started. Kept apart because they lead to different user actions: `Unavailable`
/// means this environment has no launcher for the method (set `VISUAL`, or use the other control),
/// `LaunchFailed` means the launcher exists and the OS refused to start it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EditorError {
    Unavailable { detail: String },
    LaunchFailed { program: String, detail: String },
}

impl std::fmt::Display for EditorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EditorError::Unavailable { detail } => write!(f, "{detail}"),
            EditorError::LaunchFailed { program, detail } => {
                write!(f, "{program} を起動できません: {detail}")
            }
        }
    }
}

/// The process environment, behind a trait so [`probe`] is unit-testable without mutating the real
/// one — `std::env::set_var` is process-global and unsound to call while other threads run.
pub trait Environment {
    fn var(&self, name: &str) -> Option<String>;
}

/// [`Environment`] over the real process environment.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemEnv;

impl Environment for SystemEnv {
    fn var(&self, name: &str) -> Option<String> {
        std::env::var(name).ok()
    }
}

/// Starts a program. The seam that keeps [`open`]'s decisions — which program, which arguments, in
/// which order — testable without a real editor appearing on a developer's screen, mirroring
/// `BacklogCli` on the update side.
pub trait Launcher {
    /// Start `program` with `args` and return without waiting for it. An editor session outlasts the
    /// command that started it (doc-8 §7 relies on the file watch, not on exit detection), so a wait
    /// here would hang the caller for as long as the user keeps the file open.
    fn spawn(&self, program: &str, args: &[String]) -> std::io::Result<()>;
}

/// [`Launcher`] over the real OS.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemLauncher;

impl Launcher for SystemLauncher {
    fn spawn(&self, program: &str, args: &[String]) -> std::io::Result<()> {
        let child = Command::new(program)
            .args(args)
            // Atlas's own stdio is not a terminal the child may write to or read from: a child
            // inheriting it would interleave its output with Atlas's logs, and one reading stdin
            // would block on a stream nothing feeds.
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;
        // Reaped on a thread rather than waited on here: without a wait the child stays a zombie on
        // Unix until Atlas exits, and one per launch would accumulate across a session. The thread
        // costs nothing while the editor is open and ends when it closes.
        std::thread::spawn(move || {
            let mut child = child;
            let _ = child.wait();
        });
        Ok(())
    }
}

/// The launch methods this environment has (doc-8 §7). Called per open rather than cached: a
/// `VISUAL` exported after Atlas started will not appear (the variable is read from Atlas's own
/// environment), but re-probing keeps the answer to "which editor" in one place and costs nothing.
pub fn probe(env: &dyn Environment) -> EditorReadiness {
    EditorReadiness {
        configured: configured_editor(env),
        association: association_launcher().map(|launcher| launcher.program.to_string()),
    }
}

/// Read `VISUAL`, else `EDITOR`. A variable set to whitespace only is treated as unset: it names no
/// program, and reporting it as available would offer a control whose only outcome is a spawn error.
fn configured_editor(env: &dyn Environment) -> Option<ConfiguredEditor> {
    for variable in ["VISUAL", "EDITOR"] {
        let Some(value) = env.var(variable) else {
            continue;
        };
        let mut words = value.split_whitespace().map(str::to_string);
        let Some(program) = words.next() else {
            continue;
        };
        return Some(ConfiguredEditor {
            variable: variable.to_string(),
            program,
            args: words.collect(),
        });
    }
    None
}

/// The platform's association launcher: the program that hands a file to whatever the OS associates
/// with its extension, and the arguments that precede the path.
struct AssociationLauncher {
    program: &'static str,
    leading: &'static [&'static str],
}

#[cfg(target_os = "macos")]
const fn association_launcher() -> Option<AssociationLauncher> {
    Some(AssociationLauncher {
        program: "open",
        leading: &[],
    })
}

/// **No association launch on Windows.** The obvious candidate is `cmd /c start`, and it cannot be
/// used here: `cmd.exe` re-parses the command tail, so `Command::args`' argv boundaries stop meaning
/// anything once the child is a command interpreter. A managed file whose name contains `&`, `^` or
/// `%…%` — the scanner accepts any `.md` under the managed directories, whatever wrote it — would then
/// have the text after the metacharacter run as another command. That is the module's "no shell, ever"
/// rule broken in the one place it matters most, for a value that came off disk.
///
/// The correct launcher is `ShellExecuteW`, which needs a Win32 binding or Tauri's opener plugin — a
/// new production dependency, gated on confirmation (AGENTS) and not verifiable from this machine. So
/// the method is withheld here rather than shipped through a shell: `VISUAL`/`EDITOR` still works on
/// Windows, and the UI states why the other control is absent. Closing this gap is its own task.
#[cfg(target_os = "windows")]
const fn association_launcher() -> Option<AssociationLauncher> {
    None
}

/// `xdg-open` is the freedesktop.org entry point. `--` keeps a path that begins with `-` from being
/// read as an option; a system without `xdg-open` fails at spawn with the program named, which is the
/// honest report rather than a silent no-op.
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const fn association_launcher() -> Option<AssociationLauncher> {
    Some(AssociationLauncher {
        program: "xdg-open",
        leading: &["--"],
    })
}

/// Why the association method is not offered on this platform (doc-8 §7). Stated in full because the
/// UI shows it: an absent control with no reason is what doc-5 §5 rules out.
pub const NO_ASSOCIATION_LAUNCHER: &str =
    "このプラットフォームでは OS 関連付け起動を提供しません（cmd /c start はコマンド行を \
     cmd.exe に再解釈させ、ファイル名の & や %…% が別コマンドとして実行され得るため。\
     シェルを介さない関連付け API を使うまで無効にしています）。VISUAL・EDITOR は使えます";

/// What a launch would run, without running it (doc-8 §7). Separate from [`open`] so the decision —
/// which program, and the file path as its own argument array element — is asserted in tests without
/// a process being started.
pub fn plan(
    env: &dyn Environment,
    method: LaunchMethod,
    file: &Path,
) -> Result<EditorLaunch, EditorError> {
    let path = file.to_string_lossy().into_owned();
    match method {
        LaunchMethod::Configured => {
            let editor = configured_editor(env).ok_or_else(|| EditorError::Unavailable {
                detail: "VISUAL・EDITOR のいずれも設定されていません".to_string(),
            })?;
            let mut args = editor.args;
            args.push(path);
            Ok(EditorLaunch {
                method,
                program: editor.program,
                args,
            })
        }
        LaunchMethod::Association => {
            let launcher = association_launcher().ok_or_else(|| EditorError::Unavailable {
                detail: NO_ASSOCIATION_LAUNCHER.to_string(),
            })?;
            let mut args: Vec<String> = launcher.leading.iter().map(|a| a.to_string()).collect();
            args.push(path);
            Ok(EditorLaunch {
                method,
                program: launcher.program.to_string(),
                args,
            })
        }
    }
}

/// Open `file` in the user's editor (doc-8 §7). `file` is the management file itself — the caller
/// resolves it from its own read model, so no path from the frontend reaches a process here.
pub fn open(
    env: &dyn Environment,
    launcher: &dyn Launcher,
    method: LaunchMethod,
    file: &Path,
) -> Result<EditorLaunch, EditorError> {
    let launch = plan(env, method, file)?;
    launcher
        .spawn(&launch.program, &launch.args)
        .map_err(|error| EditorError::LaunchFailed {
            program: launch.program.clone(),
            detail: error.to_string(),
        })?;
    Ok(launch)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::BTreeMap;
    // Only the no-wait assertion below needs it, and that one is Unix-only.
    #[cfg(unix)]
    use std::time::Duration;

    #[derive(Default)]
    struct FakeEnv(BTreeMap<&'static str, &'static str>);

    impl FakeEnv {
        fn with(vars: &[(&'static str, &'static str)]) -> Self {
            FakeEnv(vars.iter().copied().collect())
        }
    }

    impl Environment for FakeEnv {
        fn var(&self, name: &str) -> Option<String> {
            self.0.get(name).map(|value| value.to_string())
        }
    }

    #[derive(Default)]
    struct FakeLauncher {
        spawns: RefCell<Vec<(String, Vec<String>)>>,
        fail: Option<std::io::ErrorKind>,
    }

    impl Launcher for FakeLauncher {
        fn spawn(&self, program: &str, args: &[String]) -> std::io::Result<()> {
            self.spawns
                .borrow_mut()
                .push((program.to_string(), args.to_vec()));
            match self.fail {
                Some(kind) => Err(std::io::Error::new(kind, "no such file")),
                None => Ok(()),
            }
        }
    }

    #[test]
    fn visual_wins_over_editor() {
        let env = FakeEnv::with(&[("VISUAL", "mate -w"), ("EDITOR", "vi")]);
        let editor = configured_editor(&env).expect("configured");
        assert_eq!(editor.variable, "VISUAL");
        assert_eq!(editor.program, "mate");
        assert_eq!(editor.args, vec!["-w".to_string()]);
    }

    #[test]
    fn editor_is_used_when_visual_is_absent() {
        let env = FakeEnv::with(&[("EDITOR", "vi")]);
        let editor = configured_editor(&env).expect("configured");
        assert_eq!(editor.variable, "EDITOR");
        assert_eq!(editor.program, "vi");
        assert!(editor.args.is_empty());
    }

    #[test]
    fn a_blank_variable_is_not_an_editor() {
        // Offering a control for `EDITOR=" "` would promise a launch whose only outcome is an error.
        let env = FakeEnv::with(&[("VISUAL", "   "), ("EDITOR", "  \t ")]);
        assert_eq!(configured_editor(&env), None);
        assert_eq!(probe(&env).configured, None);
    }

    #[test]
    fn the_file_path_is_its_own_argument_element() {
        // A path with spaces must survive as one element: no shell, so no word splitting (AGENTS).
        let env = FakeEnv::with(&[("EDITOR", "code -n")]);
        let launch = plan(
            &env,
            LaunchMethod::Configured,
            Path::new("/roots/my backlog/tasks/task-1 - a.md"),
        )
        .expect("planned");
        assert_eq!(launch.program, "code");
        assert_eq!(
            launch.args,
            vec![
                "-n".to_string(),
                "/roots/my backlog/tasks/task-1 - a.md".to_string()
            ]
        );
    }

    #[test]
    fn configured_launch_is_unavailable_without_the_variables() {
        let env = FakeEnv::default();
        let error = plan(&env, LaunchMethod::Configured, Path::new("/roots/a.md"))
            .expect_err("unavailable");
        assert!(matches!(error, EditorError::Unavailable { .. }));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn association_launch_needs_no_editor_variable() {
        // The whole point of the second method: a machine with no EDITOR can still open the file.
        let env = FakeEnv::default();
        let launch = plan(&env, LaunchMethod::Association, Path::new("/roots/a.md"))
            .expect("the association launcher needs no environment");
        assert_eq!(launch.method, LaunchMethod::Association);
        assert_eq!(
            launch.args.last().map(String::as_str),
            Some("/roots/a.md"),
            "the file is the last argument, after the launcher's own"
        );
        assert_eq!(probe(&env).association, Some(launch.program));
    }

    /// The launcher is never a command interpreter, on any platform. Spawning one would hand the path
    /// — a value read off disk — to something that re-parses the command tail, so a file named
    /// `a&calc.md` could run `calc`: `Command::args` guarantees argv boundaries to the child, not
    /// through it. Asserted as an invariant rather than per-platform so reintroducing `cmd /c start`,
    /// `sh -c` or `powershell -Command` fails here instead of in the field.
    #[test]
    fn the_association_launcher_is_never_a_command_interpreter() {
        const INTERPRETERS: [&str; 7] = [
            "cmd",
            "cmd.exe",
            "powershell",
            "powershell.exe",
            "pwsh",
            "sh",
            "bash",
        ];
        if let Some(launcher) = association_launcher() {
            assert!(
                !INTERPRETERS.contains(&launcher.program),
                "{} re-parses its command tail; a managed path must not be handed to one",
                launcher.program
            );
        }
    }

    /// The gap the invariant above leaves on Windows: rather than launching through `cmd`, the method
    /// is withheld with a stated reason (doc-5 §5), and `VISUAL`/`EDITOR` still works there.
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_withholds_the_association_method_instead_of_using_a_shell() {
        let env = FakeEnv::default();
        assert_eq!(probe(&env).association, None);
        let error = plan(
            &env,
            LaunchMethod::Association,
            Path::new("C:/roots/a&calc.md"),
        )
        .expect_err("no association launcher on Windows");
        assert!(matches!(error, EditorError::Unavailable { .. }));

        let env = FakeEnv::with(&[("EDITOR", "notepad")]);
        let launch = plan(
            &env,
            LaunchMethod::Configured,
            Path::new("C:/roots/a&calc.md"),
        )
        .expect("the configured editor still works");
        assert_eq!(launch.program, "notepad");
        assert_eq!(
            launch.args,
            vec!["C:/roots/a&calc.md".to_string()],
            "the path stays one argv element: no interpreter is involved"
        );
    }

    #[test]
    fn open_spawns_exactly_what_it_planned() {
        let env = FakeEnv::with(&[("VISUAL", "zed")]);
        let launcher = FakeLauncher::default();
        let file = Path::new("/roots/p/tasks/task-1 - a.md");
        let launch = open(&env, &launcher, LaunchMethod::Configured, file).expect("launched");
        assert_eq!(
            launcher.spawns.borrow().as_slice(),
            &[(
                "zed".to_string(),
                vec!["/roots/p/tasks/task-1 - a.md".to_string()]
            )]
        );
        assert_eq!(launch.program, "zed");
    }

    #[test]
    fn a_failed_spawn_names_the_program() {
        let env = FakeEnv::with(&[("EDITOR", "definitely-not-installed")]);
        let launcher = FakeLauncher {
            fail: Some(std::io::ErrorKind::NotFound),
            ..FakeLauncher::default()
        };
        let error = open(
            &env,
            &launcher,
            LaunchMethod::Configured,
            Path::new("/roots/a.md"),
        )
        .expect_err("spawn failed");
        match error {
            EditorError::LaunchFailed { program, .. } => {
                assert_eq!(program, "definitely-not-installed");
            }
            other => panic!("expected a launch failure, got {other:?}"),
        }
    }

    /// The one part [`FakeLauncher`] cannot cover: [`SystemLauncher`] really spawning, and its reaping
    /// thread. A program that exits at once is used, so no window appears and nothing is left running.
    #[test]
    fn the_system_launcher_starts_a_real_process() {
        #[cfg(unix)]
        let (program, args): (&str, Vec<String>) = ("true", Vec::new());
        #[cfg(windows)]
        let (program, args): (&str, Vec<String>) =
            ("cmd", vec!["/c".to_string(), "exit".to_string()]);
        SystemLauncher.spawn(program, &args).expect("spawned");
    }

    /// AC #2 / doc-8 §7 書き戻し: the launch does not wait for the editor. An editor session lasts as
    /// long as the user keeps the file open, and the save comes back through doc-9's watch — so a wait
    /// here would freeze the command for the length of the edit. Asserted against a program that stays
    /// alive far longer than the threshold, so the margin is not a timing guess.
    #[cfg(unix)]
    #[test]
    fn the_launch_does_not_wait_for_the_editor_to_exit() {
        use std::time::Instant;

        let started = Instant::now();
        SystemLauncher
            .spawn("sleep", &["30".to_string()])
            .expect("spawned");
        let elapsed = started.elapsed();
        assert!(
            elapsed < Duration::from_secs(2),
            "spawn returned after {elapsed:?}; it must not wait for the editor"
        );
    }

    #[test]
    fn the_system_launcher_reports_a_missing_program() {
        // What a mistyped `EDITOR` produces: the error is the caller's to report, never a silent no-op.
        let error = SystemLauncher
            .spawn("atlas-no-such-editor-program", &[])
            .expect_err("no such program");
        assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
    }

    #[test]
    fn nothing_here_opens_the_file() {
        // AC #1 / doc-2: the file is an argument, never a handle. A real temp file is used so that a
        // future change writing through this path would have to break this test to land.
        let dir = std::env::temp_dir().join(format!(
            "atlas-editor-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let file = dir.join("task-1 - a.md");
        std::fs::write(&file, "before").expect("seed");
        let env = FakeEnv::with(&[("EDITOR", "noop")]);
        let launcher = FakeLauncher::default();
        open(&env, &launcher, LaunchMethod::Configured, &file).expect("launched");
        assert_eq!(std::fs::read_to_string(&file).expect("read"), "before");
        std::fs::remove_dir_all(&dir).ok();
    }
}
