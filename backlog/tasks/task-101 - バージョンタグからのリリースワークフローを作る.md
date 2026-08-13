---
id: TASK-101
title: バージョンタグからのリリースワークフローを作る
status: Done
assignee: []
created_date: '2026-07-31 23:34'
updated_date: '2026-08-13 20:59'
labels:
  - release
  - 'kind:chore'
milestone: m-2
dependencies:
  - TASK-95
  - TASK-96
  - TASK-99
  - TASK-100
  - TASK-104
priority: high
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
~/Projects/_snz/mallow の .github/workflows/release.yml を範に、v* タグの push（または手動実行）で draft release を作り、matrix ビルドで各プラットフォームのバンドルを release id 指定でアップロードする構成にする。mallow は tauri.conf.json の version とタグの食い違いをビルド前に落とす検査、release id 指定で matrix が release 作成を競合しない構成、.github/release.yml でのリリースノート分類も持っているので、そこも踏襲する。バンドルの対象プラットフォームは TASK-99 の判断結果に従う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 v* タグの push で draft release が作られ、各プラットフォームのバンドルが添付される
- [x] #2 タグと tauri.conf.json / package.json の version が食い違う場合、ビルド前に失敗する
- [x] #3 matrix ジョブが release 作成で競合しない
- [x] #4 リリースノートがマージ済み Pull Request から生成される
- [x] #5 手動実行でも同じ結果になる
- [x] #6 CI が Node の版を直書きせず node-version-file: .node-version を読む
- [x] #7 TASK-104 が updater を持つと判断した場合、v0.1.0 のバンドルへ updater の受け皿（署名鍵の参照と更新エンドポイントの設定）が入っており、持たないと判断した場合は入っていない。どちらの分岐を採ったかがワークフローまたは tauri.conf.json のコメントから読める
- [x] #8 matrix ビルドが作る 3 OS のバンドルにアプリアイコンが入っていることをワークフロー自身が検査し、欠けていればビルドを落とす（macOS は .app の Contents/Resources/icon.icns、Linux は .deb の hicolor 配下、Windows は実行ファイルへ埋め込まれた icon.ico のバイト列）。TASK-96 が 2026-08-12 に 3 OS とも実機で確認済みなので、これは回帰防止であって初回確認ではない
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
.github/workflows/release.yml と .github/release.yml を新規に置いた。範にしたのは ~/Projects/_snz/mallow の release.yml で、引いたのは 3 つ（タグと manifest の版の突き合わせ、release id 指定で matrix が release 作成を競合しない構成、.github/release.yml でのリリースノート分類）。踏襲しなかったのは Node の直書きで、AC #6 のとおり node-version-file: .node-version を読む。pnpm も版を書かず packageManager を読ませている。突き合わせる manifest は mallow の 3 つに Cargo.lock を足した 4 つにした。ビルドは --locked を渡さないので、古い lock は落ちずにビルド中に書き換えられ、タグがビルドの使わなかった木を指すことになるためである。

AC #7 は decision-30 の「持たない」側で満たした。tauri.conf.json には plugins.updater も bundle.createUpdaterArtifacts も置かず、どちらの分岐を採ったかはワークフロー冒頭のコメントが decision-30・decision-26 を名指して述べる。

AC #8 の 3 検査は、いずれも寸法も offset も書かず、コミット済みの元ファイルと突き合わせる形にした。アイコンは TASK-96 の実測後に一度作り直されており、icon.ico の最大エントリは 128892 バイト・ico 内 offset 24334 から 130704 バイト・offset 25066 へ変わっている。記録した数値を検査に書くと、作り直すたびに測り直しが要る。macOS は .app/Contents/Resources/icon.icns を cmp（バンドラは icns をそのまま写し、署名が書くのは _CodeSignature/ だけなので、署名済みでもバイト同一である。手元の署名済み .app で実際に確かめた）。Linux は .deb を dpkg-deb -x で展開して hicolor/128x128/apps/<name>.png を cmp。<name> は書かずに .desktop の Icon= から取る — アイコン探索が解決するのはその名前なので、別名で置かれた 1 枚は「入っているが表示されない」状態だからである。256x256@2 を見ないのは指示書の注意のとおりで、そのディレクトリだけにアイコンがある木を作って落ちることも確かめた。Windows は icon.ico の最大エントリのバイト列を exe の中から探す（TASK-96 が実機で使った方法）。

決めた点が 2 つある。1 つは macOS 署名シークレットが未登録のときの扱いで、mallow は notarize の段で落ちるままにしているが、こちらは下書きを作るジョブの最初で 6 件を検査して落とす。実行が成果物 1 つも生まれる前に止まるので、Windows と Linux の資産だけが付いた下書きが残らない。未署名の macOS バンドルは、無いよりも悪い — Gatekeeper に拒否される時点で利用者は既にそれを取得している。もう 1 つは Linux ランナーの版で、mallow は AppImage の glibc 下限を下げるため ubuntu-22.04 に固定しているが、こちらは README が述べる下限が 24.04 なので ubuntu-24.04 に固定した。ubuntu-latest にすると、何も落ちないまま下限が文書より上がる。

pnpm test はワークフローに入れていない。TASK-150 の断続的な timeout が、ビルドに無い欠陥でリリースをランダムに落とすためである。理由はワークフロー冒頭と AGENTS に書いた。指示書が注意していた ignored 4 件（実物の CLI・ファイル監視・認証済み gh）も、したがって回さない。

手元で確かめたのは、版の突き合わせ（一致・不一致の両方）、シークレット検査（6 件揃い・1 件欠け・全欠けの 3 通り、sh と bash の両方）、macOS のアイコン検査（実際の署名済み .app・別の icns・.app 不在）、Linux のアイコン検査（正常・バイト相違・.desktop が名指さない名前・256x256@2 だけにある場合）、Windows のアイコン検査（埋め込みあり・なし・exe 不在）。Windows の段を PowerShell でなく Python にしたのはこのためで、GitHub のランナーはどちらも持っている。ワークフロー全体の実行そのものは、タグを打つまで確かめられない。

AGENTS 和英に 3 件足した。リリースの作り方（下書きの公開は手作業のまま、細部でなく判断である 3 点）、署名名義が copyright と揃わないのは意図的であること（2026-08-14 のユーザーの確定。指示書は m-2 で終わるので恒久の置き場が要る）、そして Linux の開発パッケージ一覧の置き場が 1 つから 2 つになったこと。3 つ目は既存の規則を変えている。ワークフローの Linux ランナーは、どの段が散文を読むより先にパッケージを入れる必要があり、一覧を README から機械的に引けないためである。
<!-- SECTION:NOTES:END -->
