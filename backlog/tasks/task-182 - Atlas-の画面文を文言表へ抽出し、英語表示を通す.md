---
id: TASK-182
title: crate が組み立てる失敗の理由を 失敗理由符号 にする
status: In Progress
assignee: []
created_date: '2026-08-15 20:58'
updated_date: '2026-08-15 22:51'
labels:
  - i18n
  - 'kind:feature'
milestone: m-3
dependencies:
  - TASK-103
priority: medium
ordinal: 173700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-35 §3 が定めた 失敗理由符号 を crate へ入れる。crate は失敗の理由を日本語の文として組み立てるのをやめ、serde の variant token と引数の組で渡す。画面へ出る文はフロントエンドが 文言表 から組む。

**この行が抽出そのものと別に在るのは、2026-08-16 にユーザーが 3 分割を選んだためである。** 起票時の TASK-182 は AC 4 件で画面文 883 行と wire の変更を同時に持っていた。着手セッションが数え直したところ、フロントエンドの画面文は 39 ファイル・883 行（起票時の 46 ファイル・941 行は TASK-103 が入る前の値）で、1 セッションに収まらない。**wire を動かす作業をこの行が持ち、抽出は TASK-183、走査と英語レイアウトは TASK-184 が持つ。**

**crate の側の画面文は 4 ファイル・約 28 本である**（`editor.rs` 17・`history.rs` 7・`external.rs` 3・`update.rs` 1）。これらは `CommandError` などの `detail` に載って画面がそのまま描いている。**符号の形は `ledgerRefused` が既に持っている** — `reason: LedgerRefusal` と `detail` を分けて持ち、`wire.ts` の註が「画面の文は `reason` から来る」と述べている。本行がするのは、`detail` が画面へ届いている残りの variant を同じ形へ揃えることである。

**動く先は `wire.ts`・`wire_fixtures.rs`・`wire-fixtures/*.json`・`wire_tokens.json` である。** 符号は serde が綴るので `wire_tokens.json` の完全性は既存の網羅 `match` が保つ。variant を足すとその match がコンパイルを止め、それが sample を足す合図である。録り直しは `ATLAS_RECORD_WIRE_FIXTURES=1 cargo test` してコミットする。

**この行が足す文言は 文言表 の 2 言語ぶんである。** 抽出（TASK-183）を待たない — 符号を入れた時点で画面がその文を組めなければ、失敗の理由が画面から消えるためである。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 crate が組み立てていた失敗の理由が 失敗理由符号 になり、画面へ出る文はフロントエンドが 文言表 から組む
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 移した範囲と、移していない範囲

**decision-35 §3 が数えた 4 ファイル・約 28 本をすべて移した。** 移した後で同じ剥がし手順の走査を掛け、
`editor.rs`・`history.rs`・`external.rs`・`update.rs` に残る日本語は 14 行、**全部が各ファイルの
`#[cfg(test)]` より下**（試験関数名と assert の文言）であることを行番号で確かめた。`editor.rs` は 0 行。

**`detail` が画面へ届く残りの variant は、この行では触っていない。** `ledger`・`rootUnreadable`・
`settings`・`updateRejected` などが持つ `detail` は Rust 側の `Display` が組む**英語**の文で、
decision-35 の Context が数えた 28 本には入っていない（あれは日本語の行数である）。**英語表示を妨げない**
ので残した — decision-35 §3 の「`detail` は診断用の文として残す」がそのまま当たる。**列挙ではなく走査で
確かめた結論なので、次に触る回はこの段落を根拠に省略してよい。**

## 入れた型（referent table は `_sandbox/handoff/referent-table/referent-table-task-182.md`）

`LaunchRefusal`（5）・`BodyLinkRefusal`（3）・`ProbeFailure`（3）・`RemoteReadFailure`（3）を足し、
既存の `LookupFailure` の 2 token に引数を持たせた。`CommandError::EditorUnavailable` は `detail` を落として
token 自体を符号にした。`UpdateFailure::command` は `Option<String>` になり、直接書き込み操作 では `None`
（何が失敗したかは既存の `FailureKind::Write` が言う）。

**`wire_tokens.json` に 4 union が増え、`LookupFailure` は `unit_tokens` から `tag_tokens` へ移った。**
標本は 2 つ増やした（`git_remote_read_unreadable.json`・`external_program_report_failed.json`）— token 一覧は
tag を留めるが payload の値型は留めないためで、`after_ms` に付いていた既存の註と同じ理由である。

## 決めた規則（`src/lib/failure.ts` の頭註が正本）

**crate は文を選ばない。** 画面文は `reason` から組む。ただし `reason` が「OS または外部プログラム自身が
理由を述べた」ことを表す符号（`osRefused`・`exited`・`gitFailed`・`queryFailed`）では、その述べた文
（`detail`）をそのまま出す — Atlas が書いた文ではないので訳さない（decision-35 §5）。`detail` が空のときだけ
文言表 の文を出す。**この分岐は消せない**（外部プログラムは stderr へ何も書かずに失敗しうる）ので、
置き場を crate から画面側へ移したのがこの行の変更である。**空文字を falsy で判定しない** — 終了状態には
`"0"` がありえて、`||` はそれも飲む。

## 波及して足した frontend の型

`RemoteLine`（`git-remote-read.ts`）。`git_remote_read` が **CommandError で reject する**経路があり
（`ConfigFiles::resolve`・`load_ledger`・`UnknownProject`）、シェルはそれを 読取不能 として出している。
`GitRemoteRead` の 4 状態はどれも「プロジェクトルートについての主張」なので、Git が答えていないものに
Git の 失敗理由符号 を与えるのは嘘になる。**画面に出る文は今までと同一**（`remote を読めません: …`）。

## 検証

`pnpm test`（945 件）・`pnpm run check`（0 error）・`pnpm run lint`、`cargo test`（414 件）・`cargo fmt --check`・
`cargo clippy --all-targets -- -D warnings` がすべて通る。**clippy は 1.96.0 と 1.97.1 の両方で通した** —
CI の `dtolnay/rust-toolchain@stable` は当日の stable を引くので、手元の 1.96.0 だけでは足りない
（AGENTS の CI 節。TASK-178 がこれで落ちた）。`src/lib/failure.test.ts` は 5 通りの変異でそれぞれ落ちることを
確かめてある（spokenOr↔withDetail の入れ替え、osRefused に文を前置、HRESULT の符号、SE_ERR 表の潰し、
timedOut の引数無視）。
<!-- SECTION:NOTES:END -->
