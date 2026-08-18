//! 窓の引継ぎ状態 (decision-38): what Atlas carries across a restart, and the one correction it
//! makes to what came back.
//!
//! **窓の引継ぎ状態** is the set of values recorded when the app exits and given back to the window on
//! the next launch — the window's size, and whether it was maximized. 窓の位置 is deliberately not in
//! it (decision-38 §3).
//!
//! **`tauri-plugin-window-state` holds it, not the アプリ設定ファイル.** decision-13's file degrades to
//! read-only on an unknown higher `schema_version` and then refuses to save at all, which would stop
//! the window size persisting for exactly the reason decision-13 refused to put settings in the
//! ledger file. The full comparison is decision-38 §2.
//!
//! **Neither the plugin nor macOS clamps a restored size to the window's minimum, so Atlas does** —
//! [`raised_to_minimum`], reached from [`plugin`]. Both halves were measured on 2026-08-18 with a
//! 窓状態ファイル holding 400×300: crate 2.4.1's `restore_state` passes the recorded size straight to
//! `set_size` and never reads `minWidth`/`minHeight`, and the window then reported itself as 400×300 —
//! so `minWidth: 640`/`minHeight: 480` did not hold against a programmatic resize. Windows and Linux
//! are **unmeasured**, which is a reason not to depend on them rather than a claim about them.
//!
//! **The recorded size is physical and the minimum is logical**, which is how a record this app itself
//! wrote can come back too small: the plugin stores the `PhysicalSize` that `WindowEvent::Resized`
//! carries, while `tauri.conf.json`'s `minWidth`/`minHeight` are logical pixels (tauri-utils 2.9.3 says
//! so on the field). A window left at the default 1200×800 on a 1x display records 1200×800 physical,
//! and reopening it on a 2x display makes that 600×400 logical — under 最小寸法. **That arithmetic is
//! read out of the two crates, not measured on two displays.**

use tauri::{
    plugin::{Builder as PluginBuilder, TauriPlugin},
    LogicalSize, PhysicalSize, Runtime, Window, WindowEvent,
};
use tauri_plugin_window_state::StateFlags;

/// 窓の引継ぎ状態 の範囲 — the 導入範囲 the dependency gate confirmed on 2026-08-18 (AC #1).
///
/// The plugin's own default is `StateFlags::all()`. `POSITION` is left out because the task's scope is
/// the size; `VISIBLE`, `DECORATIONS` and `FULLSCREEN` because Atlas never changes any of the three at
/// runtime, so recording them would let a hand-edited 窓状態ファイル start the app in a state no
/// operation of the app can produce.
///
/// `MAXIMIZED` is in it, and `SIZE` alone would have been the wrong pair to keep: the plugin's resize
/// handler skips its cache while the window is maximized, so with `SIZE` alone, quitting maximized
/// reopens at the size the window had *before* it was maximized.
pub const CARRIED: StateFlags = StateFlags::SIZE.union(StateFlags::MAXIMIZED);

/// 最小寸法 (TASK-145), in the logical pixels `tauri.conf.json` states it in.
///
/// A second spelling of `app.windows[0].minWidth`/`minHeight`, which is why
/// [`the_minimum_matches_the_window_config`] compares the two: this file is what a restored size is
/// measured against, and a minimum that drifted from the window's own would be a correction toward a
/// number nothing enforces.
pub const MIN_WIDTH: f64 = 640.0;
/// See [`MIN_WIDTH`].
pub const MIN_HEIGHT: f64 = 480.0;

/// 最小寸法の下限適用: the size to use in place of `restored`, or `None` when it already meets 最小寸法.
///
/// `None` rather than always returning a size, so the caller can skip the resize entirely: a
/// `set_size` that changes nothing is still a resize the OS reports, and the plugin's own
/// `WindowEvent::Resized` handler would take it as the user's new size.
pub fn raised_to_minimum(restored: LogicalSize<f64>) -> Option<LogicalSize<f64>> {
    let width = restored.width.max(MIN_WIDTH);
    let height = restored.height.max(MIN_HEIGHT);
    if width == restored.width && height == restored.height {
        return None;
    }
    Some(LogicalSize { width, height })
}

/// 最小寸法の下限適用 as a plugin of Atlas's own, so it reaches the window the other plugin restored.
///
/// **It watches `WindowEvent::Resized` rather than reading the size once, because a read taken right
/// after the restore is stale.** Measured on macOS on 2026-08-18: the restore runs in the plugin's own
/// `window_created` hook, and when Atlas's hook ran next `inner_size()` still reported the pre-restore
/// 1200×800; the `Resized(400×300)` carrying the restored size arrived afterwards. So a one-shot read
/// corrected nothing there, whichever order the two `.plugin(..)` calls sat in. `Builder::setup` is
/// earlier still — `app::setup` (tauri 2.11.5) builds the config's windows and runs the setup closure
/// before the event loop spins, and the hooks are queued onto that loop by `run_on_main_thread`.
///
/// **The one-shot read is kept as well, and not as a belt for the same brace.** Windows resizes
/// synchronously — `SetWindowPos` sends `WM_SIZE` to the window procedure rather than posting it — so
/// there the restore's `Resized` can be delivered while the plugin's own hook is still running, before
/// this one has a listener registered. The read covers that case and the listener covers macOS's; each
/// is the only one that fires on one of the two.
///
/// The correction resizes to 最小寸法 exactly, which is not below it, so the `Resized` it causes in turn
/// asks for nothing further.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("window-minimum")
        .on_window_ready(|window| {
            let watched = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::Resized(size) = event {
                    raise_to_minimum(&watched, *size);
                }
            });
            if let Ok(size) = window.inner_size() {
                raise_to_minimum(&window, size);
            }
        })
        .build()
}

/// A minimized window is left alone: what it reports is not the size it will come back to, and
/// resizing it then would undo the user's minimize. `tauri-plugin-window-state` skips its own cache in
/// the same case, which is what says the case occurs rather than being guarded against on principle.
fn raise_to_minimum<R: Runtime>(window: &Window<R>, size: PhysicalSize<u32>) {
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let Ok(scale) = window.scale_factor() else {
        return;
    };
    if let Some(raised) = raised_to_minimum(size.to_logical(scale)) {
        let _ = window.set_size(raised);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn size(width: f64, height: f64) -> LogicalSize<f64> {
        LogicalSize { width, height }
    }

    #[test]
    fn a_size_at_or_above_the_minimum_is_left_alone() {
        assert_eq!(raised_to_minimum(size(1200.0, 800.0)), None);
        assert_eq!(raised_to_minimum(size(MIN_WIDTH, MIN_HEIGHT)), None);
    }

    #[test]
    fn each_axis_is_raised_on_its_own() {
        assert_eq!(
            raised_to_minimum(size(320.0, 800.0)),
            Some(size(MIN_WIDTH, 800.0)),
            "a too-narrow window keeps the height it was restored to"
        );
        assert_eq!(
            raised_to_minimum(size(1200.0, 240.0)),
            Some(size(1200.0, MIN_HEIGHT)),
            "a too-short window keeps the width it was restored to"
        );
        assert_eq!(
            raised_to_minimum(size(320.0, 240.0)),
            Some(size(MIN_WIDTH, MIN_HEIGHT))
        );
    }

    /// The route the module comment describes: 1200×800 recorded on a 1x display, read on a 2x one.
    #[test]
    fn a_record_halved_by_a_scale_factor_is_raised() {
        let recorded = PhysicalSize {
            width: 1200_u32,
            height: 800_u32,
        };
        assert_eq!(
            raised_to_minimum(recorded.to_logical(2.0)),
            Some(size(MIN_WIDTH, MIN_HEIGHT)),
            "1200x800 physical is 600x400 logical at 2x, which is below 最小寸法 on both axes"
        );
    }

    /// The correction settles in one step, which is what keeps the `Resized` it causes from asking for
    /// another. Held as a test because the loop it rules out would only show up at runtime.
    #[test]
    fn the_corrected_size_needs_no_further_correction() {
        let corrected = raised_to_minimum(size(320.0, 240.0)).expect("below the minimum");
        assert_eq!(raised_to_minimum(corrected), None);
    }

    #[test]
    fn the_carried_flags_are_the_two_the_dependency_gate_confirmed() {
        assert!(CARRIED.contains(StateFlags::SIZE));
        assert!(CARRIED.contains(StateFlags::MAXIMIZED));
        for left_out in [
            StateFlags::POSITION,
            StateFlags::VISIBLE,
            StateFlags::DECORATIONS,
            StateFlags::FULLSCREEN,
        ] {
            assert!(
                !CARRIED.intersects(left_out),
                "{left_out:?} is outside the 導入範囲 AC #1 recorded — widening it is decision-38 §3"
            );
        }
    }

    /// [`MIN_WIDTH`]/[`MIN_HEIGHT`] against the window's own constraint, for the reason on those
    /// constants. Read out of the config the way `csp.rs` reads its policy, so the comparison is with
    /// what ships rather than with a copy.
    #[test]
    fn the_minimum_matches_the_window_config() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid JSON");
        let window = &config["app"]["windows"][0];
        assert_eq!(
            window["minWidth"].as_f64(),
            Some(MIN_WIDTH),
            "minWidth moved; 最小寸法の下限適用 corrects toward MIN_WIDTH, so the two have to agree"
        );
        assert_eq!(
            window["minHeight"].as_f64(),
            Some(MIN_HEIGHT),
            "minHeight moved; see minWidth"
        );
    }
}
