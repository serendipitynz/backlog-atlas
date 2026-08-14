---
id: TASK-170
title: README の導入節を、リリースが実際に出す資産に合わせる
status: To Do
assignee: []
created_date: '2026-08-14 02:22'
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
- [ ] #1 リリースが出す各資産について、利用者に勧めるものと出さなくてよいものを判別し、判断の根拠を記録した
- [ ] #2 README 和英の導入節が、その OS の利用者にどれを取ればよいかを述べている（または bundle.targets を絞って選択肢そのものを減らした）
<!-- AC:END -->
