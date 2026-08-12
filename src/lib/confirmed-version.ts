/**
 * Atlas's 動作確認済み版, for tests and fakes. Not imported by the app — decision-27 keeps this value
 * out of the shipped screens, and the one sentence that does name a version reads it off the
 * `unsupported` payload instead.
 *
 * The value comes from the recorded `cli_readiness.json`, whose `version` the Rust side builds from
 * `update.rs`'s `MIN_VERSION` (AGENTS「Tests」): the recorded ready payload stands for a CLI sitting
 * exactly at the floor. So `MIN_VERSION` stays the single source — raising it fails
 * `wire_fixtures.rs` until the recording is re-made, and the re-made recording arrives here. A
 * literal spelled in this file instead would be a second source that agrees with the first by luck.
 *
 * `wire-fixture.test.ts` pins the reading to the *other* recording of the same constant
 * (`command_errors.json`'s `minimum`), so a sample rebuilt with some other version cannot pass this
 * off as the floor.
 */

import recorded from "../../src-tauri/wire-fixtures/cli_readiness.json";

export const CONFIRMED_CLI_VERSION: string = recorded.version;
