---
id: TASK-156
title: GUI 起動したアプリが PATH 上の backlog を解決できず、直す手段が画面に無い
status: Done
assignee: []
created_date: '2026-08-12 21:46'
updated_date: '2026-08-18 21:10'
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
- [x] #1 macOS で Finder / Dock から起動したアプリが、README の手順で導入された backlog を解決できる。解決できない場合は、利用者が画面から到達できる手段を持つ
- [x] #2 Windows・Linux で GUI 起動したときに CLI を解決できるかどうかが、実機の実測として記録されている
- [x] #3 README の導入要件が、GUI 起動でも成り立つ記述になっている
- [x] #4 decision-16（実行ファイル解決の順序）と decision-26（PATH 上 backlog の前提）のどちらを改訂したか、または改訂不要と判断した理由が記録されている
- [x] #5 設定画面から backlog・git・gh の実行ファイルを指定でき、その指定が実際の起動に使われる（decision-29 の外部コマンド指定）
- [x] #6 設定画面が、外部コマンドごとに現に解決されている実行ファイル・その出どころ・起動できるかどうかを示す（decision-29 の解決結果の表示）
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
対策を決めた（2026-08-13、ユーザーの判断）。**sidecar 同梱は採らず、外部エディタと同じ形で
各外部コマンドを GUI から指定できるようにする。** decision-29 が判断を持つ。

sidecar を採らなかった理由（AC #4）:

- 欠陥の範囲と対策の範囲が合わない。名前だけで起動している外部コマンドは 4 つあり（`backlog`・
  `git`・`gh`・外部エディタ）、同梱で塞がるのは 1 つだけである。`gh` は認証状態が利用者の設定に
  あるため同梱で代替できない。
- decision-26 の理由 3（版の整合）は本件で悪化する。当の利用者は現に `backlog` を導入して
  いるので、「2 つの CLI が同じルートを触る」が仮定でなく確定になる。
- decision-16 が用意していた回復手段（順序 1 段目のアプリ設定）が、設定画面に無いだけだった。
  出さない理由だった TASK-61〜79・75 は消化済みで、保留の根拠が消えていた。

**decision-26 は据え置くが、その理由 2 は訂正した。**「同梱は解けていない摩擦を解かない」は
シェル側 PATH 前提だけを見て書かれており、GUI 起動でプロセス側 PATH 前提が破れる事実の前では
維持できない。訂正は decision-26 の Context に、判断は decision-29 に置いた。

**起動時の PATH 回復は採らなかった**（ユーザーの判断）。4 つを一度に直せる唯一の手だが、
decision-16 が避けた「シェルを経由する」性質に隣接し、外部コマンド指定と違って利用者から
見えないため。見える指定手段を先に置く。

実測（このマシン、macOS、2026-08-13）:

- GUI 継承 PATH（`launchctl getenv PATH`）は 11 ディレクトリ。`backlog` の実体がある fnm の
  multishell ディレクトリを含まない。
- 同じ PATH に `/usr/bin`（`git`）と `/opt/homebrew/bin`（`gh`）は**入っている**。ただし
  このマシンの launchd PATH は customize 済みなので、`git`・`gh` が届いたのは偶然である。
  素の macOS の既定値は未実測のまま（AC #2 が残る）。

## 実機確認（2026-08-13、ユーザー）

**Windows: 確認済み。** アプリは動作し、外部コマンド区画は Backlog CLI ☑ / Git ☑ /
**GitHub CLI ⚠️（未解決・不整合の族の色）** を示した。**未解決の描き方が実機で確認できた**のは
`gh` 未導入の環境だったためで、macOS 側では `backlog` を一時的にリネームして同じ状態を作った。

**同じ画面で「起動できる／版が要件未満」が同時に出た。** 上部帯が
`backlog CLI 1.48.0 は動作確認範囲外です（必要: 1.49.3 以上）。作成・更新は発行できません` を
出しているとき、外部コマンド区画の Backlog CLI は ☑ だった。**decision-29 が「この表示が答えるのは
起動したか、縮退帯が答えるのは最低バージョン要件を満たすか であり、食い違いではなく 2 つの真である」
と書いた場面が、そのまま実機で出たことになる。** 当初「1 つのプログラムについて 2 つの答えを同じ画面へ
出すと食い違う」として `backlog` を区画から外していた判断は、これで二重に否定された。

**Linux（WSL Ubuntu 24）: 未実測。**`pnpm tauri dev` が GTK の初期化で panic して起動しない
（`Failed to initialize gtk backend!` / `gtk::rt::init`）。**これは Atlas の欠陥ではなく表示先が
無いことを指す**ので、WSLg が有効かどうかの問題である。**したがって Linux の GUI 起動時の PATH 継承は
測れていない。**

**そもそも WSL は素の Ubuntu デスクトップの代理にならない**（起動前から述べていた懸念）。
WSL には GDM のようなログインマネージャも通常のデスクトップセッションも無く、ランチャー起動時の
PATH の出どころが実機と同じとは限らない。**TASK-75 が預けた `xdg-open` の確認も同様で**、WSL では
`xdg-open` が `wslview` 経由で Windows のエクスプローラを開く構成が多く、Linux のファイルマネージャが
開くかどうかの答えにならない。

**decision-16 順序 2 が実機で働いていることを、初めて直接観測した**（2026-08-13、Windows）。
Backlog CLI 行の `?` が出どころを `npm の配置から解決` とし、実行ファイルを
`C:\Users\<user>\AppData\Local\fnm_multishells\<PID>_<時刻>\node_modules\backlog.md\node_modules\backlog.md-windows-x64\backlog.exe`
と示した。**TASK-60 の 2026-08-01 の実機確認は「縮退帯が消え、編集が管理ファイルへ届いた」
という結果からの確認で、どの段が解決したかは見えていなかった。** 観測できるようになったのは
解決結果の表示（decision-29）ができたためで、当たった候補（shim の隣の `node_modules` ×
`backlog.md` の下に入れ子）は decision-16 の Consequences に記録した。
**同時に、この環境の PATH に `backlog.exe` が無いことも裏付けられた** — 在れば順序 2 は使われない。

**TASK-75 が預けた確認のうち Windows 分をここで引き取った**（2026-08-13）。設定画面の 場所を開く で
エクスプローラが実際に開くことを Windows 実機で確認し、TASK-75 の Implementation Notes へ記録した。
**Linux 分（`xdg-open`）は残る。**

**AC #2 の Linux 分は Ubuntu VM で測ると決まった**（2026-08-13、ユーザーの判断。案 A）。
WSL の結果を実測として記録する案（案 C）と、未実測のまま閉じて別タスクへ切り出す案（案 B）は
採らない。**したがって本タスクは Ubuntu VM での実測待ちであり、それまで PR を作らない。**

## Linux の実測（2026-08-13、Ubuntu VM。ユーザー）

**再現した。同じビルド・同じマシンで、起動経路だけが結果を分けた。**

| 起動 | Backlog CLI | Git | GitHub CLI |
|---|---|---|---|
| `pnpm tauri dev`（シェルから） | 解決した | — | — |
| アプリセンター（`.deb` が入れた `.desktop`） | **解決できない** | 解決した | **解決できない** |

縮退帯は「backlog CLI の実行ファイルを解決できません」で、外部コマンド区画の Backlog CLI 行は
`PATH から解決: backlog` ／ `起動できません（backlog を起動できません（No such file or directory
(os error 2)））`。node は fnm 経由で入れ、`backlog` はその上の `npm -g` で入れてある。

**3 行が導入経路で割れたことが、この実測の要点である。** 同じセッションの同じ PATH の下で、
apt 導入の `git`（`/usr/bin`）は解決し、fnm + npm 導入の `backlog`・`gh` は解決しない。
**PATH が空なのではなく、バージョン管理ツールが置いた場所だけが入っていない。**

**macOS の実測に残っていた穴が、こちらには無い。** あちらは `.app` と `open <実行ファイル>` の比較で、
`open` が何を継承したのかを確かめていなかった（Description の「まだ確かめていないこと」）。
こちらは `pnpm tauri dev`（シェルの子プロセス）と `.desktop` からの起動（デスクトップセッションの
子プロセス）という、素性のはっきりした 2 経路の比較である。

**Ubuntu 24 は既定が Wayland で、セッションの環境は systemd user session から来る。** fnm は
`~/.bashrc` に書くので、対話シェル以外には届かない。**したがってこれは Atlas 固有ではなく、
バージョン管理ツールで node を入れた利用者に一般に起きる。**

**未測定として残すもの**: 走っているプロセス自身の PATH（`/proc/<pid>/environ`）は取っていない。
起動失敗が `No such file or directory` である以上、PATH に無いことは確かだが、
**セッションの PATH の中身そのものは記録していない**（macOS 側は `launchctl getenv PATH` を記録済み）。
<!-- SECTION:NOTES:END -->
