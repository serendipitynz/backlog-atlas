---
id: TASK-144
title: 「場所を開く」の保留条件を、設定ファイルの有無からフォルダの有無へ直す
status: In Review
assignee: []
created_date: '2026-08-10 10:46'
updated_date: '2026-08-10 11:45'
labels:
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-10 の TASK-136 の実測中に見つけた。TASK-136 が設定モーダルの ファイルの場所 区画へ台帳ファイルのパスを足したことで見えるようになったが、欠陥そのものは TASK-75 以来ある。

**現在の保留条件**: `openLocationBlocked`（`src/lib/settings.ts`）は `SettingsStatus.state === "absent"`、つまり **`settings.toml` が無いこと**を理由に 場所を開く を無効化し、「設定ファイルはまだ作成されていないため、その場所を開けません（保存すると作成します）。」を出す。

**その条件が測っていないもの**: 控えが開くのは**ファイルではなくフォルダ**である（`settings_location_open` は `ConfigFiles::directory` を渡す）。そしてフォルダは、**プロジェクトを 1 件登録した時点で存在する** — `Ledger::save_with` が `store::replace` を通り、`store::replace` は書き込み先の親を `create_dir_all` する（実測: `src-tauri/src/store.rs`・`src-tauri/src/ledger.rs`）。したがって「プロジェクトを登録したが設定を一度も保存していない」という到達しやすい状態で、**フォルダは現にあるのに控えが押せず、理由は利用者が必要としていない別のファイルについて述べている**。

**TASK-136 で見えるようになった理由**: 同じ区画が 台帳ファイル のパスを出すようになったので、そのパスの真下にある控えが「そのフォルダは開けません」と断る形になる。区画の見出しも ファイルの場所 で、2 ファイル両方の保存場所を述べている。

**m-2 に置く判断**: 提供している控えが、到達しやすい状態で操作不能になる（公開阻害の 操作不能）。ユーザーが列挙した範囲の項目ではないので、公開阻害で判断した。

**着手時に確かめること**: フォルダの有無を答える事実がフロントエンドに無い。`settings_location`・`ledger_location` はどちらもパスを**解決**するだけでファイルシステムを読まない（それが「lock を取らない」根拠にもなっている）。したがって境界に 1 つ問いを足すか、既に持っている事実（台帳が読めた＝ファイルがある）で代えるかを決める必要がある。後者は Settings が `entries` を受け取っていないので prop が 1 つ増える。どちらも doc-11 §5 の無効化提示に触るので、理由文の指示対象（フォルダか、設定ファイルか）を先に固定する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 場所を開く が、プロジェクトを 1 件登録して設定を一度も保存していない状態で押せる
- [x] #2 アプリ設定ディレクトリがまだ無い状態では、控えが理由付きで保留される（doc-11 §5）
- [x] #3 理由文の指示対象がフォルダであり、設定ファイルの有無を述べていない
- [x] #4 フォルダの有無をどこが答えるかが doc に書かれている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実測（2026-08-10）

**部品**: `_sandbox/settings-check/` に `?folder=there|missing|unknown` を足し、WebKit・Chromium の両方で 1280×800・`?status=absent` 固定で測った（`?status` で保留が変わらないことを見るため absent に固定した）。

| folder | aria-disabled | 枠 | opacity | cursor | 理由文 | 区画高さ WebKit / Chromium |
|---|---|---|---|---|---|---|
| there | false | 実線 | 1 | pointer | 無し | 129 / 131px |
| missing | true | 破線 | .45 | help | 「そのフォルダはまだありません（設定を保存するか、プロジェクトを登録すると作成します）。」1 行 17px・幅 680px | 150 / 153px |
| unknown | true | 破線 | .45 | help | 「そのフォルダがあるかどうかを確認できていません。」1 行 | 150 / 153px |

保留の 2 条件とも `aria-describedby` が理由文の要素へ結ばれ、押せる条件では属性が付かない。4 条件とも控えの中心で `elementFromPoint` が控え自身を返す（上に載る層は無い）。理由文が出ると区画は 21〜22px 伸びる。

**変更前の対照**: `?status=absent` は変更前なら保留された状態である（保留条件がアプリ設定ファイルの有無だった）。同じ条件でいま押せることが AC #1 に当たる。

**シェル**: `_sandbox/app-check/`（本物の `App.svelte` ＋ 本物の `commands.ts` ＋ 偽 IPC）でメニュー → 設定 を開き、`settings_directory_present` の答えが控えの状態になることを確認した（`aria-disabled=false`・実線枠・理由文なし）。偽 IPC にはこのコマンドの枝を足してある。

**測っていない（目視の範囲）**: 実アプリで `settings.toml` だけを退避した状態（台帳だけがある状態）に控えが押せること、フォルダごと無い状態の理由文、控えが実際にファイルマネージャを開くこと。
<!-- SECTION:NOTES:END -->
