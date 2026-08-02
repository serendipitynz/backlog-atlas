//! 期限付きの子プロセス実行 (decision-18, decision-19). One place where Atlas launches an external
//! program and waits for it, so that "the wait is bounded" is a property of one implementation
//! rather than of each caller.
//!
//! Two callers use it: the Backlog CLI (doc-5 §5, CLI 終了期限) and the `gh` 照会 (doc-6 §6,
//! gh 照会期限). They were written apart, and the second was going to be a copy of the first — but
//! the first only became correct after five review rounds, all of them about the *same* mistake:
//! a call that waits without a bound sitting just outside the bounded region. Both places that
//! happened ([`Drain`] and the reap below) are unremarkable to read and impossible to notice twice.
//! A second copy would carry its own version of them.
//!
//! What is bounded here is every step, not just the child:
//!
//! - **waiting for the child** — [`poll_until`], since `std` has no timed wait (`Child::wait`
//!   blocks, `Child::try_wait` does not wait at all);
//! - **reaping a child that was killed** — a kill is attempted, not guaranteed, and a blocking
//!   `wait` on a process that survived it is exactly the unbounded wait the deadline removed;
//! - **finishing the pipe drain** — a pipe reaches EOF only when *every* writer has closed it, and
//!   a descendant that inherited it holds it open for as long as it likes.
//!
//! The caller's side of the contract is [`Cancel`]: a handle it may set from another thread to stop
//! a wait it no longer wants an answer to (decision-19 履歴読取の取消).

use std::io::Read;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// How often the wait loop asks whether the child has exited. There is no timed wait in `std`, so
/// the bound is a poll — 20 ms is under a sixth of the fastest Backlog CLI invocation measured
/// (117 ms), which keeps the added latency below what the measurement can distinguish.
const WAIT_POLL: Duration = Duration::from_millis(20);

/// 後始末猶予 (doc-5 §5, decision-18): how long the two cleanups that follow the wait may take.
/// Both would otherwise be unbounded, and each would put back the wait the deadline removed — see
/// the module comment for what they are. One second is far more than either needs when nothing is
/// wrong, and the whole of it is spent only when something really is still holding on.
const CLEANUP_GRACE: Duration = Duration::from_secs(1);

/// A caller's request to stop waiting, settable from another thread (decision-19 履歴読取の取消).
///
/// Cloning shares one flag, so the thread running [`launch`] and the thread that cancels hold the
/// same handle. A caller with nothing to cancel constructs one and keeps it to itself: no clone
/// escapes, so [`Cancel::is_cancelled`] can never become true and the deadline is the only bound.
#[derive(Debug, Clone, Default)]
pub struct Cancel(Arc<AtomicBool>);

impl Cancel {
    pub fn new() -> Self {
        Cancel::default()
    }

    /// Stop the wait. Idempotent, and safe to call after the wait has already returned — the flag
    /// outlives the launch, and nobody re-reads it.
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// A launch that produced a verdict: the child exited on its own and its output was taken.
#[derive(Debug)]
pub struct Completed {
    pub status: ExitStatus,
    pub stdout: String,
    pub stderr: String,
}

/// Why a launch produced no verdict.
#[derive(Debug)]
pub enum Stopped {
    /// The program could not be started at all. The caller names *which* program: an `io::Error`
    /// from a spawn carries the errno and nothing else.
    Spawn(std::io::Error),
    /// Atlas stopped waiting and killed the child. Which bound ended it — the deadline, or the
    /// caller's [`Cancel`] — is deliberately not reported here: the caller holds the handle and can
    /// tell, and a caller that never cancels would otherwise have to handle a case it cannot reach.
    ///
    /// `detail` names what was observed while stopping (a kill that failed, a poll that errored),
    /// and is `None` when nothing went wrong beyond the child outliving its bound. It never claims
    /// the process is gone: the kill is attempted, not guaranteed.
    Ended { detail: Option<String> },
}

/// Run `command` to completion, or stop within `deadline` and kill it.
///
/// stdin is closed rather than inherited, as `Command::output` also does: a program that decided to
/// prompt would otherwise wait on a terminal nobody is attached to, and the bound would be the only
/// thing that ever ended it. Both pipes are captured, and the caller's own `stdout`/`stderr`
/// settings on `command` are overwritten for that reason.
///
/// Worst case this returns after `deadline + CLEANUP_GRACE`, whatever the child or its descendants
/// do.
pub fn launch(
    command: &mut Command,
    deadline: Duration,
    cancel: &Cancel,
) -> Result<Completed, Stopped> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(Stopped::Spawn)?;
    // Both pipes are drained by their own thread for the whole life of the child. Reading them only
    // after the wait — the shape a `try_wait` loop invites — deadlocks the moment the child writes
    // more than one pipe buffer: it blocks on the write, never exits, and the deadline turns a
    // working program into a 期限到達. `Command::output` avoids this by reading concurrently; so
    // does this.
    let stdout = drain(child.stdout.take());
    let stderr = drain(child.stderr.take());
    let status = match wait_until(&mut child, deadline, CLEANUP_GRACE, cancel) {
        Waited::Exited(status) => status,
        Waited::Killed { detail } => {
            // Nothing is waited on here. Killing the direct child closes only the direct child's end
            // of the pipes; a descendant that inherited them keeps them open. Waiting for the
            // readers would therefore hand back the unbounded wait that was just ended. The threads
            // are left to finish on their own (see [`drain`]), and this launch's output is dropped:
            // there is no verdict to explain, only a bound that was reached.
            return Err(Stopped::Ended { detail });
        }
    };
    // The child exited, so its own ends are closed — but a descendant may still hold them, so even
    // here the drain gets a bound rather than a join. One shared instant for both pipes: two
    // sequential graces would double the bound for no gain.
    let until = Instant::now() + CLEANUP_GRACE;
    Ok(Completed {
        status,
        stdout: text(stdout.take(until)),
        stderr: text(stderr.take(until)),
    })
}

/// What became of the wait (decision-18).
enum Waited {
    Exited(ExitStatus),
    Killed { detail: Option<String> },
}

/// The two things the bounded wait does to a running process.
///
/// A trait rather than [`std::process::Child`] directly, for one failure only a fake can produce: a
/// kill that does not land. `SIGKILL` cannot be refused for one's own child, so the path where the
/// process survives the kill is unreachable with a real one — and it is the path where an unbounded
/// reap would quietly restore the wait the deadline exists to end.
trait Reapable {
    /// Whether the process has exited, without waiting for it to.
    fn poll(&mut self) -> std::io::Result<Option<ExitStatus>>;
    fn kill(&mut self) -> std::io::Result<()>;
}

impl Reapable for Child {
    fn poll(&mut self) -> std::io::Result<Option<ExitStatus>> {
        self.try_wait()
    }

    fn kill(&mut self) -> std::io::Result<()> {
        Child::kill(self)
    }
}

/// Wait for `process` until it exits, `deadline` elapses, or `cancel` is set; in the latter two
/// cases kill it and reap it within `grace`. Every step is bounded, so this returns after
/// `deadline + grace` at the very worst.
///
/// Nothing here is required to succeed. The kill may fail, the reap may find the process still
/// running, and a poll may error — each is recorded in the detail rather than turned into a longer
/// wait, because the only claim Atlas can always support is that it stopped waiting.
fn wait_until<P: Reapable>(
    process: &mut P,
    deadline: Duration,
    grace: Duration,
    cancel: &Cancel,
) -> Waited {
    let mut failed_poll: Option<String> = None;
    if let Some(status) = poll_until(process, Instant::now() + deadline, cancel, &mut failed_poll) {
        return Waited::Exited(status);
    }
    let mut notes: Vec<String> = failed_poll.take().into_iter().collect();
    if let Err(error) = process.kill() {
        notes.push(format!("terminating it failed: {error}"));
    }
    // Reaped so the bound leaves no zombie behind for the rest of the run — but on a bound of its
    // own, since a process that survived the kill is exactly what a blocking `wait` would sit on
    // forever. The caller's `cancel` is deliberately *not* passed on: it is already set on the path
    // that gets here, and honouring it would end the reap before it began.
    let uncancelled = Cancel::new();
    if poll_until(
        process,
        Instant::now() + grace,
        &uncancelled,
        &mut failed_poll,
    )
    .is_none()
    {
        notes.push(
            failed_poll
                .take()
                .unwrap_or_else(|| "it was still running after being terminated".to_string()),
        );
    }
    Waited::Killed {
        detail: (!notes.is_empty()).then(|| notes.join("; ")),
    }
}

/// Poll until the process has exited, `until` has passed, or `cancel` has been set.
///
/// A poll that errors is not treated as terminal: it means this attempt learned nothing, not that
/// the process is gone (on Unix a signal arriving during `waitpid` surfaces here as `EINTR`). The
/// last such error is left in `failed` for the caller to report.
fn poll_until<P: Reapable>(
    process: &mut P,
    until: Instant,
    cancel: &Cancel,
    failed: &mut Option<String>,
) -> Option<ExitStatus> {
    loop {
        match process.poll() {
            Ok(Some(status)) => return Some(status),
            Ok(None) => {}
            Err(error) => *failed = Some(format!("waiting on it failed: {error}")),
        }
        if cancel.is_cancelled() || Instant::now() >= until {
            return None;
        }
        std::thread::sleep(WAIT_POLL);
    }
}

/// One pipe being read on its own thread, with what has been read so far reachable *without* waiting
/// for EOF (decision-18). That is the whole point: joining the thread would mean waiting for the last
/// writer to close, and the last writer is not necessarily the process Atlas launched.
struct Drain {
    /// Bytes rather than a `String`: a program's output is not promised to be UTF-8, and the caller
    /// replaces what is not (as `Command::output` also leaves it to the caller to decide).
    buffer: Arc<Mutex<Vec<u8>>>,
    finished: std::sync::mpsc::Receiver<()>,
}

impl Drain {
    /// Wait until `until` for the pipe to end, then take what has been read by then. A drain that has
    /// not finished is abandoned, not stopped — see [`drain`] for what its thread does after that.
    fn take(self, until: Instant) -> Vec<u8> {
        let _ = self
            .finished
            .recv_timeout(until.saturating_duration_since(Instant::now()));
        std::mem::take(&mut *bytes(&self.buffer))
    }
}

fn drain<R: Read + Send + 'static>(pipe: Option<R>) -> Drain {
    let buffer = Arc::new(Mutex::new(Vec::new()));
    let (done, finished) = std::sync::mpsc::channel();
    // Weak, so the thread can tell whether anyone is still going to read what it stores.
    let sink = Arc::downgrade(&buffer);
    std::thread::spawn(move || {
        if let Some(mut pipe) = pipe {
            let mut chunk = [0u8; 8 * 1024];
            while let Ok(read) = pipe.read(&mut chunk) {
                if read == 0 {
                    break;
                }
                // Once the caller has taken its answer and moved on, keep *reading* — a writer must
                // never block on a pipe Atlas stopped emptying — but stop accumulating output nobody
                // will look at, which a descendant writing forever would otherwise grow without end.
                if let Some(buffer) = sink.upgrade() {
                    bytes(&buffer).extend_from_slice(&chunk[..read]);
                }
            }
        }
        // A closed receiver means the caller already gave up on this pipe; there is nobody to tell.
        let _ = done.send(());
    });
    Drain { buffer, finished }
}

/// The drained bytes as text.
fn text(bytes: Vec<u8>) -> String {
    String::from_utf8_lossy(&bytes).into_owned()
}

/// Reach the shared buffer, recovering a poisoned lock. A panicked reader must not turn a program's
/// failure into a panic in the command boundary: the exit code is the verdict (doc-5 §5), and the
/// worst a poisoned buffer costs is the reason text.
fn bytes(buffer: &Mutex<Vec<u8>>) -> std::sync::MutexGuard<'_, Vec<u8>> {
    buffer
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real process that outlives any deadline these tests would set, and one that ends at once.
    ///
    /// Both are the host's own programs rather than a fixture built here: what is under test is that
    /// [`launch`] bounds a *process*, so a fake would test nothing — there would be no child to
    /// kill. The pair is platform-specific because the programs are; the assertions are not.
    #[cfg(unix)]
    fn hangs_forever() -> (&'static str, Vec<&'static str>) {
        ("sleep", vec!["600"])
    }
    #[cfg(windows)]
    fn hangs_forever() -> (&'static str, Vec<&'static str>) {
        // `ping` waits a second between echoes, so 600 of them outlast any deadline here. Chosen over
        // `timeout` because `timeout` refuses to run without a console.
        ("ping", vec!["-n", "600", "127.0.0.1"])
    }

    fn command(program: &str, args: &[&str]) -> Command {
        let mut command = Command::new(program);
        command.args(args);
        command
    }

    #[test]
    fn a_cancelled_wait_ends_before_the_deadline_and_kills_the_child() {
        let (program, args) = hangs_forever();
        let cancel = Cancel::new();
        // Set before the launch: the flag is what the poll loop reads, and setting it up front makes
        // the test's timing independent of how fast a thread is scheduled. The race the production
        // path really has — a cancel arriving mid-wait — is covered by the flag being re-read every
        // `WAIT_POLL`, which the assertion below exercises through a deadline it must not reach.
        cancel.cancel();
        let started = Instant::now();
        let stopped = launch(
            &mut command(program, &args),
            Duration::from_secs(600),
            &cancel,
        )
        .expect_err("a cancelled wait produces no verdict");
        let elapsed = started.elapsed();

        assert!(
            matches!(stopped, Stopped::Ended { .. }),
            "cancelling ends the wait rather than failing the spawn: {stopped:?}"
        );
        assert!(
            elapsed < Duration::from_secs(5),
            "the cancel must end the wait, not the 600s deadline ({elapsed:?})"
        );
    }

    /// The positive counterpart. Without it the assertion above holds just as well for a [`launch`]
    /// that never waits for anything, including a program that would have answered.
    #[test]
    fn an_uncancelled_wait_returns_the_program_s_own_output() {
        let (program, args) = echoes();
        let completed = launch(
            &mut command(program, &args),
            Duration::from_secs(30),
            &Cancel::new(),
        )
        .expect("a program that exits produces a verdict");
        assert!(completed.status.success(), "the program exits 0");
        assert!(
            completed.stdout.contains("atlas"),
            "its stdout must come back: {:?}",
            completed.stdout
        );
    }

    #[cfg(unix)]
    fn echoes() -> (&'static str, Vec<&'static str>) {
        ("echo", vec!["atlas"])
    }
    #[cfg(windows)]
    fn echoes() -> (&'static str, Vec<&'static str>) {
        ("cmd", vec!["/c", "echo atlas"])
    }

    /// A process that never exits and whose kill never lands. Unreachable with a real child —
    /// `SIGKILL` cannot be refused for one's own process — and the only path where the reap could
    /// still be unbounded, so it is the one the fake exists for.
    struct SurvivesTheKill {
        kill_attempted: bool,
    }

    impl Reapable for SurvivesTheKill {
        fn poll(&mut self) -> std::io::Result<Option<ExitStatus>> {
            Ok(None)
        }

        fn kill(&mut self) -> std::io::Result<()> {
            self.kill_attempted = true;
            Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "refused",
            ))
        }
    }

    #[test]
    fn a_kill_that_does_not_land_still_ends_the_wait() {
        let mut process = SurvivesTheKill {
            kill_attempted: false,
        };
        let started = Instant::now();
        let waited = wait_until(
            &mut process,
            Duration::from_millis(100),
            Duration::from_millis(100),
            &Cancel::new(),
        );
        let elapsed = started.elapsed();

        let Waited::Killed { detail } = waited else {
            panic!("a process that never exits cannot be observed exiting");
        };
        // Positive counterpart to the bound: the kill really was attempted, so this is not passing
        // because the deadline path was skipped altogether.
        assert!(process.kill_attempted, "the kill must be attempted");
        assert!(
            elapsed < Duration::from_secs(5),
            "a reap that cannot succeed must not become the wait the deadline just ended \
             ({elapsed:?})"
        );
        let detail = detail.expect("a kill that did not land has to be reported");
        assert!(
            detail.contains("terminating it failed"),
            "the failed kill must be named: {detail}"
        );
        assert!(
            detail.contains("still running"),
            "so must the process outliving it: {detail}"
        );
    }

    /// The reap must run on its own bound rather than on the caller's cancel. A cancelled wait sets
    /// the flag *before* the kill, so a reap that honoured it would return without polling once —
    /// and would then report a process still running that had in fact been reaped.
    #[test]
    fn a_cancelled_wait_still_reaps_within_the_grace() {
        struct DiesOnTheSecondPoll {
            polls: u32,
        }
        impl Reapable for DiesOnTheSecondPoll {
            fn poll(&mut self) -> std::io::Result<Option<ExitStatus>> {
                self.polls += 1;
                // The first poll is the deadline wait's; from the second on the process is gone, so
                // the reap finds it immediately — provided the reap polls at all.
                if self.polls > 1 {
                    Ok(Some(exited_status()))
                } else {
                    Ok(None)
                }
            }
            fn kill(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        let cancel = Cancel::new();
        cancel.cancel();
        let mut process = DiesOnTheSecondPoll { polls: 0 };
        let Waited::Killed { detail } = wait_until(
            &mut process,
            Duration::from_secs(600),
            Duration::from_millis(500),
            &cancel,
        ) else {
            panic!("a cancelled wait cannot observe the process exiting on its own");
        };
        assert_eq!(
            detail, None,
            "a clean reap has nothing to report: {detail:?}"
        );
        assert!(process.polls >= 2, "the reap has to poll at least once");
    }

    /// An `ExitStatus` cannot be constructed portably, so borrow one from a program that exits.
    fn exited_status() -> ExitStatus {
        let (program, args) = echoes();
        Command::new(program)
            .args(args)
            .stdout(Stdio::null())
            .status()
            .expect("the host can run a program that exits")
    }
}
