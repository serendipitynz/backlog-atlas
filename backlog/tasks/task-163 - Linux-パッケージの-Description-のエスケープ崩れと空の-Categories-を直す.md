---
id: TASK-163
title: Linux パッケージの Description のエスケープ崩れと空の Categories を直す
status: In Review
assignee: []
created_date: '2026-08-13 07:03'
updated_date: '2026-08-13 23:27'
labels:
  - release
  - 'kind:chore'
milestone: m-2
dependencies: []
priority: medium
ordinal: 156700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
2026-08-13 に TASK-160 のアイコンを Ubuntu 実機で確かめた際に見つかった、Linux パッケージの体裁の欠陥 2 件。どちらも実測（`dpkg -c` / `dpkg -l` / インストール済み `.desktop` の内容）。

**① Description のエスケープが崩れている。** `src-tauri/Cargo.toml` の `description` に本物の em dash (U+2014) が入っており、バンドラがそれを `\u2014` という 6 文字のリテラルにして出力している。**Desktop Entry 仕様のエスケープは `\s` `\n` `\t` `\r` `\\` だけで `\uXXXX` を含まない**ため、置換されずそのまま表示される。

出ている先が 2 つある。`/usr/share/applications/Backlog Atlas.desktop` の `Comment` と、**`.deb` の control ファイルの `Description`**。後者は `dpkg -l`・`apt show`・GUI のパッケージマネージャに出る。実測した `dpkg -l` の行:

    ii  backlog-atlas  0.1.0  arm64  Backlog Atlas \u2014 a multi-root Backlog.md client

`bundle.shortDescription` は未設定なので、バンドラは Cargo.toml の `description` を使っている。**最も確実な対処は em dash を使わないこと** — バンドラ側のエスケープを当てにしない。`shortDescription` を設定する案は、同じエスケープを通るかを実測してから採る。

**② `Categories=` が空である。** `bundle.category` が未設定のため。空のままだとアプリメニューで「その他」に落ちるか、絞り込みに出ないことがある。`bundle.category` に macOS の LSApplicationCategoryType 値（`DeveloperTool` など）を置くと、Linux では `Categories=Development` になり macOS の分類も同時に埋まる。

**② は macOS のバンドル metadata も変えるので実機確認が要る。** ① は要らない（`.deb` を作り直して `dpkg -c` と `dpkg -I` で消えたことを確認できる）。**したがって ① だけ先に片付けてもよい。**

TASK-101 のリリースワークフローが 3 OS のバンドルを組むので、② の実機確認はそこと併せると 1 回で済む。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cargo.toml の description に由来する Description が、.desktop の Comment と .deb の control の両方でリテラルのエスケープを含まない（dpkg -I と dpkg -l で確認）
- [ ] #2 .desktop の Categories が空でない。値は bundle.category から来ている
- [x] #3 bundle.category を設定した影響が macOS 実機で確認されている（バンドルの分類が意図どおり）
<!-- AC:END -->
