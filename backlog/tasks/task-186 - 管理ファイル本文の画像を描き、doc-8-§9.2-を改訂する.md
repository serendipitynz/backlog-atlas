---
id: TASK-186
title: 管理ファイル本文の画像を描き、doc-8 §9.2 を改訂する
status: In Progress
assignee: []
created_date: '2026-08-16 00:28'
updated_date: '2026-08-16 23:21'
labels:
  - 'kind:feature'
  - ui
  - taskdetail
  - designsystem
milestone: m-3
dependencies: []
priority: medium
ordinal: 177700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog CLI のブラウザモードは本文の画像を描くが（https://github.com/MrLesk/Backlog.md/issues/691）、Atlas は描かない。**doc-8 §9.2 が「画像は描かず、alt を文字として出す」と決めているためで、このタスクはその決定を改訂する。**

**§9.2 が挙げる 3 つの理由のうち 1 つ目は崩れた。** 「実測で管理ファイルに画像記法は 0 件」と書いてあるが、本リポジトリの TASK-82 の DESCRIPTION が `![](/assets/TASK-82.png)` を持つ（`1658abb`、2026-08-16）。**残る 2 つ — ローカル画像を描くには専用の読み出し許可を足すことになる・遠隔の画像を描くと台帳の内容がネットワークを叩く — は生きている**ので、改訂で決めるのは「描くか」ではなく「どこまで描くか」である。

**いまの画面には欠落の痕跡が出ない。** §9.2 は alt を文字として出す規則だが、CLI とブラウザモードが書く記法の alt は空なので、出す文字が無い。読み手は画像があること自体を知れない。

**Backlog CLI 側の解決規則は実測した**（v1.49.3 の実行ファイルの `handleAssetRequest`、2026-08-16）: `/assets/<名前>` を Backlog ディレクトリ配下の `assets/<名前>` へ解決し、`..` を含むものと、その配下から出るものを拒む。**Atlas が描くならこの規則を写す** — 別の解き方をすると、同じ台帳が 2 つの道具で違うものを指す。

**費用は CSP と asset protocol にある。** decision-28 の `img-src` は「Atlas にその能力が無い」ことを根拠に置かれた行で（`csp.rs` の `Moves::Absence`）、ローカルの画像を描くと Tauri の asset protocol の許可範囲と併せて動く。**decision-28 の各行は「失われるもの」を持つ形なので、改訂もその形で行う。**
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 doc-8 §9.2 が改訂され、描く範囲と描かない範囲が理由付きで書かれている
- [x] #2 /assets/<名前> を Backlog ディレクトリ配下の assets/<名前> へ解決する規則が doc に書かれ、.. を含むものとその配下から出るものを拒む
- [x] #3 decision-28 が改訂され、img-src の行が何を許し、失うと何が起きるかを持っている。csp.rs の期待値がそれと一致する
- [x] #4 描けなかった画像（不在・読取不能・拒んだ経路）が画面から分かる。alt が空でも欠落が分かる
- [x] #5 遠隔 URL の画像が決めたとおりに扱われる（描かないなら描かず、その理由が画面から分かる）
- [ ] #6 TASK-82 の DESCRIPTION の画像が実際に描かれることを、ユーザーの目視で確かめてある
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**オーナーが 2026-08-17 に確定した 2 点**が実装の形を決めた。**遠隔 (http/https) の画像は描かず、押せば 既定ブラウザ起動 に渡す**（doc-8 §9.3 の 本文リンク をそのまま使う）。**ローカルは IPC でバイトを受けて `blob:` を作る**（Tauri asset protocol は採らない）。どちらも不可能ではなく費用で選んだ — Tauri 2.11.5 は `asset_protocol_scope()` の実行時 `allow_directory` を持つが、登録プロジェクトが複数ある Atlas ではスコープを追随させ続けることになり、webview が画像に限らず fetch できる protocol が 1 つ増える。

**CLI v1.49.3 の `handleAssetRequest` は実行ファイルを直接読んで実測した**（2026-08-17）。順序は decode → `/assets/` 接頭辞 → `..` を部分文字列として拒む → `assets/` 配下から出れば拒む → 不在。**`..` を区切りでなく部分文字列で見るのは CLI がそうしているから**で、広いほうを写した。**decode を先に置くのが規則の一部**である — markdown-it が src を percent-encode するので、これが無いと `/assets/図.png` が常に不在になり、逆に `%2e%2e` が `..` の検査をすり抜ける。

**拡張子→媒体型 の表は画面側に置いた。** `tauri::ipc::Response` の本体は `Json` か `Raw` のどちらか 1 つで、媒体型とバイトを 1 回で返すと `Vec<u8>` が数値配列になる（80KB の PNG で約 370KB）。境界が持つのは 経路の門 と 実在・可読 だけで、表は 1 か所のままである。SVG だけは `Blob` に媒体型の宣言が要る（他はエンジンが sniff する）ので、表そのものは省けない。

**CSP は `img-src blob:` の 1 行を新設した**（decision-28 §2 に 5 つ目の種別 機能の source を足した）。`'self'` は書いていない — Atlas は自前の画像を 1 枚も持たない（`<img>` 0 件、`url(` は vendored な `ace.js` の外に 0 件）。`data:` も書いていない — 本文が書いた `data:` 画像まで通る。**`ace.js` の CSS が持つ `url("data:image/…")` の背景は、`img-src` 不在の現状でも `default-src 'self'` に拒まれており、この行を足しても拒まれ続ける**ので、編集部品 の見え方は動かない。

**これは decision-28 §4 の「消えれば画面が自分で言う行は 1 つも無い」を覆す 1 件目である。** 出荷形（応答ヘッダ）で両エンジンに当てて実測した（`_sandbox/csp-check/measure-img-src.mjs`）: 出荷値は `load`・`naturalWidth` 1・違反 0 件、`img-src` を落とすと `error`・0・違反 1 件、`img-src 'self'` へ替えても同じ。**`error` まで測ったのは、`markdown-image.ts` がその事象で 状態の印 を戻すからである。** 変異試験も 14 → 17 種類へ組み直して全部落ちることを確かめた（在る行には「落とす」だけでなく「別の source へ替える」が要る）。

**描画の形は 作図結果 (doc-11 §14.5) と同じ**で、`markdown.ts` が 状態の印 を出し、`markdown-image.ts` がバイトの届いたものだけを `<img>` に置き換える。**したがって描画に失敗経路は無い。** `<img>` は `load` を待たずに差し込み、`error` で印を戻す — 待つと `jsdom` が資源を読み込まないため試験が落ちるのではなく固まる。

**`lucide.ts` に `line` という図形の種類が増えた**（`image-off` の 1 つ目）。`drawnShape` の網羅 switch が止まって気づく設計どおりだったが、**`lucide.test.ts` の側は素通りした** — 要素を `/<(path|rect|circle)\b/g` で数えており、新しい種類は数に入らないまま空の一覧どうしを比べて通っていた。名前の列挙をやめ、`<svg>` 以外の全要素を数える形へ直した。

**残るのは AC #6 のみ**（TASK-82 の DESCRIPTION の画像が実際に描かれることの目視）。
<!-- SECTION:NOTES:END -->
