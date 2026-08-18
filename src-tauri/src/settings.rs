//! アプリ設定 (settings.toml) — read/write of the screen defaults that belong to no ledger entry
//! (decision-13, implements TASK-46). The second and last file Atlas writes: the ledger says *what to
//! read* (doc-3), this says *how to show it*, and decision-13 keeps them apart so the ledger's
//! read-only degrade cannot take the colour scheme with it.
//!
//! ## Referent table (doc term → identifier here)
//!
//! Fixed before naming, following the ledger/read/update modules' convention.
//!
//! | term | here | is |
//! |---|---|---|
//! | decision-13 アプリ設定 | [`AppSettings`] | the defaults decision-13's item table lists, plus the schema version |
//! | decision-13 アプリ設定ファイル | `settings.toml` under the app-config dir | the single file this module reads and writes |
//! | decision-12 表示テーマ | [`AppSettings::theme`] | the chosen colour set's name; `None` means OS の明暗に従う (TASK-47) |
//! | decision-35 表示言語 | [`AppSettings::language`] | which language the screen text is drawn in; `None` means OS の言語に従う (TASK-103) |
//! | doc-7 §3 カード情報量 | [`CardDensity`] | which column of doc-7 §3's assignment table a card is drawn from |
//! | doc-7 §5.2 既定の保存区分 | [`AppSettings::default_storage_filter`] | the 保存区分 the filter starts with |
//! | doc-8 §2.1 詳細配置 | [`DetailPlacement`] | 併置サイドバー / 中央モーダル / 全面シングルビュー |
//! | doc-7 §5.4 並び順 | [`CardOrder`] | which of the ten orders a レーンセル lays its cards out in |
//! | doc-9 §3.1 継続検出の可否 | [`AppSettings::watch_external_changes`] | whether the per-root file watch is started at all |
//! | doc-8 §7 外部エディタ指定 | [`AppSettings::external_editor`] | the 起動指定 that outranks `$VISUAL`/`$EDITOR` |
//! | doc-5 §4 実行ファイル解決の順序 1 段目 | [`AppSettings::backlog_cli`] | the Backlog CLI executable to run, outranking every automatic resolution |
//! | decision-29 外部コマンド指定 (`git`) | [`AppSettings::git_cli`] | the `git` executable doc-6 §3/§5 and doc-3 §3.2 launch |
//! | decision-29 外部コマンド指定 (`gh`) | [`AppSettings::gh_cli`] | the `gh` executable doc-6 §6 の GitHub 参照手段 launches |
//! | doc-7 §2.2 列折畳み | [`AppSettings::collapsed_columns`] + [`GridColumn`] | which columns are narrowed to bands, the 未分類列 among them |
//! | doc-7 §5.1 行折畳み | [`AppSettings::folded_rows`] | which project rows are folded, by slug |
//! | doc-7 §5.1 行非表示 | [`AppSettings::hidden_rows`] | which project rows are off the grid, by slug |
//! | decision-13 既定値で動いている旨 | [`SettingsStatus`] | why the values in hand are the defaults, and whether saving is allowed |
//!
//! ## Reading this file never stops the screen (AC #6)
//!
//! [`LoadedSettings::load`] is infallible. decision-13 is explicit that 設定が読めないことを理由に画面を
//! 止めない — the settings are display defaults, not a precondition for reading anything — so a missing,
//! unreadable or too-new file yields the defaults plus a [`SettingsStatus`] that says which of those
//! happened. The caller states it; the ledger, by contrast, *does* fail its load (doc-3 §2.2), because
//! an inconsistent ledger would make Atlas read the wrong roots.
//!
//! ## What this file must never hold
//!
//! 起動時に全ルートを読むか (doc-9 §3.2) is not a setting: with no persisted domain-model cache there is
//! nothing for a "do not read" state to refer to — the screen would have no cards and no baseline for
//! 更新前競合検出. Enforced by [`AppSettings`]'s field list and asserted in `the_documented_keys_and_no_others`,
//! so adding such a field has to break a test rather than merely disagree with a comment.
//!
//! **列折畳み・行折畳み・行非表示 used to be listed here** and are now three of the fields above
//! (decision-13 の 再起動をまたぐ保持の改訂, 2026-08-18, TASK-148). The 1 sentence that had excluded them
//! named 行非表示's 「件数も読めない」 property, which the other two do not have, and for 行非表示 itself the
//! screen it assumed changed when TASK-131 gave the menu every registered project (doc-7 §2.1). The
//! same test now asserts that all three *are* in the key set, so removing one silently is equally
//! impossible.

use crate::editor::EditorCommand;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::{Path, PathBuf};

/// The only schema version this build writes. A file at exactly this version is writable; an unknown
/// *higher* one degrades to read-only and is left untouched (decision-13, AC #1) — the same rule the
/// ledger follows (doc-3 §2.2), which decision-13 asks the two files to keep in step.
///
/// Raised to 2 when `backlog_cli` was added (TASK-60, decision-16), to 3 when `default_card_order`
/// was (TASK-132), to 4 when `git_cli` and `gh_cli` joined them (TASK-156, decision-29), to 5
/// when `language` did (TASK-103, decision-35), and to 6 when `collapsed_columns`, `folded_rows` and
/// `hidden_rows` did (TASK-148, decision-13 の 再起動をまたぐ保持の改訂).
/// decision-13 puts 項目の追加 under this version's management, and the read-only
/// degrade is what the raise buys: left where it was, a build predating the field would read the newer
/// file as its own version, let serde drop the key it does not know, and delete the value on its next
/// save. Older files are unaffected — a *lower* version loads with the missing keys defaulted, and the
/// next save writes this version.
pub const KNOWN_SCHEMA_VERSION: u32 = 6;

/// カード情報量 (doc-7 §3): which column of the card assignment table is in force.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardDensity {
    S,
    /// 既定は M (doc-7 §3): L's variable-length items (通常ラベル・assignee) make a card's height
    /// unpredictable, so the default keeps the row count readable.
    #[default]
    M,
    L,
}

/// 詳細配置 (doc-8 §2.1). The default is the 併置サイドバー — it is the placement doc-8 §2.1 lists
/// first and the one the detail panel is built as today, so a first run keeps behaving as it did
/// before this file existed. doc-8 §2.2 fixes only that the choice persists, not which one starts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DetailPlacement {
    /// 併置サイドバー — 30rem beside the swimlane.
    #[default]
    Sidebar,
    /// 中央モーダル — two columns over the swimlane.
    Modal,
    /// 全面シングルビュー — every section always open.
    Full,
}

/// 並び順 (doc-7 §5.4): which of the ten orders the cards in a レーンセル are laid out in.
///
/// One flat token per order rather than an attribute paired with a direction, because the ten are
/// exactly the ten choices the 絞り込み帯's control offers — the value in `settings.toml` and the
/// entry the user picked are then the same enumeration, and the file stays a flat, hand-editable
/// table (decision-13 形式). A nested `{ attribute, direction }` would serialize as a TOML sub-table,
/// which also has to come after every scalar key in the file.
///
/// Attribute order follows the 原文 (2026-08-09 のユーザーの要求); the direction order is 昇順 then
/// 降順 for **every** attribute, which is where the control's list departs from it — the 原文 wrote
/// priority the other way round, and one attribute reading backwards is what a reader notices first
/// (2026-08-10 のユーザー判断). This is also the order the control lists them in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardOrder {
    PriorityAsc,
    /// 既定 (doc-7 §5.4). With the shared tie-break behind it, this is the order the grid had before
    /// the orders became selectable, card for card. `#[default]` rather than first: the list's order
    /// is the screen's, and the default is not tied to a position in it.
    #[default]
    PriorityDesc,
    TaskIdAsc,
    TaskIdDesc,
    UpdatedAsc,
    UpdatedDesc,
    CreatedAsc,
    CreatedDesc,
    MilestoneAsc,
    MilestoneDesc,
}

/// One 保存区分 choice the filter can hold (doc-7 §5.2). The four doc-4 §3.4 states plus
/// `indeterminate`, which is a task file found outside the recognized scan locations (`storage_state`
/// is `None`). The indeterminate case is included because the filter itself offers it: doc-4 §3.4
/// forbids treating such a task as `active` while doc-4 §5 requires keeping it, so the screen has a
/// selection for it — and a default that could not express what the filter holds would silently drop
/// the user's choice on the next start.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageSelection {
    Active,
    Draft,
    Completed,
    Archive,
    Indeterminate,
}

/// A column 列折畳み can name (doc-7 §2.2): the four 正準ステータス列 and the 未分類列.
///
/// Its own enum rather than [`StatusColumn`], which is what the four canonical ones are everywhere
/// else, for two reasons: 未分類列 is not a status (doc-7 §2.2 keeps it out of the canonical set), and
/// this value has to *deserialize* — `StatusColumn` only serializes, because nothing else reads a
/// column back in. The name matches `swimlane.ts`'s `GridColumn`, which is the union this list
/// mirrors, and `the_four_columns_spell_their_status_column_tokens` holds the four tokens against
/// `StatusColumn`'s so a rename there cannot leave a settings file naming columns by a spelling the
/// screen no longer uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GridColumn {
    ToDo,
    InProgress,
    InReview,
    Done,
    Unmapped,
}

/// アプリ設定 (decision-13): the items its table lists, plus the schema version that governs them.
/// The count is not written here — decision-13's table is the register, and a number in this sentence
/// would go stale on the next item without anything failing.
///
/// Field names are the TOML keys *and* the IPC field names — no `rename_all` — which is the ledger's
/// convention for the two app-config files (doc-3 §2.2 keeps them hand-editable, and a key that reads
/// differently in the file than in the code is one more thing to keep in step).
///
/// Every field carries a `default`, so a hand-edited file that omits one loads with that item at its
/// default instead of failing the whole read. `schema_version` deliberately has none: it is what
/// decides whether the rest may be trusted or written, and a file without it is not a version of this
/// format — it degrades through [`SettingsStatus::Unreadable`] like any other unparseable file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppSettings {
    pub schema_version: u32,
    /// 表示テーマ (decision-12). `None` = 未選択, which means OS の明暗に従う — decision-12 makes the
    /// OS-following state the default and an explicit choice override it, so "not chosen" has to be
    /// representable rather than being spelled as some theme's name.
    #[serde(default)]
    pub theme: Option<String>,
    /// 表示言語 (decision-35). `None` = 言語未選択, which means OS の言語に従う. Held as an option for
    /// 表示テーマ's reason: the OS-following state is the default and an explicit choice overrides it,
    /// so "not chosen" must be representable rather than being spelled as one of the two languages.
    ///
    /// The crate neither reads nor honours this value — it decides no text, because decision-35 moved
    /// every failure reason it used to word into a 失敗理由符号 the frontend renders. It is stored here
    /// because decision-13 makes this file the home for 読んだものをどう見せるか, and travels to the
    /// screen with the rest of the settings.
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub card_density: CardDensity,
    /// 既定の保存区分 (doc-7 §5.2 既定は active のみ). Stored as the selection list rather than a flag
    /// per state, so it round-trips exactly what the filter holds.
    #[serde(default = "default_storage_filter")]
    pub default_storage_filter: Vec<StorageSelection>,
    #[serde(default)]
    pub default_detail_placement: DetailPlacement,
    /// 既定の並び順 (doc-7 §5.4). Written by the 絞り込み帯's control as well as by the 設定画面 —
    /// choosing an order *is* choosing the default, the same second-writer shape 既定の詳細配置 has
    /// (doc-8 §2.2).
    #[serde(default)]
    pub default_card_order: CardOrder,
    /// 継続検出の可否 (doc-9 §3.1). Default true: the watch is what keeps cards in step with the files,
    /// and doc-9 §3.1 frames turning it off as a deliberate choice with a stated consequence.
    #[serde(default = "watch_external_changes_default")]
    pub watch_external_changes: bool,
    /// 列折畳み (doc-7 §2.2): the columns narrowed to bands in every row at once.
    ///
    /// The three fields here are the values decision-13 kept *out* of this file until 2026-08-18 (its
    /// 再起動をまたぐ保持の改訂). They carry no `default_` prefix because what is stored is the state
    /// that was in force, not a default given to something new — the 既定の… items above are the other
    /// kind. Defaulted to empty rather than required, so a file written by a build predating them
    /// loads as "nothing folded" instead of degrading to [`SettingsStatus::Unreadable`].
    ///
    /// **A set naming all four 正準ステータス列 is not rejected here.** doc-7 §2.2 forbids collapsing
    /// every column, but the rule is the screen's, and the frontend's 復元時の正規化 is what applies it
    /// (doc-7 §5.1) — refusing the file instead would take every other setting down with it over a
    /// hand-edit this build can recover from.
    #[serde(default)]
    pub collapsed_columns: Vec<GridColumn>,
    /// 行折畳み (doc-7 §5.1): the project rows whose レーンセル群 are folded away, by slug.
    ///
    /// Slugs rather than an entry-side flag, so this file still defines nothing about *what to read*
    /// (decision-13 §3 の改訂). A slug the ledger no longer has is dropped by 復元時の正規化, not here:
    /// this module never reads the ledger, and a value it cannot judge is not one it should discard.
    #[serde(default)]
    pub folded_rows: Vec<String>,
    /// 行非表示 (doc-7 §5.1): the project rows taken off the grid, by slug. Same shape and same
    /// normalization as `folded_rows`.
    #[serde(default)]
    pub hidden_rows: Vec<String>,
    /// 実行ファイル解決の順序 の 1 段目 (doc-5 §4, decision-16): the Backlog CLI executable to run,
    /// as an absolute path. Set, it is used as written — the resolution does not check that it exists
    /// and does not fall back, so a mistyped path surfaces as its own 起動失敗 naming the path rather
    /// than as "some other CLI ran". Unset — which is the normal case, since the automatic resolution
    /// covers an npm install on all three platforms — the resolution continues to its later steps.
    ///
    /// Placed before `external_editor` for the reason stated there: this is a scalar and TOML forbids
    /// one after a sub-table. Skipped when unset, like the editor override.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backlog_cli: Option<PathBuf>,
    /// 外部コマンド指定 for `git` (decision-29): the executable doc-6 §3 コミット検索, doc-6 §5
    /// remote ホスト種別の判別 and doc-3 §3.2 Git remote 有無属性判定 all launch. Same rule as
    /// `backlog_cli` — used as written, no existence check, no fallback.
    ///
    /// This one has a consequence the other two do not: 有無属性判定 records *absence* when `git`
    /// cannot be launched (doc-3 §3.2), so an unresolvable `git` does not fail loudly, it registers
    /// every project as having no remote and takes doc-6 §6 関連解決 down with it silently. That is
    /// the case TASK-156 was raised for, and it is why this item exists rather than being left to
    /// PATH.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub git_cli: Option<PathBuf>,
    /// 外部コマンド指定 for `gh` (decision-29): the executable doc-6 §6 の GitHub 参照手段 launches
    /// (decision-14). Same rule as `backlog_cli`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gh_cli: Option<PathBuf>,
    // Last field on purpose: it serializes as the `[external_editor]` sub-table, and TOML forbids a
    // scalar key appearing after a table within the same table. Skipped when unset so a file with no
    // editor override stays terse.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_editor: Option<EditorCommand>,
}

fn default_storage_filter() -> Vec<StorageSelection> {
    vec![StorageSelection::Active]
}

fn watch_external_changes_default() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            schema_version: KNOWN_SCHEMA_VERSION,
            theme: None,
            language: None,
            card_density: CardDensity::default(),
            default_storage_filter: default_storage_filter(),
            default_detail_placement: DetailPlacement::default(),
            default_card_order: CardOrder::default(),
            watch_external_changes: watch_external_changes_default(),
            collapsed_columns: Vec::new(),
            folded_rows: Vec::new(),
            hidden_rows: Vec::new(),
            backlog_cli: None,
            git_cli: None,
            gh_cli: None,
            external_editor: None,
        }
    }
}

/// Why the settings in hand are what they are, and whether they may be written back (decision-13).
/// One value rather than a `read_only` flag like the ledger's, because decision-13 gives three
/// different things to tell the user — nothing saved yet, the file could not be read, the file is
/// newer than this build — and only the last of them also forbids saving.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum SettingsStatus {
    /// Read from the file at the known schema version.
    Stored,
    /// No file yet (first run). The defaults are in force and the next save creates it.
    Absent,
    /// The file exists but could not be read (bad TOML, an unknown enum value, an I/O failure).
    /// The defaults are in force; decision-13 has the next save rebuild the file.
    Unreadable { detail: String },
    /// `schema_version` is newer than this build understands. The defaults are in force and saving is
    /// refused, so a format this build cannot judge is never overwritten (AC #1).
    ReadOnly { version: u32 },
}

impl SettingsStatus {
    /// Whether a save may proceed. Only the unknown-newer file forbids it; a missing or corrupt file
    /// is rebuilt by the next save (decision-13).
    pub fn writable(&self) -> bool {
        !matches!(self, SettingsStatus::ReadOnly { .. })
    }
}

/// The settings in force, and why (decision-13). Mirrors [`crate::ledger::LoadedLedger`]'s pairing of
/// values with their compatibility state, so both app-config files are consumed the same way.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedSettings {
    pub settings: AppSettings,
    pub status: SettingsStatus,
}

/// Why a save did not happen. Reading has no error type — it degrades instead (see the module header).
#[derive(Debug)]
pub enum SettingsError {
    Io(std::io::Error),
    TomlSer(toml::ser::Error),
    /// Save refused: the on-disk `schema_version` is newer than this build supports.
    ReadOnly(u32),
}

impl fmt::Display for SettingsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SettingsError::Io(e) => write!(f, "settings I/O error: {e}"),
            SettingsError::TomlSer(e) => write!(f, "settings serialize error: {e}"),
            SettingsError::ReadOnly(v) => write!(
                f,
                "settings are read-only: schema_version {v} is newer than this build supports \
                 (known {KNOWN_SCHEMA_VERSION}); refusing to overwrite"
            ),
        }
    }
}

impl std::error::Error for SettingsError {}

impl From<std::io::Error> for SettingsError {
    fn from(e: std::io::Error) -> Self {
        SettingsError::Io(e)
    }
}

impl From<toml::ser::Error> for SettingsError {
    fn from(e: toml::ser::Error) -> Self {
        SettingsError::TomlSer(e)
    }
}

impl LoadedSettings {
    /// Read `settings.toml`. Never fails: every way of not getting values becomes a
    /// [`SettingsStatus`] beside the defaults (AC #6, decision-13).
    pub fn load(path: &Path) -> Self {
        let text = match std::fs::read_to_string(path) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return LoadedSettings::defaults(SettingsStatus::Absent)
            }
            Err(error) => {
                return LoadedSettings::defaults(SettingsStatus::Unreadable {
                    detail: error.to_string(),
                })
            }
        };
        let settings: AppSettings = match toml::from_str(&text) {
            Ok(settings) => settings,
            Err(error) => {
                return LoadedSettings::defaults(SettingsStatus::Unreadable {
                    detail: error.to_string(),
                })
            }
        };
        if settings.schema_version > KNOWN_SCHEMA_VERSION {
            // Defaults, not the parsed values: decision-13 says an unknown higher version runs 既定値で
            // — a newer format may give an existing key a meaning this build would misapply, and the
            // file is not ours to interpret. Saving is refused so it survives untouched.
            return LoadedSettings::defaults(SettingsStatus::ReadOnly {
                version: settings.schema_version,
            });
        }
        LoadedSettings {
            settings,
            status: SettingsStatus::Stored,
        }
    }

    fn defaults(status: SettingsStatus) -> Self {
        LoadedSettings {
            settings: AppSettings::default(),
            status,
        }
    }
}

/// Write `settings` to `path`, creating the parent directory as needed, and return the state that now
/// holds. The on-disk version is re-checked here rather than trusted from an earlier load: the file
/// may have been replaced by a newer build (or a hand edit) while Atlas ran, and AC #1's rule is about
/// what is on disk at the moment of writing.
///
/// The stored `schema_version` is this build's, whatever the caller passed: what is written is what
/// this build's field set means, so claiming another version would misdescribe the bytes.
pub fn save(path: &Path, settings: &AppSettings) -> Result<LoadedSettings, SettingsError> {
    save_with(&crate::store::SystemFiles, path, settings)
}

/// [`save`] against a given 保存境界. The boundary is an argument so a test can fail one step of the
/// 一時ファイル置換 and assert that settings this build could not finish writing left the previous
/// ones readable — without it, decision-13's degrade would hide the loss behind the defaults.
pub fn save_with(
    files: &dyn crate::store::Files,
    path: &Path,
    settings: &AppSettings,
) -> Result<LoadedSettings, SettingsError> {
    if let SettingsStatus::ReadOnly { version } = LoadedSettings::load(path).status {
        return Err(SettingsError::ReadOnly(version));
    }
    let stored = AppSettings {
        schema_version: KNOWN_SCHEMA_VERSION,
        ..settings.clone()
    };
    crate::store::replace(files, path, &toml::to_string_pretty(&stored)?)?;
    Ok(LoadedSettings {
        settings: stored,
        status: SettingsStatus::Stored,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
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
                "atlas-settings-test-{}-{nanos}-{n}",
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

    // --- defaults and persistence (AC #2/#3) -----------------------------------------------

    #[test]
    fn a_missing_file_yields_the_defaults_and_says_so() {
        let tmp = TempDir::new();
        let loaded = LoadedSettings::load(&tmp.path.join("settings.toml"));
        assert_eq!(loaded.status, SettingsStatus::Absent);
        assert_eq!(loaded.settings, AppSettings::default());
        assert_eq!(loaded.settings.card_density, CardDensity::M);
        assert_eq!(
            loaded.settings.default_storage_filter,
            vec![StorageSelection::Active]
        );
        assert_eq!(
            loaded.settings.default_detail_placement,
            DetailPlacement::Sidebar
        );
        assert_eq!(loaded.settings.default_card_order, CardOrder::PriorityDesc);
        assert!(loaded.settings.watch_external_changes);
        assert_eq!(loaded.settings.theme, None);
        assert!(loaded.status.writable(), "the next save creates the file");
    }

    #[test]
    fn saved_values_survive_a_reload() {
        // AC #3's mechanism: what the settings screen writes is what the next start reads.
        let tmp = TempDir::new();
        let path = tmp.path.join("cfg").join("settings.toml");
        let settings = AppSettings {
            schema_version: KNOWN_SCHEMA_VERSION,
            theme: Some("Atlas Dark".into()),
            language: Some("en".into()),
            card_density: CardDensity::L,
            default_storage_filter: vec![StorageSelection::Active, StorageSelection::Draft],
            default_detail_placement: DetailPlacement::Full,
            default_card_order: CardOrder::MilestoneAsc,
            watch_external_changes: false,
            // 未分類列 among them, because it is the one member of `GridColumn` that is not a
            // 正準ステータス列 and the only one whose token this struct cannot borrow from
            // `StatusColumn` (doc-7 §2.2).
            collapsed_columns: vec![GridColumn::InReview, GridColumn::Unmapped],
            folded_rows: vec!["atlas".into(), "kanri".into()],
            hidden_rows: vec!["retired".into()],
            // A path with a space, because that is what an npm global prefix under a Windows user
            // profile or an Application Support directory looks like (doc-5 §4 順序 1).
            backlog_cli: Some(PathBuf::from("/opt/my tools/backlog")),
            git_cli: Some(PathBuf::from("/opt/my tools/git")),
            gh_cli: Some(PathBuf::from("/opt/my tools/gh")),
            external_editor: Some(EditorCommand {
                program: "/Applications/My Editor.app/Contents/MacOS/my editor".into(),
                args: vec!["-w".into()],
            }),
        };
        let written = save(&path, &settings).expect("saved");
        assert_eq!(written.status, SettingsStatus::Stored);

        let reloaded = LoadedSettings::load(&path);
        assert_eq!(reloaded.status, SettingsStatus::Stored);
        assert_eq!(reloaded.settings, settings);

        // The 外部コマンド指定 are scalars and `external_editor` a sub-table: TOML forbids a scalar
        // after the table, so a save that emitted them the other way round would produce a file this
        // very `load` cannot read. Asserted on the text because the round-trip above passes either
        // way only as long as the field order stays right. All three are checked rather than the
        // first: each was added in its own change, and a new one appended after the sub-table is
        // exactly the mistake this guards.
        let text = std::fs::read_to_string(&path).expect("written");
        let table = text.find("[external_editor]").expect("sub-table written");
        for scalar in ["backlog_cli", "git_cli", "gh_cli"] {
            assert!(
                text.find(scalar).expect("scalar written") < table,
                "{scalar} has to precede the sub-table:\n{text}"
            );
        }
    }

    /// Settings that differ from the defaults in every item, so "the previous ones survived" and
    /// "the new ones landed whole" are both visible in the file.
    fn settings_worth_losing() -> AppSettings {
        AppSettings {
            schema_version: KNOWN_SCHEMA_VERSION,
            theme: Some("Atlas Dark".into()),
            language: Some("en".into()),
            card_density: CardDensity::L,
            default_storage_filter: vec![StorageSelection::Active, StorageSelection::Draft],
            default_detail_placement: DetailPlacement::Full,
            default_card_order: CardOrder::MilestoneAsc,
            watch_external_changes: false,
            collapsed_columns: vec![GridColumn::ToDo, GridColumn::Unmapped],
            folded_rows: vec!["atlas".into()],
            hidden_rows: vec!["kanri".into()],
            backlog_cli: Some(PathBuf::from("/opt/my tools/backlog")),
            git_cli: Some(PathBuf::from("/opt/my tools/git")),
            gh_cli: Some(PathBuf::from("/opt/my tools/gh")),
            external_editor: Some(EditorCommand {
                program: "/usr/bin/my editor".into(),
                args: vec!["-w".into()],
            }),
        }
    }

    #[test]
    fn a_failed_save_leaves_the_previous_settings_readable() {
        // decision-17 AC #4 for the settings. Asserting on `load` and not only on the bytes is the
        // point: decision-13 degrades an unreadable file to the defaults, so a half-written save
        // would not look like an error to the next start — it would look like the user's theme,
        // density, watch setting and `backlog_cli` were never saved.
        for step in crate::store::EVERY_STEP {
            let tmp = TempDir::new();
            let path = tmp.path.join("cfg").join("settings.toml");
            let previous = settings_worth_losing();
            save(&path, &previous).expect("the first save succeeds");
            let bytes_before = std::fs::read(&path).unwrap();

            let next = AppSettings {
                theme: Some("Atlas Light".into()),
                ..AppSettings::default()
            };
            let error = save_with(&crate::store::FakeFiles::failing_at(step), &path, &next)
                .expect_err("the injected step fails the save");

            assert!(matches!(error, SettingsError::Io(_)), "{step:?}: {error}");
            assert_eq!(std::fs::read(&path).unwrap(), bytes_before, "{step:?}");
            let after = LoadedSettings::load(&path);
            assert_eq!(after.status, SettingsStatus::Stored, "{step:?}");
            assert_eq!(after.settings, previous, "{step:?}");
        }
    }

    #[test]
    fn saved_settings_reach_the_file_only_by_rename() {
        // decision-17 AC #5 for the settings: the destination's name is never written through, so a
        // reader of it sees the whole previous settings or the whole new ones and never a prefix.
        // The previous file is the longer one, so a writer that truncated in place would be caught
        // by the residue as well as by the call record.
        let tmp = TempDir::new();
        let path = tmp.path.join("cfg").join("settings.toml");
        save(&path, &settings_worth_losing()).expect("the first save succeeds");
        let previous = std::fs::read_to_string(&path).unwrap();

        let files = crate::store::FakeFiles::working();
        let next = AppSettings::default();
        save_with(&files, &path, &next).expect("saved");

        crate::store::assert_reached_only_by_rename(&files, &path);
        let after = std::fs::read_to_string(&path).unwrap();
        assert!(after.len() < previous.len(), "the shorter file replaced it");
        assert!(
            !after.contains("Atlas Dark") && !after.contains("my tools"),
            "nothing of the previous file is left:\n{after}"
        );
        assert_eq!(LoadedSettings::load(&path).settings, next);
    }

    #[test]
    fn a_partial_file_fills_the_missing_items_with_defaults() {
        // doc-3 §2.2 keeps hand editing supported for the ledger and decision-13 gives settings.toml
        // the same format for the same reason: a file naming one item must not lose the others.
        let tmp = TempDir::new();
        let path = tmp.path.join("settings.toml");
        std::fs::write(&path, "schema_version = 1\ncard_density = \"s\"\n").unwrap();

        let loaded = LoadedSettings::load(&path);
        assert_eq!(loaded.status, SettingsStatus::Stored);
        assert_eq!(loaded.settings.card_density, CardDensity::S);
        assert!(loaded.settings.watch_external_changes);
        assert_eq!(
            loaded.settings.default_storage_filter,
            vec![StorageSelection::Active]
        );
    }

    #[test]
    fn the_version_bump_is_what_stops_an_older_build_dropping_a_newer_field() {
        // The boundary a new persisted item has to be defended at (decision-13 項目の追加は
        // スキーマ版の管理対象). Both directions matter, and only the second needs the raise.
        let tmp = TempDir::new();

        // Older file, this build: the missing keys default and the next save adopts this version, so
        // raising the number does not strand anyone's existing settings.toml.
        let older = tmp.path.join("older.toml");
        std::fs::write(&older, "schema_version = 1\ncard_density = \"s\"\n").unwrap();
        let loaded = LoadedSettings::load(&older);
        assert_eq!(loaded.status, SettingsStatus::Stored);
        assert_eq!(loaded.settings.card_density, CardDensity::S);
        assert_eq!(loaded.settings.backlog_cli, None);
        save(&older, &loaded.settings).expect("an older file is ours to rewrite");
        assert_eq!(
            LoadedSettings::load(&older).settings.schema_version,
            KNOWN_SCHEMA_VERSION
        );

        // Newer file, this build standing in for the build that predates `backlog_cli`: it must not be
        // parsed and must not be written. Left at the old number, this file would read as Stored, its
        // unknown key would be dropped by serde, and the next save would delete it.
        let newer = tmp.path.join("newer.toml");
        let written = format!(
            "schema_version = {}\nbacklog_cli = \"/opt/backlog/backlog\"\n",
            KNOWN_SCHEMA_VERSION + 1
        );
        std::fs::write(&newer, &written).unwrap();
        let loaded = LoadedSettings::load(&newer);
        assert_eq!(
            loaded.status,
            SettingsStatus::ReadOnly {
                version: KNOWN_SCHEMA_VERSION + 1
            }
        );
        assert!(save(&newer, &AppSettings::default()).is_err());
        assert_eq!(std::fs::read_to_string(&newer).unwrap(), written);
    }

    // --- 縮退 (AC #1/#6) --------------------------------------------------------------------

    #[test]
    fn an_unknown_higher_version_is_read_only_and_never_overwritten() {
        let tmp = TempDir::new();
        let path = tmp.path.join("settings.toml");
        std::fs::write(&path, "schema_version = 999\ncard_density = \"l\"\n").unwrap();

        let loaded = LoadedSettings::load(&path);
        assert_eq!(loaded.status, SettingsStatus::ReadOnly { version: 999 });
        assert_eq!(
            loaded.settings,
            AppSettings::default(),
            "a version this build cannot judge is run at the defaults, not at its own values"
        );
        assert!(!loaded.status.writable());

        let error = save(&path, &AppSettings::default()).expect_err("save is refused");
        assert!(matches!(error, SettingsError::ReadOnly(999)));
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "schema_version = 999\ncard_density = \"l\"\n",
            "the newer file is left byte-for-byte as it was"
        );
    }

    #[test]
    fn a_corrupt_file_yields_the_defaults_and_the_next_save_rebuilds_it() {
        let tmp = TempDir::new();
        let path = tmp.path.join("settings.toml");
        std::fs::write(&path, "schema_version = 1\ncard_density = \"enormous\"\n").unwrap();

        let loaded = LoadedSettings::load(&path);
        match &loaded.status {
            SettingsStatus::Unreadable { detail } => assert!(!detail.is_empty()),
            other => panic!("expected an unreadable status, got {other:?}"),
        }
        assert_eq!(loaded.settings, AppSettings::default());
        assert!(
            loaded.status.writable(),
            "decision-13: 壊れている場合は次の保存で作り直す"
        );

        save(&path, &loaded.settings).expect("rebuilt");
        assert_eq!(LoadedSettings::load(&path).status, SettingsStatus::Stored);
    }

    #[test]
    fn a_file_without_a_schema_version_is_unreadable_rather_than_assumed() {
        // Guessing the version would let a future format's file be read against this one's rules and
        // then overwritten at this version — the exact loss AC #1 exists to prevent.
        let tmp = TempDir::new();
        let path = tmp.path.join("settings.toml");
        std::fs::write(&path, "card_density = \"l\"\n").unwrap();
        assert!(matches!(
            LoadedSettings::load(&path).status,
            SettingsStatus::Unreadable { .. }
        ));
    }

    // --- which keys the file holds, and which it must not -----------------------------------

    /// The serialized key set is decision-13's item table and nothing else. Asserted in both
    /// directions by one equality: a field added without a place in that table fails here, and so does
    /// one silently dropped — which is what makes the three 再起動をまたぐ保持 keys (the improvement's
    /// AC #2) a contract rather than a comment. doc-9 §3.2's 起動時の全ルート読み取り is checked by name
    /// as well, because it is the one non-setting a future session might reach for and it has no field
    /// to be missing from.
    #[test]
    fn the_documented_keys_and_no_others() {
        let text = toml::to_string_pretty(&AppSettings::default()).expect("serialized");
        let keys: Vec<&str> = text
            .lines()
            .filter_map(|line| line.split('=').next())
            .map(str::trim)
            .filter(|key| !key.is_empty() && !key.starts_with('['))
            .collect();
        assert_eq!(
            keys,
            vec![
                "schema_version",
                "card_density",
                "default_storage_filter",
                "default_detail_placement",
                "default_card_order",
                "watch_external_changes",
                "collapsed_columns",
                "folded_rows",
                "hidden_rows",
            ],
            "settings.toml holds decision-13's items and nothing else"
        );
        for forbidden in ["startup_read", "read_all_roots_on_start"] {
            assert!(
                !text.contains(forbidden),
                "{forbidden} is not a setting (doc-9 §3.2)"
            );
        }
    }

    /// [`GridColumn`]'s four canonical members serialize as [`StatusColumn`]'s do. The two enums are
    /// separate (see `GridColumn`'s note) and neither compiler nor serde would notice them drifting:
    /// a rename on the interpretation side would leave saved 列折畳み naming columns by a spelling the
    /// screen no longer sends, and the columns would silently come back expanded.
    #[test]
    fn the_four_columns_spell_their_status_column_tokens() {
        use crate::interpret::status::StatusColumn;
        let pairs = [
            (GridColumn::ToDo, StatusColumn::ToDo),
            (GridColumn::InProgress, StatusColumn::InProgress),
            (GridColumn::InReview, StatusColumn::InReview),
            (GridColumn::Done, StatusColumn::Done),
        ];
        for (column, status) in pairs {
            assert_eq!(
                serde_json::to_value(column).expect("serialized"),
                serde_json::to_value(status).expect("serialized"),
                "{column:?} and {status:?} have to reach the screen as the same token"
            );
        }
        // The exhaustive match is what makes the list above complete: a fifth canonical column stops
        // this compiling rather than being left unchecked.
        for column in [
            GridColumn::ToDo,
            GridColumn::InProgress,
            GridColumn::InReview,
            GridColumn::Done,
            GridColumn::Unmapped,
        ] {
            match column {
                GridColumn::ToDo
                | GridColumn::InProgress
                | GridColumn::InReview
                | GridColumn::Done => {
                    assert!(pairs.iter().any(|(listed, _)| *listed == column));
                }
                // 未分類列 has no `StatusColumn` to be compared with — that is why this enum exists.
                GridColumn::Unmapped => {}
            }
        }
    }

    /// A file written before the three keys existed loads with them empty rather than degrading. This
    /// is the case a *lower* `schema_version` describes: decision-13 has an older file load with the
    /// missing keys defaulted, and for these three "defaulted" has to mean nothing folded and nothing
    /// hidden — a first start after an upgrade must not decide that some row is off the grid.
    #[test]
    fn a_file_predating_the_three_keys_loads_with_nothing_folded() {
        let tmp = TempDir::new();
        let path = tmp.path.join("settings.toml");
        std::fs::write(
            &path,
            "schema_version = 5\ncard_density = \"l\"\nwatch_external_changes = false\n",
        )
        .expect("written");
        let loaded = LoadedSettings::load(&path);
        assert_eq!(loaded.status, SettingsStatus::Stored);
        assert_eq!(loaded.settings.card_density, CardDensity::L);
        assert!(loaded.settings.collapsed_columns.is_empty());
        assert!(loaded.settings.folded_rows.is_empty());
        assert!(loaded.settings.hidden_rows.is_empty());
    }

    /// The file is one the user is expected to be able to read and edit (decision-13 形式: TOML,
    /// 手編集しやすい), so the keys are the ones the docs name — not a renamed wire form.
    #[test]
    fn the_written_file_reads_as_the_documented_keys() {
        let tmp = TempDir::new();
        let path = tmp.path.join("settings.toml");
        let settings = AppSettings {
            external_editor: Some(EditorCommand {
                program: "code".into(),
                args: vec!["-w".into()],
            }),
            ..AppSettings::default()
        };
        save(&path, &settings).expect("saved");
        let text = std::fs::read_to_string(&path).unwrap();
        // Against the constant, not a literal: what this asserts is that the written file states the
        // version this build's field set means, which stays true across a bump.
        assert!(text.contains(&format!("schema_version = {KNOWN_SCHEMA_VERSION}")));
        assert!(text.contains("card_density = \"m\""));
        assert!(text.contains("watch_external_changes = true"));
        // The three 再起動をまたぐ保持 keys are written even when empty, so the file states which rows
        // and columns are folded — an omitted key would read as "this build does not have them".
        assert!(text.contains("collapsed_columns = []"));
        assert!(text.contains("folded_rows = []"));
        assert!(text.contains("hidden_rows = []"));
        assert!(text.contains("[external_editor]"));
        assert!(text.contains("program = \"code\""));
    }
}
