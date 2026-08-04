---
id: TASK-75
title: 設定ファイルのパスを OS のファイルマネージャで開くボタンを置く
status: Done
assignee: []
created_date: '2026-07-31 23:31'
updated_date: '2026-08-04 23:16'
labels:
  - ui
  - settings
  - 'kind:feature'
milestone: m-2
dependencies: []
priority: low
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
設定画面に設定ファイルのパスを出しているので、そのまま Finder（macOS）・エクスプローラ（Windows）・ファイルマネージャ（Linux）で開くボタンを添える。起動は TASK-44 で実装した OS 関連付け起動の経路を再利用し、シェル文字列を組み立てない。台帳ファイルのパスにも同じボタンを置くか判断する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 設定ファイルのパスの横に、OS のファイルマネージャで場所を開くボタンがある
- [x] #2 起動が引数配列で行われ、シェル文字列を組み立てていない
- [x] #3 ファイルが存在しない場合の表示が決まっている
- [x] #4 台帳ファイルにも置くかどうかの判断が記録されている
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 開く対象はディレクトリで、ファイルは選択されない (AC #1・#2)

設定画面の「設定ファイル」区画に **場所を開く** を置いた。押すと **アプリ設定ディレクトリ**
（decision-13 が `settings.toml` と `projects.toml` の置き場として定めたディレクトリ）を、
**OS の関連付け起動**（doc-8 §7）へ 1 つのパスとして渡す。

ファイルを選択した状態で開く形（macOS `open -R`、Windows `explorer /select,`）は採っていない。
3 OS で同じ挙動にできるのは「ディレクトリを関連付け起動へ渡す」だけで、Windows の `explorer /select,`
はコマンド行の再解釈を伴う — decision-15 が `cmd /c start` を退けた理由そのものである。
ディレクトリを渡す形なら macOS は `open`、freedesktop は `xdg-open --`、Windows は `ShellExecuteW` の
`lpFile` で、いずれも既存の関連付け起動の表がそのまま使える。**ファイルは選択されない**ことを控えの
`title` に書いてある。

`settings.toml` そのものを関連付け起動へ渡す形も採らない。`.toml` の関連付け先はテキストエディタで、
「場所を開く」が求めているものではない。

境界は `settings_location_open`（フロントエンドは `settingsLocationOpen`）を新設した。パスの提示が
`settings_location` なので、その場所を開く操作としてその名を接頭辞に取っている。**パスは Atlas 自身が
境界側で解決し、フロントエンドからは何も渡さない。** Rust 側は `editor::open_association` を追加し、
`LaunchMethod::Association` 固定で `Platform::current()` の表を引く。起動指定の解決順は走らせない —
ディレクトリに解決すべきエディタは無いので、環境を渡さないことを型で述べるために、何も返さない
`NoEnvironment` を渡している。

新しい本番依存は無い（既存の `windows-sys` 分岐をそのまま通る）。

## ファイルが無いときの表示 (AC #3)

`SettingsStatus` が `absent`（`settings.toml` がまだ書かれていない）のときだけ、場所を開く を
無効化し、「設定ファイルはまだ作成されていないため、その場所を開けません（保存すると作成します）。」を
理由として `aria-describedby` で結ぶ（doc-11 §5）。既に画面上部の警告文が「保存すると作成します」を
述べているので、状態と手当ての言い方はそちらに揃えてある。

**読めない（`unreadable`）・上位版（`readOnly`）では無効化しない。** どちらもファイルは**ある**状態で、
手で直すならその場所を開く必要がある。読めないことを理由に閉ざすと、直す手段のほうを閉ざすことになる。
これは `openLocationBlocked` の単体試験が 4 状態すべてで固定している。

**起動を発行してから応答が返るまでの間も、押せない理由を持つ**（レビュー round 1 の [P2]）。
最初の形は発行中を `aria-disabled` にしながら `aria-describedby` を空のままにしていて、これは
doc-11 §5 が禁じる理由の無い無効化そのものだった（ポインタを使わない利用者には、処理中なのか故障なのかが
区別できない）。発行中を状態ではなく `openLocationBlocked` が返す**理由**にして、ファイルの状態に
かかわらず「いま開いています（OS の応答を待っています）。」を返すようにした。単体試験がこれを固定している。

起動そのものが失敗したときは、控えの隣に何が拒否したかを出す（`openLocationFailure`）。
`launchFailureDetail`（外部エディタ経路）と分けたのは、あちらの助言が `.md` の関連付けと
`$VISUAL`・`$EDITOR` を名指すためで、ディレクトリが開けなかった利用者にはどちらも関係が無い。
失敗を上部帯 ⑤ 通知に出さないのは、このモーダルが上部帯を覆う（`Modal.svelte`）ためで、閉じるまで
読まれない場所へ結果を置くことになる。

## 台帳ファイルにも置くかの判断 (AC #4)

**置かない。** decision-13 が台帳ファイルをアプリ設定ファイルと**同じアプリ設定ディレクトリ**に
定めているので、場所を開く が開く場所は台帳ファイルの場所でもある。2 つ目の控えを置いても、押し分ける
先が無い同じフォルダを 2 度開くことになる。この事実を実装の側でも 1 か所にするため、
`ConfigFiles` にディレクトリそのものを持たせ、2 つのパスと並べてある。

設定画面には「台帳ファイル（projects.toml）も同じフォルダにあります（decision-13）。」の 1 行を添えた。
台帳のパスを探しに来た利用者が、ここで場所へ到達できることを読めるようにするためである。
台帳のパスを表示しているのはプロジェクト登録モーダルだが、そちらへ控えは足していない。

## 実測

`_sandbox/settings-check/` に `?status=absent` を渡した状態で、WebKit・Chromium とも
`aria-disabled="true"` と `aria-describedby="settings-location-blocked"` が付くことを実測した。
`stored`・`unreadable`・`readOnly` では `false` で結び先も無い。

**目視で確認済み（2026-08-05、macOS 実機）**: 「場所を開く」で Finder が設定ファイルのフォルダを
実際に開く。**残る未測定は Windows と Linux の実機** — freedesktop の `xdg-open`、Windows の
`ShellExecuteW` は、この環境からも macOS 実機からも起動そのものを確かめられない（テストが固定して
いるのは何を渡したかまでである）。**実機の実 印は付けていない**ので、Windows・Linux の確認は
TASK-96 など 実 印を持つタスクの実機確認と併せて行えばよい。
<!-- SECTION:NOTES:END -->
