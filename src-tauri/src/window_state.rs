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
//!
//! **The correction therefore compares physical pixels rather than logical ones**, which is what makes
//! it settle on a scale factor that is not a dyadic rational. [`raised_to_minimum`] carries that.

use tauri::{
    plugin::{Builder as PluginBuilder, TauriPlugin},
    PhysicalSize, Runtime, Window, WindowEvent,
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

/// 最小寸法の下限適用: the physical size to resize to in place of `restored`, or `None` when it
/// already meets 最小寸法.
///
/// **The comparison is in physical pixels, and that is what makes the correction settle.** A resize is
/// granted in whole physical pixels, so on a scale factor that is not a dyadic rational the logical
/// 最小寸法 has no physical size that reads back as itself: at Windows' 130% (`LogPixels` 125, scale
/// `125/96`), `LogicalSize { 640.0, .. }` becomes `round(833.33) = 833` physical — `dpi` 0.1.2 rounds to
/// nearest — and 833 physical reads back as 639.744 logical, still under 最小寸法. Comparing there, the
/// correction would ask for the same 833 on every notification and never reach a size it accepts.
/// Comparing whole physical pixels against [`minimum_at`] instead, the size the correction asks for
/// *is* the one it will next be handed, so it settles in one step on every scale factor.
///
/// `None` rather than a size equal to `restored`, so the caller can skip the resize rather than
/// depend on what the OS does with one that changes nothing.
pub fn raised_to_minimum(restored: PhysicalSize<u32>, scale: f64) -> Option<PhysicalSize<u32>> {
    let minimum = minimum_at(scale)?;
    let width = restored.width.max(minimum.width);
    let height = restored.height.max(minimum.height);
    if width == restored.width && height == restored.height {
        return None;
    }
    Some(PhysicalSize { width, height })
}

/// 最小寸法 in the physical pixels of a display at `scale`, **rounded up**.
///
/// Up rather than to nearest because the value is a lower bound: `round` would place 130%'s minimum at
/// 833 physical = 639.744 logical, which is under the bound AC #3 states, where `ceil` places it at 834
/// = 640.512 and over it. The cost is at most one physical pixel of width the user did not ask for.
///
/// `None` on a scale factor `dpi` would reject — it asserts a normal positive `f64` on every conversion,
/// so a zero, infinite or NaN scale is a panic there rather than a bad number here. A window whose scale
/// cannot be read is left as it is, like one whose size cannot be.
fn minimum_at(scale: f64) -> Option<PhysicalSize<u32>> {
    if !scale.is_normal() || scale <= 0.0 {
        return None;
    }
    Some(PhysicalSize {
        width: (MIN_WIDTH * scale).ceil() as u32,
        height: (MIN_HEIGHT * scale).ceil() as u32,
    })
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
/// The correction resizes to [`minimum_at`]'s physical size, which the next notification then compares
/// against itself, so the `Resized` it causes in turn asks for nothing further.
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
    if let Some(raised) = raised_to_minimum(size, scale) {
        let _ = window.set_size(raised);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Windows' 130% custom scaling: `LogPixels` 125, so the scale factor is `125/96`. Named because it
    /// is the scale that a logical-pixel comparison could not settle on.
    const NON_DYADIC: f64 = 125.0 / 96.0;

    fn physical(width: u32, height: u32) -> PhysicalSize<u32> {
        PhysicalSize { width, height }
    }

    #[test]
    fn a_size_at_or_above_the_minimum_is_left_alone() {
        assert_eq!(raised_to_minimum(physical(1200, 800), 1.0), None);
        assert_eq!(raised_to_minimum(physical(640, 480), 1.0), None);
    }

    #[test]
    fn each_axis_is_raised_on_its_own() {
        assert_eq!(
            raised_to_minimum(physical(320, 800), 1.0),
            Some(physical(640, 800)),
            "a too-narrow window keeps the height it was restored to"
        );
        assert_eq!(
            raised_to_minimum(physical(1200, 240), 1.0),
            Some(physical(1200, 480)),
            "a too-short window keeps the width it was restored to"
        );
        assert_eq!(
            raised_to_minimum(physical(320, 240), 1.0),
            Some(physical(640, 480))
        );
    }

    /// The route the module comment describes: 1200×800 recorded on a 1x display, read on a 2x one,
    /// where the same physical size is 600×400 logical.
    #[test]
    fn a_record_halved_by_a_scale_factor_is_raised() {
        assert_eq!(
            raised_to_minimum(physical(1200, 800), 2.0),
            Some(physical(1280, 960)),
            "at 2x the minimum is 1280x960 physical, and 1200x800 is under it"
        );
    }

    /// The correction settles in one step, on a scale factor where a logical-pixel comparison would not:
    /// at `125/96` the logical 最小寸法 has no physical size that reads back as itself, so a correction
    /// deciding in logical pixels would ask for 833 forever. Regression for PR #138's [P2].
    #[test]
    fn the_corrected_size_needs_no_further_correction() {
        for scale in [1.0, 1.25, 2.0, NON_DYADIC, 1.1, 1.5, 3.0] {
            let corrected = raised_to_minimum(physical(320, 240), scale)
                .unwrap_or_else(|| panic!("320x240 is below the minimum at {scale}"));
            assert_eq!(
                raised_to_minimum(corrected, scale),
                None,
                "the correction at {scale} asked for {corrected:?} and would ask again"
            );
        }
    }

    /// The width the non-dyadic scale turns on: 833 physical is 639.744 logical, so it is under 最小寸法
    /// and has to be raised, and it is what a logical-pixel correction would have asked for.
    #[test]
    fn the_minimum_is_rounded_up_so_the_logical_size_is_never_under_it() {
        let minimum = minimum_at(NON_DYADIC).expect("a normal positive scale");
        assert_eq!(minimum, physical(834, 625));
        assert_eq!(
            raised_to_minimum(physical(833, 625), NON_DYADIC),
            Some(physical(834, 625)),
            "833 physical is 639.744 logical — under the bound AC #3 states"
        );
        assert!(
            f64::from(minimum.width) / NON_DYADIC >= MIN_WIDTH,
            "rounding up is what puts the logical width at or above 最小寸法"
        );
        assert!(f64::from(minimum.height) / NON_DYADIC >= MIN_HEIGHT);
    }

    /// `dpi` asserts a normal positive `f64` on every conversion, so these have to be refused here
    /// rather than carried into one.
    #[test]
    fn a_scale_factor_dpi_would_reject_corrects_nothing() {
        for scale in [0.0, -1.0, f64::NAN, f64::INFINITY, f64::MIN_POSITIVE / 2.0] {
            assert_eq!(
                minimum_at(scale),
                None,
                "{scale} is not a scale factor dpi would accept"
            );
            assert_eq!(raised_to_minimum(physical(320, 240), scale), None);
        }
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
