---
id: TASK-163
title: Linux パッケージの Description のエスケープ崩れと空の Categories を直す
status: Done
assignee: []
created_date: '2026-08-13 07:03'
updated_date: '2026-08-14 00:12'
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
- [x] #1 Cargo.toml の description に由来する Description が、.desktop の Comment と .deb の control の両方でリテラルのエスケープを含まない（dpkg -I と dpkg -l で確認）
- [x] #2 .desktop の Categories が空でない。値は bundle.category から来ている
- [x] #3 bundle.category を設定した影響が macOS 実機で確認されている（バンドルの分類が意図どおり）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-14 の実測。macOS 側はこの作業機、Linux 側はユーザーの Ubuntu 実機 (arm64)。

**`.deb` の control** — `dpkg -I` が `Description: Backlog Atlas - a multi-root Backlog.md client` を返す。

**`dpkg -l`（AC #1 が名指す 2 つ目のコマンド）** — 同版どうしなので、入れ替わったことを版番号では言えない。`dpkg -i` の出力自身が `Unpacking backlog-atlas (0.1.0) over (0.1.0)` と述べており、そのうえで `dpkg -l backlog-atlas` の説明欄が `Backlog Atlas - a multi-root Backlog.md client` になっている。**元の症状はこの行に `\u2014` の 6 文字が出ていたもので、同じ観測点で消えたことを確かめた。**

**`.desktop`** — `dpkg-deb -x` で展開した `usr/share/applications/Backlog Atlas.desktop`:

    [Desktop Entry]
    Categories=Development;
    Comment=Backlog Atlas - a multi-root Backlog.md client
    Exec=backlog-atlas
    StartupWMClass=backlog-atlas
    Icon=backlog-atlas
    Name=Backlog Atlas
    Terminal=false
    Type=Application

**macOS 側** — ビルドした `.app` の `Info.plist` が `LSApplicationCategoryType => public.app-category.developer-tools`。**これで `DeveloperTool` の展開先は両プラットフォームとも実測になった**（AGENTS 和英「バンドルの metadata」節がその値を持つ）。
<!-- SECTION:NOTES:END -->
