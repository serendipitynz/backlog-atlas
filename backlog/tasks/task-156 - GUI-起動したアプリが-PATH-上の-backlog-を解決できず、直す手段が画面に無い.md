---
id: TASK-156
title: GUI 起動したアプリが PATH 上の backlog を解決できず、直す手段が画面に無い
status: To Do
assignee: []
created_date: '2026-08-12 21:46'
updated_date: '2026-08-12 21:50'
labels:
  - release
  - 'kind:bug'
milestone: m-2
dependencies: []
priority: high
ordinal: 149700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-13 に TASK-98 の実機確認（`pnpm tauri build --debug`）で判明した。**同じビルドが、起動のしかたで挙動を変える。**

| 起動 | Backlog CLI | 更新経路 |
|---|---|---|
| `bundle/macos/Backlog Atlas.app` | 解決できない | 発行不能（縮退帯が出る） |
| `open src-tauri/target/debug/backlog-atlas`（素の実行ファイル） | 解決した | 発行できる。作図・編集とも動作 |

縮退時の文言は「backlog CLI の実行ファイルを解決できません。作成・更新は発行できません（台帳エントリの更新は影響を受けません）。」で、同時刻に同じマシンのターミナルでは `backlog --version` が 1.49.3 を返している。CSP（TASK-98）とは無関係で、CLI 起動は webview の外（`update.rs` の `Command::new`）である。

実測した機構（このマシン、macOS）:

- `backlog` の実体は `/Users/ootani/.local/state/fnm_multishells/26979_.../bin/backlog`。fnm の multishell ディレクトリで、名前に PID と時刻が入るためシェルセッションごとに変わる。
- GUI アプリが継承する PATH（`launchctl getenv PATH`）にそのディレクトリは無い。このマシンの launchd PATH は customize されており `/usr/local/bin` と `/opt/homebrew/bin` を含むが、それでも届いていない。
- したがって .app では decision-16 の実行ファイル解決の順序 3（bare name を OS に解決させる）が空振りする。素の実行ファイル側が解決したことが、原因を PATH の継承に絞り込んでいる。

まだ確かめていないこと:

- **`open <実行ファイル>` が何を継承したのか。** 拡張子の無い実行ファイルを `open` に渡すと LaunchServices が別のアプリ（Terminal.app が有力）へ回すと思われるが、本タスクでは確かめていない。「素の実行ファイルなら解決する」ではなく「その経路が結果としてログインシェルの PATH を継承した」かもしれない。
- 素の macOS の launchd PATH がどこまで狭いか（既定は `/usr/bin:/bin:/usr/sbin:/sbin` とされるが未実測）。したがって、この欠陥が fnm・nvm 等のシェル版管理利用者に限るのか、Homebrew やインストーラ導入の node でも起きるのかが決まっていない。
- Windows と Linux で GUI 起動したときに同じことが起きるか。

公開に効く理由:

- README は「`PATH` に v1.49.3 以上の `backlog` を用意する」「`npm install -g backlog.md`」と書いている。**その通りにした利用者が、.app を Finder / Dock から起動すると更新機能を使えない。**
- decision-16 の解決順序 1 はアプリ設定 `backlog_cli` を見るが、**設定画面にその項目が無い**（`Settings.svelte` に `backlog` の語が 1 つも無い）。利用者はアプリの中で直せない。
- decision-26 は第三者配布でも sidecar 同梱を採らず「利用者の PATH 上の `backlog` を用いる前提を保つ」と決めた。その前提が GUI 起動で成り立つかは、あちらでは検討されていない。

対策は決めていない。解決順序を変える／設定項目を画面へ出す／README を直す／いずれかの組み合わせのどれになるかは、上の未実測ぶんを測ってから決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 macOS で Finder / Dock から起動したアプリが、README の手順で導入された backlog を解決できる。解決できない場合は、利用者が画面から到達できる手段を持つ
- [ ] #2 Windows・Linux で GUI 起動したときに CLI を解決できるかどうかが、実機の実測として記録されている
- [ ] #3 README の導入要件が、GUI 起動でも成り立つ記述になっている
- [ ] #4 decision-16（実行ファイル解決の順序）と decision-26（PATH 上 backlog の前提）のどちらを改訂したか、または改訂不要と判断した理由が記録されている
<!-- AC:END -->
