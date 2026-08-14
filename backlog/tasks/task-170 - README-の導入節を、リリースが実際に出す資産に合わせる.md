---
id: TASK-170
title: README の導入節を、リリースが実際に出す資産に合わせる
status: In Review
assignee: []
created_date: '2026-08-14 02:22'
updated_date: '2026-08-14 04:00'
labels:
  - docs
  - 'kind:improvement'
milestone: m-3
dependencies: []
priority: medium
ordinal: 161700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-102 (2026-08-14 の v0.1.0 公開) 由来。**公開した下書きに 7 つのバンドルが載った** — `.dmg`・`.msi`・`x64-setup.exe`・`.deb`・`.rpm`・`.AppImage`・`.app.tar.gz`。`tauri.conf.json` の `bundle.targets` が `all` なので、これは意図どおりである。

**README 和英の「導入」は Releases ページを指すだけで、どれを取ればよいかを述べていない。** 読者は OS ごとに 2〜3 択に出会う (macOS は `.dmg` と `.app.tar.gz`、Windows は `.msi` と `x64-setup.exe`、Linux は `.deb`・`.rpm`・`.AppImage`)。**これは読者が行動の根拠にする記述であり、AGENTS「リリース」節がタグ前に読み合わせよと言っている 4 種の 1 つ (できることの一覧ではなく「何を入れるか」) に当たる。**

**`.app.tar.gz` は利用者向けではない可能性がある** — tauri-action が更新機構のために出す形式で、decision-30 で自己更新を持たないと決めた以上、利用者がこれを取る理由は無いかもしれない。**`bundle.targets` を絞るのが正しい対処という可能性もある**ので、README に書くか出さないようにするかを先に決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 リリースが出す各資産について、利用者に勧めるものと出さなくてよいものを判別し、判断の根拠を記録した
- [x] #2 README 和英の導入節が、その OS の利用者にどれを取ればよいかを述べている（または bundle.targets を絞って選択肢そのものを減らした）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 資産の判別 (AC #1。2026-08-14、v0.1.0 の実行ログとリリースページで実測)

- **.dmg** — macOS の利用者に勧める。universal ビルド (Apple silicon / Intel)。
- **.app.tar.gz** — 利用者向けではない。**Tauri のバンドラ出力ではなく、tauri-action が見つけた .app を tar.gz に固めて上げる動作の産物** (実行ログに Packaging ... .app directory into ... .app.tar.gz)。.sig は無く updater 資産でもない (decision-30)。**bundle.targets では消せない** — .dmg を作れば .app は必ず生まれ、tauri-action に除外入力が無い。対処はオーナー確認のうえ (2026-08-14) ワークフローへの削除工程の追加で、v0.1.0 の資産もオーナー承認のもと削除済み (削除前にバックアップ取得)。起票時の「bundle.targets を絞るのが正しい対処という可能性」は実測で否定された。
- **.msi** — Windows の利用者に勧める。オーナーが実機で導入を確認した資産。
- **x64-setup.exe** — 同じアプリの NSIS インストーラ。どちらでも入るので残し、README は .msi を先に挙げる。
- **.deb / .rpm / .AppImage** — それぞれ Debian・Ubuntu / Fedora・openSUSE / その他 (インストール不要)。3 形式とも残す。**いずれも x86_64 のみで、arm64 の欠落は TASK-172 が引き取った** (オーナーの Linux 検証環境が arm64 VM のため)。

release.yml 頭書きの「tauri-action produces no .sig / .app.tar.gz asset」は実測で偽と確定したので、削除工程の追加と同じ PR で書き直した。AGENTS 和英「リリースを作る」の判断一覧にも 5 つ目として追記した。
<!-- SECTION:NOTES:END -->
