---
id: TASK-193
title: AGENTS の Release 節を配布・リリース層の doc へ移し、AGENTS はポインタだけ持つ
status: To Do
assignee: []
created_date: '2026-08-18 20:39'
labels:
  - docs
  - release
  - 'kind:chore'
milestone: m-3
dependencies: []
priority: medium
ordinal: 184700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`AGENTS.md` の Release 節一式が、リリースする回にしか読まれないのに毎セッション読まれている。
配布・リリース層の正本を doc へ移し、AGENTS にはポインタだけ残す。

**実測（2026-08-19、`AGENTS.md` 41,548 文字）**

- **毎セッション読まれるのは `AGENTS.md` だけである。** `CLAUDE.md` はそれへの symlink で、
  `AGENTS.ja.md` は開いたときにしか読まれない。日本語版は 1 文字あたりのトークン単価が高い
  （多バイト 52%、概算 16,300 トークン）が、常時課金されているのは英語版の**概算 10,600 トークン**である。
- **Release 節一式は 15,064 文字で、`AGENTS.md` の 36% を占める。** 内訳は Release 918・
  Producing a release 3,623・**Third-party notices 5,950**・Bundle metadata 2,313・
  macOS signing and notarization 2,260。
- **m-3 の 41 件のうちリリースは TASK-181 の 1 件である。** つまりこの約 3,800 トークンは
  40 回払って 1 回使っている。

**移す理由は節の長さではなく、正本が無いことである。** `backlog/docs/` は doc-1〜12 まで
**全部が画面と読み書き層の設計**で、配布・リリース層の正本が 1 つも無い。そのため AGENTS が
正本を兼ねており、36% はその帰結である。同じ層の知識は `.github/workflows/release.yml`・
`scripts/generate-third-party-licenses.mjs`・`scripts/macos-*.sh` にも散っている。

**決定先行として扱う。** doc の新設は契約の変更である。加えて Release 節の中には
「この workflow について 6 つは詳細ではなく決定である」と自ら述べている塊があり、
**doc へ移すものと decision として起こすものの切り分けが着手時の判断になる。**

**着手時に確かめること**

- **ポインタに要約を置かない。** 要約があると読まずに素通りされ、移した意味が消える。
  「リリースの回は最初に doc-N を読む」という形にする。
- **`AGENTS.md` と `AGENTS.ja.md` は同内容でなければならない**（AGENTS 自身の規則）ので、
  両方を同時に動かす。
- **doc の本文は `backlog doc update <id> --content` で書く**（往復はバイト同一）。
  decision を起こすなら本文は直接編集（decision-27 §7 を書いた TASK-162 と同じ）。
- **移した後に `AGENTS.md` の文字数を測り直し、削減額を Implementation Notes に書く。**
  見込みは約 3,500 トークン（33%）だが、ポインタの長さで変わるので実測する。

**削らないと判断したもの（TASK-162 の回に測った）**

- **Coding style の 9 bullet のうち 5 つがグローバル `~/.claude/CLAUDE.md` と逐語で重なる**
  （約 900 文字 ≒ 250 トークン）。両方常時読まれるので純粋な二重払いだが、
  **decision-32 が「コーディング規約を AGENTS に明示する」と決めている**ので、
  消すには decision-32 の改訂が要る。額が釣り合わない。
- **Toolchain 後半の 7 bullet（約 4,400 文字）** は、読んだ人が欠陥だと誤認して壊すのを
  止めるために置かれている（`dragDropEnabled` の削除、航行ゲートを未使用と判断、
  `KNOWN_SCHEMA_VERSION` の上げ忘れ、About パネルのアイコン）。正本は decision-13/34/37/38 に
  あるが、**decision を開く動機は「そこに何かある」と知った後にしか生まれない**ので、
  AGENTS 側の 1 行を消すと参照経路ごと消える。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 配布・リリース層の正本となる doc が新設され、AGENTS の Release 節が持っていた内容がそこにある
- [ ] #2 AGENTS.md と AGENTS.ja.md の Release 節が、要約を持たないポインタになっている（両言語で同内容）
- [ ] #3 doc へ移すものと decision として起こすものの切り分けが済み、decision を起こしたならその理由が本文にある
- [ ] #4 移した後の AGENTS.md の文字数と概算トークンを測り直し、削減額が Implementation Notes に記録されている
- [ ] #5 リリース手順の記述が、workflow・scripts の実物と食い違っていないことを確かめてある
<!-- AC:END -->
