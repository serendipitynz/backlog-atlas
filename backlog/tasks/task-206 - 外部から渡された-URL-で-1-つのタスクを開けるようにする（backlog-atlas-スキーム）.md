---
id: TASK-206
title: '外部から渡された URL で 1 つのタスクを開けるようにする（backlog-atlas:// スキーム）'
status: To Do
assignee: []
created_date: '2026-09-18 23:01'
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
- [ ] #1 Atlas を起動していない状態でその URL を開くと、Atlas が起動し、指定した台帳の指定したタスクの詳細が前面に出る
- [ ] #2 Atlas が起動中にその URL を開くと、2 つ目のプロセスを立てずに既存のウィンドウがそのタスクへ移る
- [ ] #3 登録されていない台帳・存在しないタスクを指す URL は、何も起きないのではなく理由が画面に出る
- [ ] #4 URL の形と、3 OS それぞれでの登録手順（開発ビルドを含む）が doc に書かれている
<!-- AC:END -->
