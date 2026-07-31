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
//! | doc-8 §7 起動指定 | [`EditorCommand`] | the program to start and the arguments that precede the file path |
//! | doc-8 §7 起動指定の解決順 | [`resolve`] / [`EditorSource`] | which of アプリ設定 → `$VISUAL` → `$EDITOR` supplied the 起動指定 in effect |
//! | doc-8 §7 `$EDITOR` 起動 | [`LaunchMethod::Configured`] / [`ConfiguredEditor`] | the 起動指定 that resolution picked, with the source it came from |
//! | doc-8 §7 OS の関連付け起動 | [`LaunchMethod::Association`] / [`AssociationLauncher`] | how the platform hands a file to whatever it associates with the extension (`open`, `xdg-open`, `ShellExecuteW`) |
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
//! Every *process* launch is `Command::new(program).args(argv)`. A `VISUAL`/`EDITOR` value is split on ASCII
//! whitespace into a program and its leading arguments, which is the whole of the parsing: quoting,
//! `~` expansion and variable substitution are shell features, and running the value through a shell
//! to get them would put the file path — a value from disk — into a string a shell then re-parses.
//! The cost is that an editor whose *executable path* contains a space cannot be expressed in the
//! variable; such a value simply fails to spawn, and the failure names the program it tried. アプリ設定's
//! 外部エディタ指定 does not pay it: it stores the program and the argument array as separate values
//! ([`EditorCommand`]), so nothing has to be split and a path with spaces is expressible there.
//!
//! Windows' association launcher is the one launch that is not a process at all: `ShellExecuteW` takes
//! the path as a single wide-string parameter ([`OsCall::ShellExecute`]). That is *why* it is used —
//! there is no command line, so the metacharacters a managed file name may contain have nothing to be
//! re-parsed by. `cmd /c start` is the alternative and is ruled out, permanently, by
//! [`tests::no_platform_hands_a_managed_path_to_a_command_interpreter`].

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
    /// The 起動指定 that アプリ設定 → `$VISUAL` → `$EDITOR` resolves to (doc-8 §7 `$EDITOR` 起動).
    Configured,
    /// The platform's file-association launcher (doc-8 §7 OS の関連付け起動).
    Association,
}

/// 起動指定 (doc-8 §7): the program to start and the arguments that precede the file path. Held as a
/// program plus an argument *array* rather than a command line, because that is how it reaches the OS
/// (`Command::new(program).args(argv)`) — a single string would have to be re-split by something, and
/// the only thing that splits command lines properly is a shell (AGENTS: never one).
///
/// Also the shape アプリ設定 stores (decision-13 外部エディタ指定); [`crate::settings`] deserializes
/// this type straight out of `settings.toml`, so the file and the launch agree by construction.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EditorCommand {
    pub program: String,
    /// Arguments that precede the file path (`code -w` → `["-w"]`).
    #[serde(default)]
    pub args: Vec<String>,
}

impl EditorCommand {
    /// The 起動指定 this value names, or `None` when it names no program. A blank `program` is treated
    /// as unset for the same reason a blank `VISUAL` is (see [`from_variable`]): it would offer a
    /// control whose only outcome is a spawn error.
    fn named(&self) -> Option<&EditorCommand> {
        (!self.program.trim().is_empty()).then_some(self)
    }
}

/// Where the 起動指定 in effect came from (doc-8 §7 起動指定の解決順). A value rather than the
/// variable's name, because アプリ設定 is not a variable: reporting it as one would make the UI say
/// "アプリ設定 で開く（…）" in the slot that otherwise holds `VISUAL`/`EDITOR`, and a user reading that
/// would go looking for an environment variable that does not exist.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EditorSource {
    /// アプリ設定 の外部エディタ指定 (decision-13) — highest precedence (doc-8 §7).
    AppSettings,
    Visual,
    Editor,
}

/// The 起動指定 resolution picked, and where it came from. `VISUAL` wins over `EDITOR`: the POSIX
/// convention is that `EDITOR` may be a line editor while `VISUAL` is the screen-oriented one, so a
/// user who set both meant `VISUAL` for a full-screen edit — which is what this path is for. アプリ設定
/// wins over both, because doc-8 §7 gives it as the指定手段 for the users whose environment variables
/// never reach the process (a Finder/launcher start), and an environment that cannot be seen must not
/// override a setting the user typed into Atlas itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfiguredEditor {
    /// Which of the three supplied it — shown by the UI, so "which one is in effect" is never guessed.
    pub source: EditorSource,
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
    /// What the association method invokes, for the UI to state: a program name where the platform's
    /// launcher is a program (`open`, `xdg-open`), or `ShellExecuteW` where it is a Win32 call. Not an
    /// `Option`: every platform this project builds for has a launcher (see
    /// [`association_launcher_of`]), so an absent one is no longer a state to report. Whether a *named
    /// program* is installed is still only learned by running it, and a missing one surfaces as a
    /// launch failure.
    pub association: String,
}

/// What one launch did (doc-8 §7). Returned rather than discarded because a launch that "did
/// nothing visible" is the expected failure mode of a terminal-only editor started from a GUI
/// process: with the launcher and what it received on screen, the user can see what ran.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorLaunch {
    pub method: LaunchMethod,
    /// What was invoked: a program, or `ShellExecuteW` for Windows' association launcher.
    pub program: String,
    /// What it received. For a spawn this is the argument array verbatim (no shell, so no quoting to
    /// undo); for `ShellExecuteW` it is the one path parameter, which is the whole of that call's input.
    pub args: Vec<String>,
}

/// Why no editor was started. Kept apart because they lead to different user actions: `Unavailable`
/// means this environment has no 起動指定 for the method (set `VISUAL`, or use the other control),
/// `LaunchFailed` means the launcher was reached and the OS refused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EditorError {
    Unavailable {
        detail: String,
    },
    LaunchFailed {
        /// Which method was tried. Carried because the correction differs: a failed 起動指定 means the
        /// program named in アプリ設定/`VISUAL`/`EDITOR` is wrong, while a failed association means the OS
        /// has nothing registered for `.md` — advising the variables there would send the user to the
        /// one place that has no bearing on it.
        method: LaunchMethod,
        program: String,
        detail: String,
    },
}

impl std::fmt::Display for EditorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EditorError::Unavailable { detail } => write!(f, "{detail}"),
            // 「で開けません」rather than 「を起動できません」: `program` may be `ShellExecuteW`, and that
            // call's own failures are things like "nothing is associated with this extension" — the API
            // ran, so saying it could not be started would name the wrong thing.
            EditorError::LaunchFailed {
                program, detail, ..
            } => {
                write!(f, "{program} で開けません: {detail}")
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

    /// Hand `file` to the application the OS associates with it, without starting a child process
    /// (Windows `ShellExecuteW`). On the same trait as [`spawn`] rather than behind a `cfg`, so that
    /// one seam still covers every way this module reaches the OS and a fake can be asked which of the
    /// two a plan chose — the Windows branch cannot be compiled on this project's developer machine,
    /// so "the association method must not go through `spawn`" has to be assertable from any host.
    fn shell_execute(&self, file: &Path) -> std::io::Result<()>;
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

    /// `ShellExecuteW` on the path (doc-8 §7 OS の関連付け起動 on Windows, TASK-44 AC #1/#3).
    ///
    /// The path is one `lpFile` parameter — a counted wide string, not a token in a command line — so
    /// the `&`, `^` and `%…%` a managed file name may contain reach the shell as *characters of a file
    /// name*. That is the entire reason this is not `cmd /c start`: an interpreter re-parses its command
    /// tail, and `Command::args` guarantees argv boundaries *to* a child, not *through* one.
    #[cfg(target_os = "windows")]
    fn shell_execute(&self, file: &Path) -> std::io::Result<()> {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::System::Com::{
            CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
        };
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        // NUL-terminated, because `lpFile` is a C string. `encode_wide` does not add one.
        let path: Vec<u16> = file.as_os_str().encode_wide().chain(Some(0)).collect();

        // SAFETY: both calls are FFI with arguments this function owns. `path` outlives the
        // `ShellExecuteW` call (it is dropped at the end of the function, after the call returns), and
        // it is NUL-terminated as `lpFile` requires. Every other pointer parameter is null, which the
        // documented signature accepts for each of them.
        unsafe {
            // ShellExecuteW dispatches through COM to the registered handler, which the API documents as
            // requiring an initialized apartment. `commands::task_file_open` is
            // `#[tauri::command(async)]`, so this runs on a runtime worker thread that has none of its
            // own — without this the call would depend on whichever handler happens not to need COM.
            // The result is deliberately dropped: on a thread already initialized this returns S_FALSE
            // and changes nothing, and there is no matching CoUninitialize because the thread outlives
            // the launch and the shell may still be using the apartment. OLE1 DDE is disabled because
            // that legacy path is the one place ShellExecute can block on a peer that never answers.
            let _ = CoInitializeEx(
                std::ptr::null(),
                (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32,
            );
            let result = ShellExecuteW(
                std::ptr::null_mut(), // hwnd: no parent window; Atlas is not modal on this
                std::ptr::null(),     // lpOperation: null selects the file's default verb
                path.as_ptr(),        // lpFile
                std::ptr::null(),     // lpParameters: none — the file is data, not a program
                std::ptr::null(),     // lpDirectory: inherit Atlas's working directory
                SW_SHOWNORMAL,
            );
            // Documented convention: the returned HINSTANCE is not a handle. Above 32 means the launch
            // started; 32 and below *is* the error code — `GetLastError` is not the one to read here.
            let code = result as isize;
            if code > 32 {
                Ok(())
            } else {
                Err(shell_execute_error(code as i32))
            }
        }
    }

    /// Only Windows' association launcher is a `ShellExecuteW` call ([`association_launcher_of`]), so
    /// no launch on another platform reaches this. Reported rather than `panic!`ed: an unreachable state
    /// is still better surfaced to the user than made to abort the app.
    #[cfg(not(target_os = "windows"))]
    fn shell_execute(&self, _file: &Path) -> std::io::Result<()> {
        Err(std::io::Error::other(
            "ShellExecuteW はこのプラットフォームにありません",
        ))
    }
}

/// What a `ShellExecuteW` failure means, in the terms the panel states it in.
///
/// The low half of the range is Win32 error codes, which the OS can describe itself. `SE_ERR_*`
/// (26–32) are not — they are ShellExecute's own, and they collide with unrelated Win32 codes, so
/// `from_raw_os_error` would name the wrong thing for exactly the failure a user is most likely to
/// meet: 31 is "nothing is associated with this extension", not "a device attached to the system is
/// not functioning".
#[cfg(target_os = "windows")]
fn shell_execute_error(code: i32) -> std::io::Error {
    let named = match code {
        0 => "OS のメモリ・リソースが不足しています",
        26 => "共有違反です (SE_ERR_SHARE)",
        27 => "関連付けが不完全です (SE_ERR_ASSOCINCOMPLETE)",
        28 => "DDE の処理がタイムアウトしました (SE_ERR_DDETIMEOUT)",
        29 => "DDE の処理に失敗しました (SE_ERR_DDEFAIL)",
        30 => "他の DDE 処理が進行中です (SE_ERR_DDEBUSY)",
        31 => "この拡張子に関連付けられたアプリケーションがありません (SE_ERR_NOASSOC)",
        32 => "関連付け先の DLL が見つかりません (SE_ERR_DLLNOTFOUND)",
        _ => return std::io::Error::from_raw_os_error(code),
    };
    std::io::Error::other(named)
}

/// The launch methods this environment has (doc-8 §7). Called per open rather than cached: a
/// `VISUAL` exported after Atlas started will not appear (the variable is read from Atlas's own
/// environment), but re-probing keeps the answer to "which editor" in one place and costs nothing.
/// `settings` is アプリ設定's 外部エディタ指定 (decision-13), which the caller reads per call for the
/// same reason — it can change while Atlas runs.
pub fn probe(settings: Option<&EditorCommand>, env: &dyn Environment) -> EditorReadiness {
    probe_on(Platform::current(), settings, env)
}

/// [`probe`] for a named platform, so the association name every platform reports is asserted from any
/// host (see [`Platform`]).
fn probe_on(
    platform: Platform,
    settings: Option<&EditorCommand>,
    env: &dyn Environment,
) -> EditorReadiness {
    EditorReadiness {
        configured: resolve(settings, env),
        association: association_launcher_of(platform).name().to_string(),
    }
}

/// 起動指定の解決順 (doc-8 §7): アプリ設定 → `$VISUAL` → `$EDITOR`, first one that names a program.
/// `None` when none of the three does, which is what makes the `$EDITOR` control a disabled one with a
/// reason rather than a button that fails on press.
pub fn resolve(
    settings: Option<&EditorCommand>,
    env: &dyn Environment,
) -> Option<ConfiguredEditor> {
    if let Some(command) = settings.and_then(EditorCommand::named) {
        return Some(ConfiguredEditor {
            source: EditorSource::AppSettings,
            program: command.program.trim().to_string(),
            args: command.args.clone(),
        });
    }
    from_variable(env, "VISUAL", EditorSource::Visual)
        .or_else(|| from_variable(env, "EDITOR", EditorSource::Editor))
}

/// Read one editor variable. A variable set to whitespace only is treated as unset: it names no
/// program, and reporting it as available would offer a control whose only outcome is a spawn error.
///
/// The value is split on ASCII whitespace into a program and its leading arguments — the whole of the
/// parsing (see this module's header). アプリ設定 needs no such split, because it stores the program and
/// the argument array separately, which is why an editor whose path contains a space can be named
/// there and not in the variables.
fn from_variable(
    env: &dyn Environment,
    variable: &str,
    source: EditorSource,
) -> Option<ConfiguredEditor> {
    let value = env.var(variable)?;
    let mut words = value.split_whitespace().map(str::to_string);
    let program = words.next()?;
    Some(ConfiguredEditor {
        source,
        program,
        args: words.collect(),
    })
}

/// Which platform's association launcher to name. A value rather than `cfg` alone, so that every
/// platform's choice can be asserted from any host: this project is developed on macOS with no Windows
/// target installed, and a `cfg`-only table is checked by nothing until it ships. [`Platform::current`]
/// is the only place the build's own target is read.
// On any one target [`Platform::current`] constructs a single variant and the other two are built only
// by the tests that walk the table — which is the point of the type, not an oversight: it is what lets a
// macOS host assert the Windows launcher at all. Dead-code analysis sees construction, so it flags the
// two that this build does not target.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Platform {
    MacOs,
    Windows,
    /// Everything else, which for this project means the freedesktop.org platforms.
    Freedesktop,
}

impl Platform {
    /// The platform this build targets.
    const fn current() -> Platform {
        #[cfg(target_os = "macos")]
        return Platform::MacOs;
        #[cfg(target_os = "windows")]
        return Platform::Windows;
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        return Platform::Freedesktop;
    }

    /// Every platform, for the tests that assert the table as a whole. A `match` on the way out of
    /// [`association_launcher_of`] is what makes adding a platform force a launcher decision; this
    /// makes adding one force the invariants to be re-checked too.
    #[cfg(test)]
    const ALL: [Platform; 3] = [Platform::MacOs, Platform::Windows, Platform::Freedesktop];
}

/// The association launcher (doc-8 §7 OS の関連付け起動): how a platform hands a file to whatever it
/// associates with the extension. Two shapes, because they are not two flavours of the same call.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AssociationLauncher {
    /// A program the path is passed to as its own argv element (`open`, `xdg-open`).
    Program {
        program: &'static str,
        /// Arguments that precede the path.
        leading: &'static [&'static str],
    },
    /// Win32 `ShellExecuteW`: not a program, so there is no command tail at all — the path is one
    /// wide-string parameter to one call.
    ShellExecute,
}

/// The name `ShellExecuteW` appears under on screen. The Win32 call rather than a friendlier phrase,
/// because what the panel is letting the user check is precisely *that no interpreter is involved*
/// (TASK-44): 「シェル経由で開きます」and 「ShellExecuteW で開きます」are the two things being told apart.
pub const SHELL_EXECUTE_NAME: &str = "ShellExecuteW";

impl AssociationLauncher {
    /// What the UI states this method invokes.
    const fn name(self) -> &'static str {
        match self {
            AssociationLauncher::Program { program, .. } => program,
            AssociationLauncher::ShellExecute => SHELL_EXECUTE_NAME,
        }
    }
}

/// Which launcher each platform uses. Exhaustive `match`, so a new [`Platform`] cannot be added without
/// deciding — silently inheriting another platform's launcher is the failure this shape rules out.
const fn association_launcher_of(platform: Platform) -> AssociationLauncher {
    match platform {
        // `open` takes the path as its own argument; no `--` is needed because `open` reads a leading
        // `-` as a path once any option has been consumed, and there are no options here.
        Platform::MacOs => AssociationLauncher::Program {
            program: "open",
            leading: &[],
        },
        // `ShellExecuteW`, never `cmd /c start`. `cmd.exe` re-parses its command tail, so a managed file
        // named `a&calc.md` — the scanner accepts any `.md` under the managed directories, whatever
        // wrote it — would run `calc`. `Command::args` guarantees argv boundaries to a child, not
        // through one, so the guarantee ends the moment the child is an interpreter. `ShellExecuteW`
        // has no command line for the name's characters to be read as syntax (decision-15).
        Platform::Windows => AssociationLauncher::ShellExecute,
        // `xdg-open` is the freedesktop.org entry point. `--` keeps a path that begins with `-` from
        // being read as an option; a system without `xdg-open` fails at spawn with the program named,
        // which is the honest report rather than a silent no-op.
        Platform::Freedesktop => AssociationLauncher::Program {
            program: "xdg-open",
            leading: &["--"],
        },
    }
}

/// How a [`Planned`] launch reaches the OS.
enum OsCall {
    /// Spawn [`Planned::launch`]'s program with its arguments.
    Spawn,
    /// `ShellExecuteW` on the file. Here `launch.program`/`args` *describe* the call for the UI rather
    /// than being an argv — which is the point of the variant: there is no argv.
    ShellExecute,
}

/// What one launch does: what the UI is told, and the OS call that performs it. Kept together so the
/// choice is made once — a `plan` and an `open` that each work it out from the method is how a panel
/// that says `ShellExecuteW` could come to spawn something.
struct Planned {
    launch: EditorLaunch,
    call: OsCall,
}

/// What a launch would do, without doing it (doc-8 §7). Separate from [`open`] so the decision — which
/// launcher, and the file path as one element rather than text in a command line — is asserted in tests
/// without a process being started.
pub fn plan(
    settings: Option<&EditorCommand>,
    env: &dyn Environment,
    method: LaunchMethod,
    file: &Path,
) -> Result<EditorLaunch, EditorError> {
    plan_on(Platform::current(), settings, env, method, file)
}

/// [`plan`] for a named platform (see [`Platform`]).
fn plan_on(
    platform: Platform,
    settings: Option<&EditorCommand>,
    env: &dyn Environment,
    method: LaunchMethod,
    file: &Path,
) -> Result<EditorLaunch, EditorError> {
    planned(platform, settings, env, method, file).map(|planned| planned.launch)
}

fn planned(
    platform: Platform,
    settings: Option<&EditorCommand>,
    env: &dyn Environment,
    method: LaunchMethod,
    file: &Path,
) -> Result<Planned, EditorError> {
    let path = file.to_string_lossy().into_owned();
    match method {
        LaunchMethod::Configured => {
            let editor = resolve(settings, env).ok_or_else(|| EditorError::Unavailable {
                detail: "アプリ設定の外部エディタ指定・VISUAL・EDITOR のいずれも設定されていません"
                    .to_string(),
            })?;
            let mut args = editor.args;
            args.push(path);
            Ok(Planned {
                launch: EditorLaunch {
                    method,
                    program: editor.program,
                    args,
                },
                call: OsCall::Spawn,
            })
        }
        // Infallible: every platform has an association launcher, so this method no longer has an
        // "unavailable on this platform" outcome to report (TASK-44 AC #4).
        LaunchMethod::Association => Ok(match association_launcher_of(platform) {
            AssociationLauncher::Program { program, leading } => {
                let mut args: Vec<String> = leading.iter().map(|a| a.to_string()).collect();
                args.push(path);
                Planned {
                    launch: EditorLaunch {
                        method,
                        program: program.to_string(),
                        args,
                    },
                    call: OsCall::Spawn,
                }
            }
            AssociationLauncher::ShellExecute => Planned {
                launch: EditorLaunch {
                    method,
                    program: SHELL_EXECUTE_NAME.to_string(),
                    // One element and no leading arguments, because `lpFile` is the whole input.
                    args: vec![path],
                },
                call: OsCall::ShellExecute,
            },
        }),
    }
}

/// Open `file` in the user's editor (doc-8 §7). `file` is the management file itself — the caller
/// resolves it from its own read model, so no path from the frontend reaches a process here.
pub fn open(
    settings: Option<&EditorCommand>,
    env: &dyn Environment,
    launcher: &dyn Launcher,
    method: LaunchMethod,
    file: &Path,
) -> Result<EditorLaunch, EditorError> {
    open_on(Platform::current(), settings, env, launcher, method, file)
}

/// [`open`] for a named platform (see [`Platform`]), so which of the two OS calls a plan chose is
/// asserted against a fake from any host.
fn open_on(
    platform: Platform,
    settings: Option<&EditorCommand>,
    env: &dyn Environment,
    launcher: &dyn Launcher,
    method: LaunchMethod,
    file: &Path,
) -> Result<EditorLaunch, EditorError> {
    let Planned { launch, call } = planned(platform, settings, env, method, file)?;
    match call {
        OsCall::Spawn => launcher.spawn(&launch.program, &launch.args),
        OsCall::ShellExecute => launcher.shell_execute(file),
    }
    .map_err(|error| EditorError::LaunchFailed {
        method,
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
        /// The paths handed to `ShellExecuteW`. Recorded apart from `spawns` because the distinction is
        /// the whole of TASK-44: a path that reached a *spawn* on Windows reached a command line.
        shell_executes: RefCell<Vec<std::path::PathBuf>>,
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

        fn shell_execute(&self, file: &Path) -> std::io::Result<()> {
            self.shell_executes.borrow_mut().push(file.to_path_buf());
            match self.fail {
                Some(kind) => Err(std::io::Error::new(kind, "no such file")),
                None => Ok(()),
            }
        }
    }

    /// The 起動指定 アプリ設定 would hold (decision-13), for the resolution-order tests.
    fn setting(program: &str, args: &[&str]) -> EditorCommand {
        EditorCommand {
            program: program.to_string(),
            args: args.iter().map(|arg| arg.to_string()).collect(),
        }
    }

    #[test]
    fn visual_wins_over_editor() {
        let env = FakeEnv::with(&[("VISUAL", "mate -w"), ("EDITOR", "vi")]);
        let editor = resolve(None, &env).expect("configured");
        assert_eq!(editor.source, EditorSource::Visual);
        assert_eq!(editor.program, "mate");
        assert_eq!(editor.args, vec!["-w".to_string()]);
    }

    #[test]
    fn editor_is_used_when_visual_is_absent() {
        let env = FakeEnv::with(&[("EDITOR", "vi")]);
        let editor = resolve(None, &env).expect("configured");
        assert_eq!(editor.source, EditorSource::Editor);
        assert_eq!(editor.program, "vi");
        assert!(editor.args.is_empty());
    }

    /// doc-8 §7 起動指定の解決順 (TASK-46 AC #5): アプリ設定 → `$VISUAL` → `$EDITOR`. The setting has to
    /// win, because the case it exists for is a start from Finder/a launcher, where the variables that
    /// would otherwise decide are not even visible to the process.
    #[test]
    fn the_app_setting_wins_over_both_variables() {
        let env = FakeEnv::with(&[("VISUAL", "mate -w"), ("EDITOR", "vi")]);
        let configured = setting("/Applications/Zed.app/Contents/MacOS/cli", &["--wait"]);
        let editor = resolve(Some(&configured), &env).expect("configured");
        assert_eq!(editor.source, EditorSource::AppSettings);
        assert_eq!(editor.program, "/Applications/Zed.app/Contents/MacOS/cli");
        assert_eq!(editor.args, vec!["--wait".to_string()]);
    }

    #[test]
    fn without_the_app_setting_the_variables_still_resolve() {
        let env = FakeEnv::with(&[("EDITOR", "vi")]);
        // A setting whose program is blank names no program, so it must not shadow `EDITOR` — the same
        // rule a blank variable follows below.
        let blank = setting("  ", &[]);
        assert_eq!(
            resolve(Some(&blank), &env).expect("configured").source,
            EditorSource::Editor
        );
        assert_eq!(
            resolve(None, &env).expect("configured").source,
            EditorSource::Editor
        );
    }

    /// The program may contain spaces when it comes from アプリ設定: nothing splits it, because the
    /// setting stores the argument array separately. This is the whole reason the setting is not a
    /// command *line* — the variables cannot express such a path (see the module header).
    #[test]
    fn a_setting_program_with_spaces_stays_one_argument() {
        let env = FakeEnv::default();
        let configured = setting(
            "/Applications/My Editor.app/Contents/MacOS/my editor",
            &["-w"],
        );
        let launch = plan(
            Some(&configured),
            &env,
            LaunchMethod::Configured,
            Path::new("/roots/p/tasks/task-1 - a.md"),
        )
        .expect("planned");
        assert_eq!(
            launch.program,
            "/Applications/My Editor.app/Contents/MacOS/my editor"
        );
        assert_eq!(
            launch.args,
            vec!["-w".to_string(), "/roots/p/tasks/task-1 - a.md".to_string()]
        );
    }

    #[test]
    fn a_blank_variable_is_not_an_editor() {
        // Offering a control for `EDITOR=" "` would promise a launch whose only outcome is an error.
        let env = FakeEnv::with(&[("VISUAL", "   "), ("EDITOR", "  \t ")]);
        assert_eq!(resolve(None, &env), None);
        assert_eq!(probe(None, &env).configured, None);
    }

    #[test]
    fn the_file_path_is_its_own_argument_element() {
        // A path with spaces must survive as one element: no shell, so no word splitting (AGENTS).
        let env = FakeEnv::with(&[("EDITOR", "code -n")]);
        let launch = plan(
            None,
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
        let error = plan(
            None,
            &env,
            LaunchMethod::Configured,
            Path::new("/roots/a.md"),
        )
        .expect_err("unavailable");
        assert!(matches!(error, EditorError::Unavailable { .. }));
    }

    /// The whole point of the second method: a machine with no EDITOR can still open the file. Asserted
    /// for every platform, so no platform can lose it (TASK-44 AC #4 removed the one that had).
    #[test]
    fn every_platform_offers_the_association_method_without_an_editor_variable() {
        let env = FakeEnv::default();
        for platform in Platform::ALL {
            let launch = plan_on(
                platform,
                None,
                &env,
                LaunchMethod::Association,
                Path::new("/roots/a.md"),
            )
            .expect("the association launcher needs no environment");
            assert_eq!(launch.method, LaunchMethod::Association);
            assert_eq!(
                launch.args.last().map(String::as_str),
                Some("/roots/a.md"),
                "{platform:?}: the file is the last argument, after the launcher's own"
            );
            assert_eq!(
                probe_on(platform, None, &env).association,
                launch.program,
                "{platform:?}: the panel must name the launcher a launch would use"
            );
        }
    }

    /// No platform hands a managed path to a command interpreter. An interpreter re-parses its command
    /// tail, so a file named `a&calc.md` could run `calc`: `Command::args` guarantees argv boundaries to
    /// the child, not through it. Walked over every [`Platform`] rather than only the build's own,
    /// because the Windows arm cannot be compiled on the machine this project is developed on — a
    /// `cfg`-only check would pass here and ship the hole. Reintroducing `cmd /c start`,
    /// `powershell -Command` or `sh -c` fails here instead of in the field.
    #[test]
    fn no_platform_hands_a_managed_path_to_a_command_interpreter() {
        const INTERPRETERS: [&str; 7] = [
            "cmd",
            "cmd.exe",
            "powershell",
            "powershell.exe",
            "pwsh",
            "sh",
            "bash",
        ];
        for platform in Platform::ALL {
            match association_launcher_of(platform) {
                AssociationLauncher::Program { program, .. } => assert!(
                    !INTERPRETERS.contains(&program),
                    "{platform:?}: {program} re-parses its command tail; \
                     a managed path must not be handed to one"
                ),
                // No command line exists to be re-parsed, so there is nothing to check.
                AssociationLauncher::ShellExecute => {}
            }
        }
    }

    /// TASK-44 AC #1/#3, as far as a non-Windows host can assert it: Windows' association launch goes to
    /// `ShellExecuteW` with the path as its single parameter, and **never** to `spawn`. The metacharacters
    /// are in the fixture because they are the reason the method could not be shipped through `cmd`; here
    /// they have to survive untouched, since `lpFile` is a parameter and not text in a command line.
    /// (What only Windows can answer is whether the OS then opens it — AC #3's 実機確認.)
    #[test]
    fn windows_opens_the_association_through_shell_execute_and_never_a_spawn() {
        let env = FakeEnv::default();
        let launcher = FakeLauncher::default();
        let file = Path::new(r"C:\roots\my backlog\tasks\task-1 - a&b^c %PATH% d.md");
        let launch = open_on(
            Platform::Windows,
            None,
            &env,
            &launcher,
            LaunchMethod::Association,
            file,
        )
        .expect("launched");

        assert!(
            launcher.spawns.borrow().is_empty(),
            "a spawn means a command line exists, which is what this method avoids"
        );
        assert_eq!(
            launcher.shell_executes.borrow().as_slice(),
            &[file.to_path_buf()],
            "the path reaches ShellExecuteW as one value, metacharacters and spaces included"
        );
        assert_eq!(launch.program, SHELL_EXECUTE_NAME);
        assert_eq!(
            launch.args,
            vec![file.to_string_lossy().into_owned()],
            "what the panel states it passed: the one lpFile parameter, nothing else"
        );
    }

    /// The other side of the same table: where the launcher *is* a program, the launch stays a spawn with
    /// the path as its own argv element — so AC #1 did not turn the platforms that were already correct
    /// into shell-executes.
    #[test]
    fn the_program_launchers_still_spawn_with_the_path_as_one_element() {
        let env = FakeEnv::default();
        for (platform, program, leading) in [
            (Platform::MacOs, "open", Vec::new()),
            (Platform::Freedesktop, "xdg-open", vec!["--".to_string()]),
        ] {
            let launcher = FakeLauncher::default();
            open_on(
                platform,
                None,
                &env,
                &launcher,
                LaunchMethod::Association,
                Path::new("/roots/my backlog/tasks/task-1 - a&b.md"),
            )
            .expect("launched");
            assert!(launcher.shell_executes.borrow().is_empty());
            let mut expected = leading;
            expected.push("/roots/my backlog/tasks/task-1 - a&b.md".to_string());
            assert_eq!(
                launcher.spawns.borrow().as_slice(),
                &[(program.to_string(), expected)],
                "{platform:?}"
            );
        }
    }

    /// The `$EDITOR` method is unaffected by the platform: it was the fallback Windows had while the
    /// association method was withheld, and it still resolves the same way now that it is not.
    #[test]
    fn the_configured_method_is_the_same_on_every_platform() {
        let env = FakeEnv::with(&[("EDITOR", "notepad")]);
        for platform in Platform::ALL {
            let launch = plan_on(
                platform,
                None,
                &env,
                LaunchMethod::Configured,
                Path::new(r"C:\roots\a&calc.md"),
            )
            .expect("the configured editor works everywhere");
            assert_eq!(launch.program, "notepad");
            assert_eq!(
                launch.args,
                vec![r"C:\roots\a&calc.md".to_string()],
                "{platform:?}: the path stays one argv element; no interpreter is involved"
            );
        }
    }

    /// A `ShellExecuteW` failure names what went wrong rather than the API. `SE_ERR_NOASSOC` is the one a
    /// user actually meets — a `.md` with nothing registered for it — and it must not be reported through
    /// `from_raw_os_error`, whose text for 31 is about a malfunctioning device.
    #[cfg(target_os = "windows")]
    #[test]
    fn a_shell_execute_failure_is_reported_in_its_own_terms() {
        let error = shell_execute_error(31);
        assert!(
            error.to_string().contains("SE_ERR_NOASSOC"),
            "expected the association failure to be named, got {error}"
        );
        // Below the SE_ERR_* range the OS's own text is right, so it is used.
        assert_eq!(
            shell_execute_error(2).kind(),
            std::io::ErrorKind::NotFound,
            "ERROR_FILE_NOT_FOUND is a real Win32 code and stays one"
        );
    }

    #[test]
    fn open_spawns_exactly_what_it_planned() {
        let env = FakeEnv::with(&[("VISUAL", "zed")]);
        let launcher = FakeLauncher::default();
        let file = Path::new("/roots/p/tasks/task-1 - a.md");
        let launch = open(None, &env, &launcher, LaunchMethod::Configured, file).expect("launched");
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
            None,
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
        open(None, &env, &launcher, LaunchMethod::Configured, &file).expect("launched");
        assert_eq!(std::fs::read_to_string(&file).expect("read"), "before");
        std::fs::remove_dir_all(&dir).ok();
    }
}
