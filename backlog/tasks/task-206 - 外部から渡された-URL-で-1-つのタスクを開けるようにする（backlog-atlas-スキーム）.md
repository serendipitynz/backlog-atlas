---
id: TASK-206
title: '外部から渡された URL で 1 つのタスクを開けるようにする（backlog-atlas:// スキーム）'
status: Done
assignee: []
created_date: '2026-09-18 23:01'
updated_date: '2026-10-20 03:02'
labels:
  - 'kind:feature'
milestone: m-5
dependencies: []
references:
  - work-report/_sandbox/handoff/dashboard-youtrack-and-atlas.md
ordinal: 197700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
work-report のダッシュボード（tools/dashboard/build.py が生成する 1 枚の HTML）は、朝の一枚の候補行としてこの台帳のタスクを並べる。いまはその行から Atlas を開く手段が無く、利用者はタスク ID を見て Atlas を起動し、台帳とタスクを自分で探す。OS に URL スキーム（第一候補 backlog-atlas://）を登録し、外部が生成した URL 1 つでそのタスクの詳細を前面に出せるようにする。

URL の形（台帳をパスで指すか登録名で指すか、タスクを ID で指すか）はこのタスクで決め、doc に書く。生成側（ダッシュボード）はその doc を契約として読む。

既知の争点: Atlas は 1 プロセス前提で書かれている。macOS は起動中のアプリへ URL を配るが、Windows / Linux の関連付けは 2 つ目のプロセスを立てる。tauri-plugin-deep-link（v2）と tauri-plugin-single-instance を組み合わせるのが定石で、登録は macOS が Info.plist（tauri.conf.json の plugins.deep-link）、Windows / Linux がインストーラ側。開発ビルドでの登録手順も doc に要る。

由来: 2026-09-19 autoanalysis retro-70d の後続。指示書は work-report/_sandbox/handoff/dashboard-youtrack-and-atlas.md。次リリース基準では m-4 ではない（無くても v0.3.0 の利用者は何も失わない）ので m-5。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Atlas を起動していない状態でその URL を開くと、Atlas が起動し、指定した台帳の指定したタスクの詳細が前面に出る
- [x] #2 Atlas が起動中にその URL を開くと、2 つ目のプロセスを立てずに既存のウィンドウがそのタスクへ移る
- [x] #3 登録されていない台帳・存在しないタスクを指す URL は、何も起きないのではなく理由が画面に出る
- [x] #4 URL の形と、3 OS それぞれでの登録手順（開発ビルドを含む）が doc に書かれている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. decision-49 を起こす: tauri-plugin-deep-link と tauri-plugin-single-instance（deep-link feature）の採用、タスクリンクの形（root= の絶対パスと id=）、起動の引継ぎを Windows / Linux に限ること、スキームの関連付けをインストーラ（と AppImage の起動時）に任せ開発ビルドは手作業にすること
2. doc-3 に §8 を足す: タスクリンクの形・符号化・解決規則・開けない理由 4 種・3 OS のスキームの関連付け手順（開発ビルドを含む）
3. Rust: task_link モジュール（URL の解析は純関数）、Ledger に root からの slug 解決、受け取り待ちのリンク 1 本と task_link_take コマンド・受け取り通知イベント、lib.rs に 2 プラグインと窓の前面化
4. 前端: commands.ts に take と購読、task-link.ts に解決結果からタスクを引く純関数、App.svelte で起動順序の末尾に取り出しを足し、モーダルが閉じている間に詳細を開く
5. wire fixture・wire_tokens・invoke 走査・文言表（ja/en）・起動順序のコンポーネントテストを追随、第三者ライセンス通知を再生成
6. macOS は .app を作って open で AC #1・#2 を確かめ、Windows / WSL の確認手順をユーザーへ渡す
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 着手時に決めたこと（2026-10-19、ユーザー回答）

- 本番依存 2 つ（tauri-plugin-deep-link 2.4.10、tauri-plugin-single-instance 2.4.5 の deep-link feature）を加える。single-instance は Windows・Linux の target 依存に限った（macOS は LaunchServices が起動中のアプリへ渡すので不要。入れると /tmp の Unix ソケットで開発ビルドが配布版の起動中に終了する）。
- URL はプロジェクトを絶対パスで指す（`backlog-atlas://task?root=<絶対パス>&id=<タスク ID>`）。slug で指す形は、生成側が Atlas の slug を知る手段が無いので採らなかった。
- 記録先は decision-49（選定・却下理由・費用）と doc-3 §8（形・符号化・解決順・開けない理由 4 種・3 OS の関連付け手順）。AGENTS.md / AGENTS.ja.md に「Windows・Linux で配布版の起動中は開発ビルドが即終了する」を 1 項ずつ足した。

## 実装の要点

- Rust: `task_link.rs`（URL の解析は純関数。未知・重複の引数は黙って捨てず拒否）、`Ledger::slug_for_root`（登録時の二重登録判定と同じ実体パス比較）、`task_link_take` コマンドと `task-link-received` イベント。受け取りは get_current（Windows・Linux の冷えた起動はプラグイン初期化中に引数から読まれ、listener より先）と on_open_url（macOS の Apple Event）の両方を読む。AppImage のときだけ起動時に register_all。
- 画面: 起動の読取の後に 1 度取り出し、以後はイベントごとに取り出す。モーダルが出ている間は開かずに待つ。カードを押したのと同じ open() を通すので破棄前確認も掛かる。id の照合は大文字小文字を区別せず、同じ id 2 件は読み取り順で先（カード押下と同じ）。
- `tauri.conf.json` に plugins が入ると generate_context! が crate 直下の serde_json を名指すので、serde_json を開発依存から本番依存へ移した（tree には既に在る）。

## 測ったこと

- crate 数（cargo metadata --filter-platform）: aarch64-apple-darwin 262→266、x86_64-pc-windows-msvc 268→272、x86_64-unknown-linux-gnu 301→351（大半は zbus）、5 トリプルの和集合 354→403。新しいライセンス識別子は CC0-1.0（tiny-keccak、自前の LICENSE 同梱で scripts/spdx は増えない）。THIRD-PARTY-LICENSES.txt を再生成（353→402 crates）。
- macOS（release の .app を `--no-sign` で作成）: Info.plist に CFBundleURLTypes / backlog-atlas が入る。`open -a <app> <URL>` で冷えた起動、続けて `open <URL>`（TASK-205）と未登録ルートの URL を送っても `pgrep` は同じ PID 1 つのまま。**画面に詳細が出たか・理由が出たかは目視していない**（画面を見る手段が無い）。
- 検査: pnpm test 1385 件、pnpm run check、pnpm run lint、cargo test 483 件、cargo fmt --check、cargo clippy --all-targets -D warnings がすべて通過。新しいコンポーネントテスト 6 件・単体テスト 5 件は、修正を外して落ちることを変異で確かめた（モーダル待ち・プロジェクト詳細からの移動・起動時の取り出し・大文字小文字）。

## 残り（AC #1〜#3 が未チェックの理由）

- AC #1・#2・#3 は実機の目視待ち。macOS の目視と、Windows 実機・WSL Ubuntu 24 での確認をユーザーに依頼する（手順は doc-3 §8.5）。Linux の D-Bus 経路は CI の e2e（ubuntu-24.04、xvfb）で少なくとも起動が壊れないことが見える。

## 実機確認（2026-10-20、ユーザー）

- Windows（NSIS で導入）: AC #1・#2・#3 すべて OK。存在しない id では通知帯に「backlog-atlas has no TASK-9999」が出た。
- WSL Ubuntu 24.04（.deb）: 初回は 3 つとも NG — Atlas は開くがタスクは開かず、理由も出ない。tauri-bundler 2.10.3 の既定 .desktop テンプレートが `Exec=backlog-atlas` に `%u` を付けないため、URL が渡っていなかった。自前テンプレート（src-tauri/linux/main.desktop）を .deb・.rpm に指定して修正し（decision-49 §4・doc-3 §8.5 に記録）、作り直した .deb を `apt install --reinstall` で入れ直して AC #1・#2・#3 すべて OK。D-Bus のセッションバスあり（`unix:path=/run/user/1000/bus`）。同じ版番号の .deb は `--reinstall` を付けないと置き換わらない。
- macOS: プロセス数の確認（冷えた起動のあと 2 本送っても 1 プロセス）だけで、画面の目視は未了。
- 確認の途中で、Windows ではタスクを選ぶたびにコンソール窓がちらつくことが分かった。git・gh の起動に CREATE_NO_WINDOW が無いためで、本タスクとは無関係（別タスクとして提案済み）。

- macOS（ブランチの release .app）: 2026-10-20 にユーザーが目視し、AC #1・#2・#3 すべて OK。3 OS がそろったので AC #1〜#3 をチェックした。
<!-- SECTION:NOTES:END -->
